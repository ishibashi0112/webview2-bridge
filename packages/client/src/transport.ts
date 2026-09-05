/**
 * Transport 抽象と JSON-RPC 2.0 サブセットの型（HANDOFF.md §5）。
 * Transport はワイヤ形式だけを知り、契約（zod）は知らない。契約は createClient が扱う。
 */

/** Host → Web のイベントは JSON-RPC notification の method `event.<name>` で届く */
export const EVENT_METHOD_PREFIX = "event.";

export interface Transport {
  /** `<namespace>.<name>` を呼び、result を返す。error 応答は BridgeError として reject する */
  call(method: string, params: unknown): Promise<unknown>;
  /** イベント（短い名前。`progress` など）を購読する。戻り値は解除関数 */
  on(event: string, handler: (params: unknown) => void): () => void;
}

export type JsonRpcId = string | number;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export const JsonRpcErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** アプリ定義エラーの既定値。VB 側の例外はこのコードで届く */
  ServerError: -32000,
} as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  return isRecord(msg) && msg["jsonrpc"] === "2.0" && typeof msg["method"] === "string" && !("id" in msg);
}

export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
  return isRecord(msg) && msg["jsonrpc"] === "2.0" && "id" in msg && ("result" in msg || "error" in msg);
}

export function isJsonRpcErrorResponse(msg: JsonRpcResponse): msg is JsonRpcErrorResponse {
  return "error" in msg && isRecord(msg.error);
}

export function eventMethod(eventName: string): string {
  return `${EVENT_METHOD_PREFIX}${eventName}`;
}

/** `event.progress` → `progress`。イベントでなければ undefined */
export function eventNameFromMethod(method: string): string | undefined {
  return method.startsWith(EVENT_METHOD_PREFIX) ? method.slice(EVENT_METHOD_PREFIX.length) : undefined;
}

/** イベント購読者の管理（各 Transport 実装で共用） */
export class EventListeners {
  private readonly listeners = new Map<string, Set<(params: unknown) => void>>();

  add(event: string, handler: (params: unknown) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
      if (set?.size === 0) this.listeners.delete(event);
    };
  }

  dispatch(event: string, params: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) handler(params);
  }

  clear(): void {
    this.listeners.clear();
  }
}
