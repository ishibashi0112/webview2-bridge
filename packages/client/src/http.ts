import {
  BridgeDisposedError,
  BridgeError,
  BridgeTimeoutError,
  isJsonRpcNotification,
  JsonRpcErrorCodes,
  ListenerMap,
  type JsonRpcErrorObject,
  type Transport,
} from "./transport.js";

export interface HttpTransportEventsOptions {
  /** SSE の path（baseUrl からの相対。既定 "/events"） */
  path?: string;
  /** 切断後に再接続するまでの待ち時間 ms（既定 3000） */
  retryMs?: number;
}

export interface HttpTransportOptions {
  /** `POST <baseUrl>/<namespace>/<method>` の baseUrl（例: "/api"、"http://localhost:8080/api"）。末尾の "/" は無視する */
  baseUrl: string;
  /** 省略時は globalThis.fetch */
  fetch?: typeof globalThis.fetch;
  /** 全要求に付けるヘッダ（認証など）。関数なら要求ごとに呼ぶ */
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** fetch の credentials（Cookie 認証なら "include"） */
  credentials?: RequestCredentials;
  /** 応答待ちの上限（既定 30000ms）。イベント購読には適用しない */
  timeoutMs?: number;
  /**
   * イベント（Host → Web 通知）の受け取り方。既定は `GET <baseUrl>/events` を Server-Sent Events として購読する。
   * サーバーがイベントを提供しないときは `false`（`on()` は何もしない購読解除関数を返す）
   */
  events?: false | HttpTransportEventsOptions;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_EVENTS_PATH = "/events";
const DEFAULT_RETRY_MS = 3_000;

/**
 * 契約を HTTP で提供するサーバー（OpenAPI: gen の `openapi` 出力）と話す transport。
 * WebView2Transport と同じ Transport なので、画面側のコードは変えずに差し替えられる。
 *
 * - `call("parts.search", params)` → `POST <baseUrl>/parts/search`、body = params（JSON）、200 の body = result
 * - 4xx / 5xx の body が JSON-RPC の error オブジェクト `{ code, message, data }` なら、そのまま BridgeError にする
 *   （VB ホストの -32602 / -32601 / -32000 と同じコードが届く）。それ以外の失敗は -32603 に包む
 * - イベントは `GET <baseUrl>/events`（text/event-stream）。各 `data:` は postMessage と同じ JSON-RPC 通知。
 *   最初の `on()` で接続し、切れたら retryMs 後につなぎ直す。`dispose()` で切る。
 *   EventSource ではなく fetch で読むので、認証ヘッダを call と同じように付けられる
 */
export class HttpTransport implements Transport {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly headers: HttpTransportOptions["headers"];
  private readonly credentials: RequestCredentials | undefined;
  private readonly timeoutMs: number;
  private readonly events: false | Required<HttpTransportEventsOptions>;
  private readonly listeners = new ListenerMap();
  private readonly inflight = new Set<AbortController>();
  private eventsAbort: AbortController | undefined;
  private disposed = false;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    const f = options.fetch ?? globalThis.fetch;
    if (typeof f !== "function") throw new Error("HttpTransport: fetch is not available; pass options.fetch");
    this.fetchFn = f;
    this.headers = options.headers;
    this.credentials = options.credentials;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.events =
      options.events === false
        ? false
        : {
            path: options.events?.path ?? DEFAULT_EVENTS_PATH,
            retryMs: options.events?.retryMs ?? DEFAULT_RETRY_MS,
          };
  }

  /** `parts.search` → `<baseUrl>/parts/search` */
  urlFor(method: string): string {
    return `${this.baseUrl}/${method.split(".").join("/")}`;
  }

  /** イベント購読中（SSE 接続を維持している）か */
  get eventsConnected(): boolean {
    return this.eventsAbort !== undefined;
  }

