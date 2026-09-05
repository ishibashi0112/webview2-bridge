import type { z } from "zod";
import {
  BridgeValidationError,
  eventMethod,
  type ContractShape,
  type Transport,
} from "./transport.js";

/** `client.parts.search(input)` の形。namespace → method → 型付き関数 */
export type ClientMethods<C extends ContractShape> = {
  [NS in keyof C["methods"]]: {
    [M in keyof C["methods"][NS]]: (
      input: z.input<C["methods"][NS][M]["input"]>,
    ) => Promise<z.output<C["methods"][NS][M]["output"]>>;
  };
};

export interface ClientEvents<C extends ContractShape> {
  /** イベントを購読する。戻り値は購読解除関数 */
  on<E extends keyof C["events"] & string>(
    name: E,
    handler: (payload: z.output<C["events"][E]>) => void,
  ): () => void;
}

export type Client<C extends ContractShape> = ClientMethods<C> & {
  events: ClientEvents<C>;
  /** 生の transport（デバッグ・破棄用） */
  transport: Transport;
};

export interface CreateClientOptions {
  /**
   * 受信したイベントが契約に合わなかったときの処理。
   * 既定は console.error に出してハンドラを呼ばない。
   */
  onEventValidationError?: (error: BridgeValidationError) => void;
}

const RESERVED_NAMESPACES = new Set(["events", "transport"]);

/**
 * 契約と transport から型付きクライアントを作る。
 * - 入力は送信前に zod で parse（失敗: BridgeValidationError, direction "input"）
 * - 出力は受信後に zod で parse（失敗: BridgeValidationError, direction "output"）
 * - イベントは受信後に zod で parse（失敗: onEventValidationError）
 */
export function createClient<C extends ContractShape>(
  contract: C,
  transport: Transport,
  options: CreateClientOptions = {},
): Client<C> {
  const client: Record<string, unknown> = {};

  for (const [ns, methods] of Object.entries(contract.methods)) {
    if (RESERVED_NAMESPACES.has(ns)) {
      throw new Error(`Namespace "${ns}" is reserved on the client object`);
    }
    const nsObj: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(methods)) {
      const rpc = `${ns}.${name}`;
      nsObj[name] = async (input: unknown): Promise<unknown> => {
        const parsedInput = def.input.safeParse(input);
        if (!parsedInput.success) throw new BridgeValidationError("input", rpc, parsedInput.error, input);
        const raw = await transport.call(rpc, parsedInput.data);
        const parsedOutput = def.output.safeParse(raw);
        if (!parsedOutput.success) throw new BridgeValidationError("output", rpc, parsedOutput.error, raw);
        return parsedOutput.data;
      };
    }
    client[ns] = nsObj;
  }

  const onEventValidationError =
    options.onEventValidationError ??
    ((e: BridgeValidationError): void => {
      console.error("[webview2-bridge]", e.message, e.issues);
    });

  const events: ClientEvents<C> = {
    on(name, handler) {
      const schema = contract.events[name];
      if (!schema) throw new Error(`Unknown event "${name}"`);
      const rpc = eventMethod(name);
      return transport.on(rpc, (raw) => {
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          onEventValidationError(new BridgeValidationError("event", rpc, parsed.error, raw));
          return;
        }
        handler(parsed.data as z.output<C["events"][typeof name]>);
      });
    },
  };

  client["events"] = events;
  client["transport"] = transport;
  return client as Client<C>;
}
