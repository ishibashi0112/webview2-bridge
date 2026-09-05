import type { ContractShape } from "@wvbridge/gen";
import type { z } from "zod";
import { BridgeValidationError } from "./errors.js";
import type { Transport } from "./transport.js";

export type ClientMethods<C extends ContractShape> = {
  [NS in keyof C["methods"]]: {
    [M in keyof C["methods"][NS]]: (
      input: z.input<C["methods"][NS][M]["input"]>,
    ) => Promise<z.output<C["methods"][NS][M]["output"]>>;
  };
};

export interface ClientEvents<C extends ContractShape> {
  /** イベントを購読する。payload は契約で検証済み。戻り値は解除関数 */
  on<E extends keyof C["events"] & string>(event: E, handler: (params: z.output<C["events"][E]>) => void): () => void;
}

export type Client<C extends ContractShape> = ClientMethods<C> & {
  readonly events: ClientEvents<C>;
  readonly transport: Transport;
};

export interface CreateClientOptions {
  /**
   * 受信したイベント payload が契約に合わなかったときの処理。既定は console.warn。
   * （メソッドの入出力の不一致は Promise の reject として呼び出し側に返る）
   */
  onEventValidationError?: (error: BridgeValidationError) => void;
}

const RESERVED_NAMESPACES = new Set(["events", "transport"]);

/**
 * 契約と Transport から型付きクライアントを作る。
 *   client.parts.search({ keyword: "x" })  → Promise<{ items: Part[] }>
 *   client.events.on("progress", p => ...) → 解除関数
 * 入力は送信前に zod で検証し、出力は受信後に検証する。失敗時は BridgeValidationError。
 */
export function createClient<C extends ContractShape>(
  contract: C,
  transport: Transport,
  options: CreateClientOptions = {},
): Client<C> {
  const client: Record<string, unknown> = {};

  for (const [ns, methods] of Object.entries(contract.methods)) {
    if (RESERVED_NAMESPACES.has(ns)) {
      throw new Error(`namespace "${ns}" is reserved by createClient; rename it in the contract`);
    }
    const nsObj: Record<string, (input: unknown) => Promise<unknown>> = {};
    for (const [name, def] of Object.entries(methods)) {
      const method = `${ns}.${name}`;
      nsObj[name] = async (input: unknown) => {
        const parsedIn = def.input.safeParse(input);
        if (!parsedIn.success) throw new BridgeValidationError("input", method, parsedIn.error.issues);
        const raw = await transport.call(method, parsedIn.data);
        const parsedOut = def.output.safeParse(raw);
        if (!parsedOut.success) throw new BridgeValidationError("output", method, parsedOut.error.issues);
        return parsedOut.data;
      };
    }
    client[ns] = nsObj;
  }

  const onEventValidationError =
    options.onEventValidationError ?? ((err: BridgeValidationError) => console.warn(`[wvbridge] ${err.message}`));

  const events: ClientEvents<C> = {
    on(event, handler) {
      const schema = contract.events[event];
      if (!schema) throw new Error(`unknown event "${event}" (not in contract.events)`);
      return transport.on(event, (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          onEventValidationError(new BridgeValidationError("event", event, parsed.error.issues));
          return;
        }
        handler(parsed.data as z.output<C["events"][typeof event]>);
      });
    },
  };

  Object.defineProperty(client, "events", { value: events, enumerable: false });
  Object.defineProperty(client, "transport", { value: transport, enumerable: false });
  return client as Client<C>;
}
