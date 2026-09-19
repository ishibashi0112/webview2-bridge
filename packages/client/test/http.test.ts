import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  BridgeDisposedError,
  BridgeError,
  BridgeTimeoutError,
  BridgeValidationError,
  HttpTransport,
  createClient,
} from "../src/index.js";
import { contract, parts } from "./fixtures.js";

// ---------------------------------------------------------------- 契約を HTTP で提供する最小サーバー（openapi.json の形）
//   POST /api/parts/search  body = input → 200 body = output / 4xx,5xx body = { code, message, data }
//   GET  /api/events        text/event-stream。data: に JSON-RPC 通知

interface SseClient {
  res: ServerResponse;
}

let server: Server;
let baseUrl: string;
const sseClients = new Set<SseClient>();
const seenHeaders: Record<string, string | undefined>[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c: Buffer) => (s += c.toString("utf8")));
    req.on("end", () => resolve(s));
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function emitToAll(method: string, params: unknown): void {
  const line = `data: ${JSON.stringify({ jsonrpc: "2.0", method, params })}\n\n`;
  for (const c of sseClients) c.res.write(line);
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    seenHeaders.push({ authorization: req.headers.authorization, accept: req.headers.accept });
    const url = req.url ?? "";
    if (req.method === "GET" && url === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      res.write(": hello\n\n"); // コメント行は無視されること
      const client: SseClient = { res };
      sseClients.add(client);
      req.on("close", () => sseClients.delete(client));
      return;
    }
    if (req.method !== "POST") return json(res, 405, { code: -32600, message: "POST only" });
    const body = await readBody(req);
    if (url === "/api/parts/search") {
      const input = JSON.parse(body) as { keyword: string; limit?: number };
      if (input.keyword === "boom") return json(res, 500, { code: -32000, message: "Simulated failure", data: "System.InvalidOperationException" });
      if (input.keyword === "html") {
        res.writeHead(502, { "content-type": "text/html" });
        return res.end("<h1>Bad Gateway</h1>");
      }
      if (input.keyword === "badshape") return json(res, 200, { nope: true });
      if (input.keyword === "slow") return; // 応答しない（タイムアウト確認用。接続は afterAll の close で切れる）
      emitToAll("event.progress", { percent: 100 });
      return json(res, 200, { items: parts.filter((p) => p.name.includes(input.keyword)).slice(0, input.limit ?? 99) });
    }
    if (url === "/api/parts/typo") return json(res, 400, { code: -32602, message: "Invalid params: keyword" });
    return json(res, 404, { code: -32601, message: `Method not found: ${url}` });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`;
});

afterAll(async () => {
  for (const c of sseClients) c.res.end();
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
});

const transports: HttpTransport[] = [];
function make(opts: Partial<ConstructorParameters<typeof HttpTransport>[0]> = {}): HttpTransport {
  const t = new HttpTransport({ baseUrl, ...opts });
  transports.push(t);
  return t;
}
afterEach(() => {
  for (const t of transports.splice(0)) t.dispose();
  seenHeaders.length = 0;
});

async function waitFor(pred: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("HttpTransport against a real HTTP server", () => {
  it("POSTs to <baseUrl>/<ns>/<name> and returns the JSON body", async () => {
    const t = make();
    expect(t.urlFor("parts.search")).toBe(`${baseUrl.replace(/\/$/, "")}/parts/search`);
    const r = await t.call("parts.search", { keyword: "M6", limit: 1 });
    expect(r).toEqual({ items: [parts[0]] });
  });

  it("works through createClient with zod validation on both ends", async () => {
    const client = createClient(contract, make());
    const r = await client.parts.search({ keyword: "Washer" });
    expect(r.items.map((p) => p.partNo)).toEqual(["B-100"]);
    await expect(client.parts.search({ keyword: "badshape" })).rejects.toBeInstanceOf(BridgeValidationError);
  });

  it("maps JSON-RPC error bodies to BridgeError with the same code", async () => {
    const t = make();
    const e = (await t.call("parts.search", { keyword: "boom" }).catch((x: unknown) => x)) as BridgeError;
    expect(e).toBeInstanceOf(BridgeError);
    expect(e.code).toBe(-32000);
    expect(e.message).toBe("Simulated failure");
    expect(e.data).toBe("System.InvalidOperationException");
    expect(e.method).toBe("parts.search");

    const nf = (await t.call("parts.missing", {}).catch((x: unknown) => x)) as BridgeError;
    expect(nf.code).toBe(-32601);
    const ip = (await t.call("parts.typo", {}).catch((x: unknown) => x)) as BridgeError;
    expect(ip.code).toBe(-32602);
  });

  it("wraps non-JSON failures (proxy HTML) as -32603 with the status", async () => {
    const e = (await make().call("parts.search", { keyword: "html" }).catch((x: unknown) => x)) as BridgeError;
    expect(e).toBeInstanceOf(BridgeError);
    expect(e.code).toBe(-32603);
    expect(e.message).toContain("502");
    expect(e.data).toMatchObject({ status: 502, body: "<h1>Bad Gateway</h1>" });
  });

  it("sends custom headers (static and async) with calls and the event stream", async () => {
    const t = make({ headers: async () => ({ authorization: "Bearer abc" }) });
    await t.call("parts.search", { keyword: "x" });
    t.on("event.progress", () => {});
    await waitFor(() => seenHeaders.length >= 2);
    expect(seenHeaders.map((h) => h.authorization)).toEqual(["Bearer abc", "Bearer abc"]);
    expect(seenHeaders.find((h) => h.accept === "text/event-stream")).toBeDefined();
  });

  it("receives server events over SSE, lazily connects, and stops on dispose", async () => {
    const t = make();
    expect(t.eventsConnected).toBe(false);
    const seen: unknown[] = [];
    const off = t.on("event.progress", (p) => seen.push(p));
    expect(t.eventsConnected).toBe(true);
    await waitFor(() => sseClients.size === 1);
    await t.call("parts.search", { keyword: "Bolt" }); // サーバーが progress を配る
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual([{ percent: 100 }]);
    emitToAll("event.other", { ignored: true });
    emitToAll("event.progress", { percent: 7 });
    await waitFor(() => seen.length === 2);
    off();
    t.dispose();
    await waitFor(() => sseClients.size === 0);
    expect(t.eventsConnected).toBe(false);
  });

  it("reconnects after the server closes the stream", async () => {
    const t = make({ events: { retryMs: 20 } });
    const seen: unknown[] = [];
    t.on("event.progress", (p) => seen.push(p));
    await waitFor(() => sseClients.size === 1);
    for (const c of sseClients) c.res.end();
    await waitFor(() => sseClients.size === 0);
    await waitFor(() => sseClients.size === 1);
    emitToAll("event.progress", { percent: 1 });
    await waitFor(() => seen.length === 1);
  });

  it("events: false makes on() a no-op", async () => {
    const t = make({ events: false });
    const off = t.on("event.progress", () => {});
    expect(t.eventsConnected).toBe(false);
    off();
  });

  it("rejects pending calls on dispose and refuses new ones", async () => {
    const t = make();
    const p = t.call("parts.search", { keyword: "slow" }).catch((x: unknown) => x);
    await new Promise((r) => setTimeout(r, 20));
    t.dispose();
    expect(await p).toBeInstanceOf(BridgeDisposedError);
    await expect(t.call("parts.search", { keyword: "x" })).rejects.toBeInstanceOf(BridgeDisposedError);
  });
});

describe("HttpTransport with a fake fetch", () => {
  it("times out with BridgeTimeoutError and aborts the request", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const fetchFn = ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        })) as typeof fetch;
      const t = new HttpTransport({ baseUrl: "http://x/api", fetch: fetchFn, timeoutMs: 500, events: false });
      const p = t.call("a.b", {}).catch((x: unknown) => x);
      await vi.advanceTimersByTimeAsync(500);
      expect(await p).toBeInstanceOf(BridgeTimeoutError);
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("wraps network failures as -32603", async () => {
    const fetchFn = (() => Promise.reject(new TypeError("Failed to fetch"))) as typeof fetch;
    const t = new HttpTransport({ baseUrl: "http://x", fetch: fetchFn, events: false });
    const e = (await t.call("a.b", {}).catch((x: unknown) => x)) as BridgeError;
    expect(e.code).toBe(-32603);
    expect(e.message).toContain("Failed to fetch");
  });

  it("sends {} when params is undefined and treats an empty 200 body as undefined", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body });
      return Promise.resolve(new Response("", { status: 200 }));
    }) as typeof fetch;
    const t = new HttpTransport({ baseUrl: "http://x/api/", fetch: fetchFn, events: false });
    await expect(t.call("system.ping", undefined)).resolves.toBeUndefined();
    expect(calls).toEqual([{ url: "http://x/api/system/ping", body: "{}" }]);
  });
});
