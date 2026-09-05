import type { z } from "zod";
import {
  BridgeError,
  eventMethod,
  JsonRpcErrorCodes,
  ListenerMap,
  type ContractShape,
  type Transport,
} from "./transport.js";

/** ハンドラから MemoryTransport 自身の機能（イベント発火）を使うためのコンテキスト */
export interface MemoryContext<C extends ContractShape> {
  emit: <E extends keyof C["events"] & string>(name: E, payload: z.input<C["events"][E]>) => void;
}

/** 契約から型付けされたモックハンドラ。`{ parts: { search: async (input, ctx) => output } }` */
export type MemoryHandlers<C extends ContractShape> = {
  [NS in keyof C["methods"]]: {
    [M in keyof C["methods"][NS]]: (
      input: z.output<C["methods"][NS][M]["input"]>,
      ctx: MemoryContext<C>,
    ) => Promise<z.input<C["methods"][NS][M]["output"]>> | z.input<C["methods"][NS][M]["output"]>;
  };
};

export interface MemoryTransportOptions {
  /** 応答を遅らせる ms（ローディング表示の確認用） */
  delay?: number;
}

/**
 * ブラウザ単体で動かすための in-memory transport。
 * 実際の通信と同じく、要求・応答・イベントは JSON に一度直列化して往復させる
 * （undefined の欠落や Date の文字列化など、wire 上の挙動を再現する）。
 */
export class MemoryTransport<C extends ContractShape> implements Transport {
  private readonly listeners = new ListenerMap();
  private readonly delay: number;
  private readonly context: MemoryContext<C>;

  constructor(
    private readonly handlers: MemoryHandlers<C>,
    options: MemoryTransportOptions = {},
  ) {
    this.delay = options.delay ?? 0;
    this.context = { emit: (name, payload) => this.emit(name, payload) };
  }

  async call(method: string, params: unknown): Promise<unknown> {
    const handler = this.lookup(method);
    if (!handler) {
      throw new BridgeError({ code: JsonRpcErrorCodes.MethodNotFound, message: `Method not found: ${method}` }, method);
    }
    if (this.delay > 0) await sleep(this.delay);
    try {
      const result = await handler(roundTrip(params), this.context);
      return roundTrip(result);
    } catch (e) {
      if (e instanceof BridgeError) throw e;
      // VB 側の未処理例外と同じ形（-32000, message, data = 例外型名）に揃える
      const err = e instanceof Error ? e : new Error(String(e));
      throw new BridgeError({ code: JsonRpcErrorCodes.ServerError, message: err.message, data: err.name }, method);
    }
  }

  on(method: string, handler: (params: unknown) => void): () => void {
    return this.listeners.add(method, handler);
  }

  /** Host → Web のイベントを擬似発火する */
  emit<E extends keyof C["events"] & string>(name: E, payload: z.input<C["events"][E]>): void {
    this.listeners.dispatch(eventMethod(name), roundTrip(payload));
  }

  private lookup(method: string): ((input: unknown, ctx: MemoryContext<C>) => unknown) | undefined {
    const dot = method.indexOf(".");
    if (dot < 0) return undefined;
    const ns = method.slice(0, dot);
    const name = method.slice(dot + 1);
    const nsHandlers = (this.handlers as Record<string, Record<string, unknown> | undefined>)[ns];
    const h = nsHandlers?.[name];
    return typeof h === "function" ? (h as (input: unknown, ctx: MemoryContext<C>) => unknown) : undefined;
  }
}

function roundTrip<T>(v: T): T {
  if (v === undefined) return v;
  return JSON.parse(JSON.stringify(v)) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
