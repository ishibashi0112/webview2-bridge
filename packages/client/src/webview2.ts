import { BridgeError, BridgeTimeoutError } from "./errors.js";
import {
  EventListeners,
  eventNameFromMethod,
  isJsonRpcErrorResponse,
  isJsonRpcNotification,
  isJsonRpcResponse,
  type JsonRpcRequest,
  type Transport,
} from "./transport.js";

/** `window.chrome.webview` のうち使う部分だけ。テストでは差し替える */
export interface WebView2Like {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export function getWebView2(): WebView2Like | undefined {
  const g = globalThis as { chrome?: { webview?: WebView2Like } };
  return g.chrome?.webview;
}

/** WebView2 の中で動いているか（Transport 選択に使う） */
export function hasWebView2(): boolean {
  return getWebView2() !== undefined;
}

export interface WebView2TransportOptions {
  /** 既定は window.chrome.webview */
  webview?: WebView2Like;
  /** 応答待ちのタイムアウト（ms）。既定 30000。0 以下で無制限 */
  timeoutMs?: number;
  /** 要求 id の接頭辞。既定はランダム（複数インスタンスでも id が衝突しないように） */
  idPrefix?: string;
}

interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * WebView2 の postMessage / WebMessageReceived を使う Transport。
 * Web → Host: `chrome.webview.postMessage(obj)`（Host は WebMessageAsJson で受ける）
 * Host → Web: `PostWebMessageAsJson(json)` → `message` イベントの `e.data`（既にオブジェクト）
 */
export class WebView2Transport implements Transport {
  private readonly webview: WebView2Like;
  private readonly timeoutMs: number;
  private readonly idPrefix: string;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new EventListeners();
  private seq = 0;
  private disposed = false;

  constructor(options: WebView2TransportOptions = {}) {
    const webview = options.webview ?? getWebView2();
    if (!webview) {
      throw new Error("WebView2 is not available: window.chrome.webview is undefined (not running inside WebView2?)");
    }
    this.webview = webview;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.idPrefix = options.idPrefix ?? Math.random().toString(36).slice(2, 8);
    this.webview.addEventListener("message", this.onMessage);
  }

  call(method: string, params: unknown): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error("WebView2Transport is disposed"));
    const id = `${this.idPrefix}-${++this.seq}`;
    return new Promise<unknown>((resolve, reject) => {
      const timer =
        this.timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id);
              reject(new BridgeTimeoutError(method, this.timeoutMs));
            }, this.timeoutMs)
          : undefined;
      this.pending.set(id, { method, resolve, reject, timer });
      const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      try {
        this.webview.postMessage(request);
      } catch (err) {
        this.settle(id)?.reject(err);
      }
    });
  }

  on(event: string, handler: (params: unknown) => void): () => void {
    return this.listeners.add(event, handler);
  }

  /** リスナを外し、待機中の呼び出しをすべて reject する */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.webview.removeEventListener("message", this.onMessage);
    for (const id of [...this.pending.keys()]) {
      this.settle(id)?.reject(new Error("WebView2Transport is disposed"));
    }
    this.listeners.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private settle(id: string): Pending | undefined {
    const p = this.pending.get(id);
    if (!p) return undefined;
    this.pending.delete(id);
    if (p.timer !== undefined) clearTimeout(p.timer);
    return p;
  }

  private readonly onMessage = (event: { data: unknown }): void => {
    let msg: unknown = event.data;
    if (typeof msg === "string") {
      try {
        msg = JSON.parse(msg);
      } catch {
        return; // このブリッジ宛てではないメッセージは無視
      }
    }
    if (isJsonRpcNotification(msg)) {
      const name = eventNameFromMethod(msg.method);
      if (name !== undefined) this.listeners.dispatch(name, msg.params);
      return;
    }
    if (isJsonRpcResponse(msg)) {
      if (msg.id === null) return;
      const p = this.settle(String(msg.id));
      if (!p) return;
      if (isJsonRpcErrorResponse(msg)) {
        p.reject(new BridgeError(msg.error.code, msg.error.message, msg.error.data, p.method));
      } else {
        p.resolve(msg.result);
      }
    }
  };
}