  async call(method: string, params: unknown): Promise<unknown> {
    if (this.disposed) throw new BridgeDisposedError(method);
    const controller = new AbortController();
    this.inflight.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const init: RequestInit = {
        method: "POST",
        headers: await this.buildHeaders({ "content-type": "application/json", accept: "application/json" }),
        body: JSON.stringify(params ?? {}),
        signal: controller.signal,
      };
      if (this.credentials !== undefined) init.credentials = this.credentials;

      let res: Response;
      try {
        res = await this.fetchFn(this.urlFor(method), init);
      } catch (e) {
        if (this.disposed) throw new BridgeDisposedError(method);
        if (timedOut) throw new BridgeTimeoutError(method, this.timeoutMs);
        throw new BridgeError(
          { code: JsonRpcErrorCodes.InternalError, message: `Network error: ${errorMessage(e)}`, data: undefined },
          method,
        );
      }
      const text = await res.text();
      if (res.ok) return text.length === 0 ? undefined : parseJson(text, method);
      throw new BridgeError(toErrorObject(res, text), method);
    } finally {
      clearTimeout(timer);
      this.inflight.delete(controller);
    }
  }

  on(method: string, handler: (params: unknown) => void): () => void {
    if (this.events === false) return () => {};
    const off = this.listeners.add(method, handler);
    this.ensureEventStream();
    return off;
  }

  /** 待機中の要求を reject し、イベント接続を閉じる。以降の call は BridgeDisposedError */
  dispose(): void {
    this.disposed = true;
    for (const c of this.inflight) c.abort();
    this.inflight.clear();
    this.eventsAbort?.abort();
    this.eventsAbort = undefined;
    this.listeners.clear();
  }

  private async buildHeaders(base: Record<string, string>): Promise<Headers> {
    const h = new Headers(base);
    const extra = typeof this.headers === "function" ? await this.headers() : this.headers;
    if (extra) new Headers(extra).forEach((v, k) => h.set(k, v));
    return h;
  }

  private ensureEventStream(): void {
    if (this.events === false || this.eventsAbort !== undefined || this.disposed) return;
    const controller = new AbortController();
    this.eventsAbort = controller;
    void this.runEventStream(controller, this.events);
  }

  private async runEventStream(controller: AbortController, events: Required<HttpTransportEventsOptions>): Promise<void> {
    const url = `${this.baseUrl}${events.path.startsWith("/") ? "" : "/"}${events.path}`;
    while (!controller.signal.aborted) {
      try {
        const init: RequestInit = {
          method: "GET",
          headers: await this.buildHeaders({ accept: "text/event-stream" }),
          signal: controller.signal,
        };
        if (this.credentials !== undefined) init.credentials = this.credentials;
        const res = await this.fetchFn(url, init);
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        await this.readSse(res.body, controller.signal);
      } catch (e) {
        if (controller.signal.aborted) break;
        console.error("[webview2-bridge] event stream failed; retrying", e);
      }
      if (controller.signal.aborted) break;
      await sleep(events.retryMs, controller.signal);
    }
  }

  /** text/event-stream を読み、`data:` の JSON を JSON-RPC 通知として配る */
  private async readSse(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let data: string[] = [];
    const flush = (): void => {
      if (data.length === 0) return;
      const text = data.join("\n");
      data = [];
      let msg: unknown;
      try {
        msg = JSON.parse(text);
      } catch {
        console.error("[webview2-bridge] ignoring non-JSON SSE data", text);
        return;
      }
      if (isJsonRpcNotification(msg)) this.listeners.dispatch(msg.method, msg.params);
    };
    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line === "") flush();
          else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
          // "event:" / "id:" / "retry:" / コメント行は使わない（通知の種類は JSON の method で判別する）
        }
      }
      flush();
    } finally {
      reader.releaseLock();
    }
  }
}

function parseJson(text: string, method: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new BridgeError(
      { code: JsonRpcErrorCodes.ParseError, message: `Invalid JSON in response: ${errorMessage(e)}`, data: text },
      method,
    );
  }
}

/** 失敗応答の body が JSON-RPC error なら採用し、そうでなければ HTTP ステータスから作る */
function toErrorObject(res: Response, text: string): JsonRpcErrorObject {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const o = parsed as Record<string, unknown>;
      if (typeof o["code"] === "number" && typeof o["message"] === "string") {
        return { code: o["code"], message: o["message"], data: o["data"] };
      }
    }
  } catch {
    // JSON でない body（プロキシの HTML 等）
  }
  return {
    code: JsonRpcErrorCodes.InternalError,
    message: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`,
    data: { status: res.status, body: text },
  };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done(): void {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}
