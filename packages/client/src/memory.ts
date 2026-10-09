import type { z } from "zod";
import {
  BridgeError,
  eventMethod,
  JsonRpcErrorCodes,
  ListenerMap,
  type ContractShape,
  type JsonRpcErrorObject,
  type MethodShape,
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

/** 契約のメソッド名 `"ns.method"` の union */
export type MemoryMethodName<C extends ContractShape> = {
  [NS in keyof C["methods"] & string]: `${NS}.${keyof C["methods"][NS] & string}`;
}[keyof C["methods"] & string];

type MethodDefOf<C extends ContractShape, K extends string> = K extends `${infer NS}.${infer M}`
  ? NS extends keyof C["methods"]
    ? M extends keyof C["methods"][NS]
      ? C["methods"][NS][M]
      : MethodShape
    : MethodShape
  : MethodShape;

/**
 * 応答の差し替え（テスト・開発用）。ハンドラ関数か、固定の応答 `{ result }`、固定の失敗 `{ error }`。
 * `{ result }` / `{ error }` はデータだけなので、テストからページへ（page.addInitScript / evaluate）そのまま渡せる
 */
export type MemoryOverride<C extends ContractShape, K extends string> =
  | ((
      input: z.output<MethodDefOf<C, K>["input"]>,
      ctx: MemoryContext<C>,
    ) => Promise<z.input<MethodDefOf<C, K>["output"]>> | z.input<MethodDefOf<C, K>["output"]>)
  | { result: z.input<MethodDefOf<C, K>["output"]> }
  | { error: JsonRpcErrorObject };

/** exposeMemoryTransport より前に積まれた差し替え（テストが page.addInitScript で積む。window.<global>.pending） */
export interface MemoryOverridePending {
  method: string;
  handler?: (input: unknown, ctx: unknown) => unknown;
  result?: unknown;
  error?: JsonRpcErrorObject;
}

/** 開発ビルドで window に公開するモック操作の口（exposeMemoryTransport）。テストの mockReturn / mockThrow が使う */
export interface MemoryMockGlobal {
  /** 応答を差し替える（関数か { result } / { error }） */
  override(method: string, spec: MemoryOverridePending["handler"] | { result: unknown } | { error: JsonRpcErrorObject }): void;
  /** 差し替えをすべて外す */
  reset(): void;
  /** 差し替え対象の transport（exposeMemoryTransport が入れる） */
  transport?: MemoryTransport<ContractShape>;
  /** exposeMemoryTransport より前に積まれた差し替え（テストが起動前に積んだもの） */
  pending?: MemoryOverridePending[];
}

export const MOCK_GLOBAL = "__webview2BridgeMock";

/**
 * ブラウザ単体で動かすための in-memory transport。
 * 実際の通信と同じく、要求・応答・イベントは JSON に一度直列化して往復させる
 * （undefined の欠落や Date の文字列化など、wire 上の挙動を再現する）。
 */
export class MemoryTransport<C extends ContractShape> implements Transport {
  private readonly listeners = new ListenerMap();
  private readonly overrides = new Map<string, (input: unknown, ctx: MemoryContext<C>) => unknown>();
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
    const handler = this.overrides.get(method) ?? this.lookup(method);
    if (!handler) {
      throw new BridgeError({ code: JsonRpcErrorCodes.MethodNotFound, message: `Method not found: ${method}` }, method);
    }
    if (this.delay > 0) await sleep(this.delay);
    try {
      const result = await handler(roundTrip(params), this.context);
      return roundTrip(result);
    } catch (e) {
      if (e instanceof BridgeError) {
        // 実 transport と同じく、どのメソッドの失敗かを付ける（モックは method を知らずに businessError() を投げてよい）
        throw e.method === undefined ? new BridgeError({ code: e.code, message: e.message, data: e.data }, method) : e;
      }
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

  /**
   * 1 メソッドの応答を差し替える（画面テストで「取得に失敗したとき」「権限が無いとき」などを再現する。handlers は変えない）。
   * 関数なら handlers と同じ形（input, { emit }）、`{ result }` なら固定の応答、`{ error }` なら BridgeError で失敗する。
   * 戻り値で元に戻せる。契約に無いメソッド名も差し替えられる（型は契約のメソッド名に限定）
   */
  override<K extends MemoryMethodName<C>>(method: K, spec: MemoryOverride<C, K>): () => void {
    const handler = toOverrideHandler(method, spec);
    this.overrides.set(method, handler);
    return () => {
      if (this.overrides.get(method) === handler) this.overrides.delete(method);
    };
  }

  /** override をすべて外す */
  resetOverrides(): void {
    this.overrides.clear();
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

function toOverrideHandler(
  method: string,
  spec: ((input: never, ctx: never) => unknown) | { result: unknown } | { error: JsonRpcErrorObject },
): (input: unknown, ctx: unknown) => unknown {
  if (typeof spec === "function") return spec as (input: unknown, ctx: unknown) => unknown;
  if ("error" in spec) {
    const err = spec.error;
    return () => {
      throw new BridgeError({ code: err.code, message: err.message, ...(err.data !== undefined && { data: err.data }) }, method);
    };
  }
  const result = spec.result;
  return () => result;
}

/**
 * 開発ビルドで MemoryTransport を `window.__webview2BridgeMock` に公開する（`window.__webview2Bridge` と同じ扱い。本番では呼ばない）。
 * 画面テスト（@ishibashi0112/webview2-bridge-test の mockReturn / mockThrow）はこの口から応答を差し替える。
 * テストがページの読み込み前（page.addInitScript）に積んだ差し替え（`pending`）はここで取り込む
 */
export function exposeMemoryTransport<C extends ContractShape>(transport: MemoryTransport<C>, globalName: string = MOCK_GLOBAL): MemoryMockGlobal {
  const g = globalThis as Record<string, unknown>;
  const prev = g[globalName] as Partial<MemoryMockGlobal> | undefined;
  const mock: MemoryMockGlobal = {
    transport: transport as unknown as MemoryTransport<ContractShape>,
    override(method, spec) {
      transport.override(method as MemoryMethodName<C>, (spec ?? { result: undefined }) as MemoryOverride<C, MemoryMethodName<C>>);
    },
    reset() {
      transport.resetOverrides();
    },
  };
  for (const p of prev?.pending ?? []) {
    mock.override(p.method, p.handler !== undefined ? p.handler : p.error !== undefined ? { error: p.error } : { result: p.result });
  }
  g[globalName] = mock;
  return mock;
}

function roundTrip<T>(v: T): T {
  if (v === undefined) return v;
  return JSON.parse(JSON.stringify(v)) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
