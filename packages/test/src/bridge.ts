/**
 * L2(API 通し)用: CDP で繋いだページの中でブリッジクライアント(window.__webview2Bridge)を呼ぶ。
 * アプリ側は開発ビルド時(または VITE_EXPOSE_BRIDGE=1)に createClient の戻り値を window に公開しておく。
 */
import type { Page } from "@playwright/test";

export const DEFAULT_BRIDGE_GLOBAL = "__webview2Bridge";

export interface BridgeErrorShape {
  name?: string | undefined;
  message: string;
  code?: number | undefined;
  data?: unknown;
  /** BridgeValidationError の issues */
  issues?: unknown;
}

/** ページ内で投げられたエラーをテスト側で受け取るための例外。code / data は JSON-RPC の error と同じ */
export class BridgeCallError extends Error {
  override name = "BridgeCallError";
  readonly method: string;
  readonly code: number | undefined;
  readonly data: unknown;
  readonly issues: unknown;
  readonly remoteName: string | undefined;
  constructor(method: string, shape: BridgeErrorShape) {
    super(`${method}: ${shape.name ?? "Error"}${shape.code !== undefined ? ` ${shape.code}` : ""}: ${shape.message}`);
    this.method = method;
    this.code = shape.code;
    this.data = shape.data;
    this.issues = shape.issues;
    this.remoteName = shape.name;
  }
}

export interface Bridge {
  /** 契約メソッドを "ns.name" で呼ぶ。失敗は BridgeCallError */
  call<T = unknown>(method: string, input?: unknown): Promise<T>;
  /** 呼んで失敗することを期待する。成功したら例外 */
  expectError(method: string, input?: unknown): Promise<BridgeCallError>;
  /** window に公開されているか */
  isAvailable(): Promise<boolean>;
}

type EvalResult = { ok: true; value: unknown } | { ok: false; error: BridgeErrorShape };

export function createBridge(page: Page, globalName: string = DEFAULT_BRIDGE_GLOBAL): Bridge {
  const bridge: Bridge = {
    async isAvailable() {
      return page.evaluate((g) => typeof (window as unknown as Record<string, unknown>)[g] === "object", globalName);
    },
    async call<T = unknown>(method: string, input?: unknown): Promise<T> {
      const result = (await page.evaluate(
        async ({ g, method, input }) => {
          const root = (window as unknown as Record<string, unknown>)[g];
          if (root === undefined || root === null) {
            return { ok: false, error: { name: "BridgeNotExposed", message: `window.${g} がありません。アプリの bridge.ts で開発ビルド時にクライアントを公開してください` } };
          }
          const [ns, name, ...rest] = method.split(".");
          const nsObj = (root as Record<string, unknown>)[ns ?? ""];
          const fn = nsObj !== undefined && nsObj !== null ? (nsObj as Record<string, unknown>)[name ?? ""] : undefined;
          if (rest.length > 0 || typeof fn !== "function") {
            return { ok: false, error: { name: "MethodNotFound", message: `契約に ${method} がありません` } };
          }
          try {
            const value: unknown = await (fn as (i: unknown) => Promise<unknown>)(input);
            return { ok: true, value };
          } catch (e) {
            const err = e as { name?: unknown; message?: unknown; code?: unknown; data?: unknown; issues?: unknown };
            return {
              ok: false,
              error: {
                name: typeof err?.name === "string" ? err.name : undefined,
                message: typeof err?.message === "string" ? err.message : String(e),
                code: typeof err?.code === "number" ? err.code : undefined,
                data: err?.data,
                issues: err?.issues,
              },
            };
          }
        },
        { g: globalName, method, input },
      )) as EvalResult;
      if (result.ok) return result.value as T;
      throw new BridgeCallError(method, result.error);
    },
    async expectError(method, input) {
      try {
        const value = await bridge.call(method, input);
        throw new Error(`${method} は失敗を期待しましたが成功しました: ${JSON.stringify(value)}`);
      } catch (e) {
        if (e instanceof BridgeCallError) return e;
        throw e;
      }
    },
  };
  return bridge;
}
