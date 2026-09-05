import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BridgeDisposedError, BridgeError, BridgeTimeoutError, WebView2Transport, type WebView2Like } from "../src/index.js";

class FakeWebView implements WebView2Like {
  readonly sent: unknown[] = [];
  private readonly listeners = new Set<(e: { data: unknown }) => void>();
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  addEventListener(_: "message", l: (e: { data: unknown }) => void): void {
    this.listeners.add(l);
  }
  removeEventListener(_: "message", l: (e: { data: unknown }) => void): void {
    this.listeners.delete(l);
  }
  receive(data: unknown): void {
    for (const l of this.listeners) l({ data });
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

describe("WebView2Transport", () => {
  let wv: FakeWebView;
  let t: WebView2Transport;
  beforeEach(() => {
    vi.useFakeTimers();
    wv = new FakeWebView();
    t = new WebView2Transport({ webview: wv, timeoutMs: 1000 });
  });
  afterEach(() => {
    t.dispose();
    vi.useRealTimers();
  });

  it("posts a JSON-RPC request object and resolves with result", async () => {
    const p = t.call("parts.search", { keyword: "x" });
    expect(wv.sent).toHaveLength(1);
    const req = wv.sent[0] as { jsonrpc: string; id: string; method: string; params: unknown };
    expect(req).toMatchObject({ jsonrpc: "2.0", method: "parts.search", params: { keyword: "x" } });
    expect(typeof req.id).toBe("string");
    wv.receive({ jsonrpc: "2.0", id: req.id, result: { items: [] } });
    await expect(p).resolves.toEqual({ items: [] });
    expect(t.pendingCount).toBe(0);
  });

  it("rejects with BridgeError on error response", async () => {
    const p = t.call("parts.search", {});
    const req = wv.sent[0] as { id: string };
    wv.receive({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found", data: null } });
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe(-32601);
    expect((err as BridgeError).method).toBe("parts.search");
  });

  it("accepts string payloads (PostWebMessageAsString) and ignores unrelated messages", async () => {
    const p = t.call("a.b", null);
    const req = wv.sent[0] as { id: string };
    wv.receive("not json");
    wv.receive({ hello: "world" });
    wv.receive({ jsonrpc: "2.0", id: "other", result: 1 });
    wv.receive(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: 42 }));
    await expect(p).resolves.toBe(42);
  });

  it("times out", async () => {
    const p = t.call("slow.op", {});
    const rejected = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await rejected).toBeInstanceOf(BridgeTimeoutError);
    expect(t.pendingCount).toBe(0);
  });

  it("dispatches notifications to subscribers", () => {
    const seen: unknown[] = [];
    const off = t.on("event.progress", (p) => seen.push(p));
    wv.receive({ jsonrpc: "2.0", method: "event.progress", params: { percent: 5 } });
    wv.receive({ jsonrpc: "2.0", method: "event.other", params: {} });
    expect(seen).toEqual([{ percent: 5 }]);
    off();
    wv.receive({ jsonrpc: "2.0", method: "event.progress", params: { percent: 6 } });
    expect(seen).toHaveLength(1);
  });

  it("dispose rejects pending calls and removes the listener", async () => {
    const p = t.call("a.b", {}).catch((e: unknown) => e);
    t.dispose();
    expect(await p).toBeInstanceOf(BridgeDisposedError);
    expect(wv.listenerCount).toBe(0);
    await expect(t.call("a.b", {})).rejects.toBeInstanceOf(BridgeDisposedError);
  });

  it("throws when WebView2 is unavailable", () => {
    expect(() => new WebView2Transport()).toThrow(/webview/);
    expect(WebView2Transport.isAvailable()).toBe(false);
  });
});
