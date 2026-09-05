import {
  BridgeDisposedError,
  BridgeError,
  BridgeTimeoutError,
  isJsonRpcNotification,
  isJsonRpcResponse,
  ListenerMap,
  type JsonRpcRequest,
  type Transport,
} from "./transport.js";

/** `window.chrome.webview` のうち使う部分 */
export interface WebView2Like {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

export interface WebView2TransportOptions {
  /** 応答待ちの上限（既定 30000ms） */
  timeoutMs?: number;
  /** テスト用。省略時は window.chrome.webview */
  webview?: WebView2Like;
  /** 要求 id の生成。省略時は連番 + ランダム接頭辞 */
  idGenerator?: () => string;
}

declare global {
  interface Window {
    chrome?: { webview?: WebView2Like };
  }
}

export function getWebView2(): WebView2Like | undefined {
  if (typeof window === "undefined") return undefined;
  return window.chrome?.webview;
}

interface Pending {
  method: string;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * WebView2 の postMessage / message イベントに JSON-RPC を載せる transport。
 * Web → Host はオブジェクトをそのまま postMessage（Host は WebMessageAsJson で受ける）。
 * Host → Web は PostWebMessageAsJson（e.data がオブジェクト）を想定するが、
 * PostWebMessageAsString で JSON 文字列が来た場合も解釈する。
 */
export class WebView2Transport implements Transport {
  static isAvailable(): boolean {
    return getWebView2() !== undefined;
  }

  private readonly webview: WebView2Like;
  private readonly timeoutMs: number;
  private readonly nextId: () => string;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new ListenerMap();
  private disposed = false;

  constructor(options: WebView2TransportOptions = {}) {
    const webview = options.webview ?? getWebView2();
    if (!webview) {
      throw new Error("window.chrome.webview is not available (not running inside WebView2)");
    }
    this.webview = webview;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.nextId = options.idGenerator ?? createIdGenerator();
    this.webview.addEventListener("message", this.onMessage);
  }

  call(method: string, params: unknown): Promise<unknown> {
    if (this.disposed) return Promise.reject(new BridgeDisposedError(method));
    const id = this.nextId();
    const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeTimeoutError(method, this.timeoutMs));
      }, this.timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      try {
        this.webview.postMessage(request);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  on(method: string, handler: (params: unknown) => void): () => void {
    return this.listeners.add(method, handler);
  }

  /** message リスナを外し、待機中の要求をすべて reject する */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.webview.removeEventListener("message", this.onMessage);
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new BridgeDisposedError(p.method));
      this.pending.delete(id);
    }
    this.listeners.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  private readonly onMessage = (event: { data: unknown }): void => {
    let data = event.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data) as unknown;
      } catch {
        return; // このブリッジ宛てではない文字列メッセージ
      }
    }
    if (isJsonRpcResponse(data)) {
      if (data.id === null) {
        // Parse error 等、要求と対応づけられないエラー。待機中の要求は残す（タイムアウトで落ちる）
        console.error("[webview2-bridge] response without id", data);
        return;
      }
      const p = this.pending.get(String(data.id));
      if (!p) return;
      this.pending.delete(String(data.id));
      clearTimeout(p.timer);
      if ("error" in data) p.reject(new BridgeError(data.error, p.method));
      else p.resolve(data.result);
      return;
    }
    if (isJsonRpcNotification(data)) {
      this.listeners.dispatch(data.method, data.params);
    }
  };
}

function createIdGenerator(): () => string {
  // ページのリロード後も id が衝突しないよう、接頭辞にランダム値を付ける
  const prefix = Math.random().toString(36).slice(2, 8);
  let counter = 0;
  return () => `${prefix}-${++counter}`;
}
