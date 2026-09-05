import type { ContractShape } from "@wvbridge/gen";
import type { z } from "zod";
import { BridgeError } from "./errors.js";
import { EventListeners, JsonRpcErrorCodes, type Transport } from "./transport.js";

/** ハンドラから Host 側のイベントを擬似発火するためのコンテキスト */
export interface MemoryHandlerContext<C extends ContractShape> {
  emit<E extends keyof C["events"] & string>(event: E, params: z.input<C["events"][E]>): void;
}

/** 契約から型付けされたハンドラ群: `{ parts: { search: async (input, ctx) => output } }` */
export type MemoryHandlers<C extends ContractShape> = {
  [NS in keyof C["methods"]]: {
    [M in keyof C["methods"][NS]]: (
      input: z.output<C["methods"][NS][M]["input"]>,
      ctx: MemoryHandlerContext<C>,
    ) => Promise<z.input<C["methods"][NS][M]["output"]>> | z.input<C["methods"][NS][M]["output"]>;
  };
};

export interface MemoryTransportOptions {
  /** 各呼び出しに入れる擬似遅延（ms）。既定 0 */
  delay?: number;
}

/**
 * ブラウザ単体（WebView2 なし）で UI を動かすための Transport。
 * ハンドラが投げた例外は VB 側と同じく -32000 の BridgeError になる。
 */
export class MemoryTransport<C extends ContractShape> implements Transport {
  private readonly listeners = new EventListeners();
  private readonly delay: number;
  private readonly ctx: MemoryHandlerContext<C>;

  constructor(
    private readonly handlers: MemoryHandlers<C>,
    options: MemoryTransportOptions = {},
  ) {
    this.delay = options.delay ?? 0;
    this.ctx = { emit: (event, params) => this.emit(event, params) };
  }

  async call(method: string, params: unknown): Promise<unknown> {
    const dot = method.indexOf(".");
    const ns = dot >= 0 ? method.slice(0, dot) : method;
    const name = dot >= 0 ? method.slice(dot + 1) : "";
    const nsHandlers = (this.handlers as Record<string, Record<string, unknown> | undefined>)[ns];
    const handler = nsHandlers?.[name];
    if (typeof handler !== "function") {
      throw new BridgeError(JsonRpcErrorCodes.MethodNotFound, `Method not found: ${method}`, undefined, method);
    }
    if (this.delay > 0) await new Promise((r) => setTimeout(r, this.delay));
    try {
      return await (handler as (input: unknown, ctx: MemoryHandlerContext<C>) => unknown)(params, this.ctx);
    } catch (err) {
      if (err instanceof BridgeError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const data = err instanceof Error ? err.name : undefined;
      throw new BridgeError(JsonRpcErrorCodes.ServerError, message, data, method);
    }
  }

  on(event: string, handler: (params: unknown) => void): () => void {
    return this.listeners.add(event, handler);
  }

  /** Host 側のイベント発火を擬似する */
  emit<E extends keyof C["events"] & string>(event: E, params: z.input<C["events"][E]>): void {
    this.listeners.dispatch(event, params);
  }
}
