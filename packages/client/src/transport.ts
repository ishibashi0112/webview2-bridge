import type { z } from "zod";

// ---------------------------------------------------------------- contract shape
// packages/gen の ContractDef と構造的に同じ。client は gen に依存しないよう、ここで再宣言する。

export interface MethodShape {
  input: z.ZodType;
  output: z.ZodType;
}

export interface ContractShape {
  methods: Record<string, Record<string, MethodShape>>;
  events: Record<string, z.ZodType>;
}

// ---------------------------------------------------------------- JSON-RPC 2.0 (HANDOFF.md §5)

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

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorObject;
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

/** Host → Web の通知（id なし）。イベントは method = "event.<name>" */
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
  /** アプリ定義エラーの既定値。VB 側の未処理例外はこのコード */
  ServerError: -32000,
} as const;

export const EVENT_PREFIX = "event.";

export function eventMethod(name: string): string {
  return `${EVENT_PREFIX}${name}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isJsonRpcResponse(v: unknown): v is JsonRpcResponse {
  return isRecord(v) && v["jsonrpc"] === "2.0" && "id" in v && ("result" in v || isRecord(v["error"]));
}

export function isJsonRpcNotification(v: unknown): v is JsonRpcNotification {
  return isRecord(v) && v["jsonrpc"] === "2.0" && !("id" in v) && typeof v["method"] === "string";
}

// ---------------------------------------------------------------- Transport

/**
 * 通信路の抽象。createClient はこれだけに依存する。
 * - call: 要求/応答。失敗は BridgeError（または派生）で reject
 * - on: 通知の購読。`method` は "event.progress" のような完全名。戻り値は購読解除関数
 */
export interface Transport {
  call(method: string, params: unknown): Promise<unknown>;
  on(method: string, handler: (params: unknown) => void): () => void;
}

// ---------------------------------------------------------------- errors

/** Host が JSON-RPC error を返した（または transport 層で同等の失敗が起きた） */
export class BridgeError extends Error {
  readonly code: number;
  readonly data: unknown;
  readonly method: string | undefined;

  constructor(error: JsonRpcErrorObject, method?: string) {
    super(error.message);
    this.name = "BridgeError";
    this.code = error.code;
    this.data = error.data;
    this.method = method;
  }
}

/** 応答が timeoutMs 以内に返らなかった */
export class BridgeTimeoutError extends BridgeError {
  constructor(method: string, timeoutMs: number) {
    super({ code: JsonRpcErrorCodes.InternalError, message: `Timeout after ${timeoutMs}ms: ${method}` }, method);
    this.name = "BridgeTimeoutError";
  }
}

/** transport が破棄された（ページ遷移など）ため応答を待てない */
export class BridgeDisposedError extends BridgeError {
  constructor(method: string) {
    super({ code: JsonRpcErrorCodes.InternalError, message: `Transport disposed: ${method}` }, method);
    this.name = "BridgeDisposedError";
  }
}

export type ValidationDirection = "input" | "output" | "event";

/** 送信前の入力、受信後の出力・イベントが zod 契約に合わない */
export class BridgeValidationError extends Error {
  readonly direction: ValidationDirection;
  readonly method: string;
  readonly issues: z.core.$ZodIssue[];
  readonly value: unknown;

  constructor(direction: ValidationDirection, method: string, error: z.ZodError, value: unknown) {
    super(`${direction} validation failed for ${method}: ${error.message}`);
    this.name = "BridgeValidationError";
    this.direction = direction;
    this.method = method;
    this.issues = error.issues;
    this.value = value;
  }
}

// ---------------------------------------------------------------- listeners（transport 実装で共用）

export class ListenerMap {
  private readonly map = new Map<string, Set<(params: unknown) => void>>();

  add(method: string, handler: (params: unknown) => void): () => void {
    let set = this.map.get(method);
    if (!set) {
      set = new Set();
      this.map.set(method, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.map.delete(method);
    };
  }

  dispatch(method: string, params: unknown): void {
    const set = this.map.get(method);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(params);
      } catch (e) {
        // 1 つのハンドラの例外で他のハンドラや transport を止めない
        console.error(`[webview2-bridge] listener for ${method} threw`, e);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
