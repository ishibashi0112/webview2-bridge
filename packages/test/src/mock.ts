/**
 * screen 層で、モック(MemoryTransport)の応答をテストごとに差し替える。
 * アプリ側は開発ビルドで `exposeMemoryTransport(transport)`(client)を呼び、window.__webview2BridgeMock を公開しておく(雛形の web/src/bridge.ts)。
 *
 *   await mockThrow(page, "customers.list", { code: -32000, message: "DB に接続できません" });
 *   await mockReturn(page, "app.getContext", { devMode: false });
 *
 * 差し替えは「今開いているページ」に即時に効き、以後の読み込み(goto / reload)にも効く(page.addInitScript)。
 * ページ(= テスト)ごとに独立しているので、テストの終わりに戻す必要は無い。
 * 関数での差し替えはページへ渡せない(テスト側の変数を閉じ込められない)ので、データだけを渡す mockReturn / mockThrow にしている。
 * api / host 層(実 exe)では何も起きない(モックが無い)。
 */
import type { Page } from "@playwright/test";

export const DEFAULT_MOCK_GLOBAL = "__webview2BridgeMock";

export interface MockErrorSpec {
  code: number;
  message: string;
  data?: unknown;
}

export interface MockOptions {
  /** アプリが公開しているグローバル名(既定 __webview2BridgeMock) */
  globalName?: string | undefined;
}

interface MockSpec {
  method: string;
  result?: unknown;
  error?: MockErrorSpec | undefined;
}

/**
 * ページ側で実行される(addInitScript と evaluate の両方で同じ関数)。
 * exposeMemoryTransport 済みなら即時に差し替え、まだなら pending に積んで exposeMemoryTransport が取り込む。
 * 外側の変数を参照しない(Playwright が関数を文字列にしてページへ送るため)
 */
function applyInPage({ globalName, spec }: { globalName: string; spec: MockSpec }): void {
  type Pending = { method: string; result?: unknown; error?: unknown };
  type MockGlobal = { pending?: Pending[]; override: (method: string, s: unknown) => void; reset: () => void };
  const w = window as unknown as Record<string, unknown>;
  let g = w[globalName] as MockGlobal | undefined;
  if (g === undefined) {
    const pending: Pending[] = [];
    g = {
      pending,
      override(method, s) {
        pending.push({ method, ...(s as object) });
      },
      reset() {
        pending.length = 0;
      },
    };
    w[globalName] = g;
  }
  g.override(spec.method, spec.error !== undefined ? { error: spec.error } : { result: spec.result });
}

function resetInPage(globalName: string): void {
  const w = window as unknown as Record<string, unknown>;
  const g = w[globalName] as { reset?: () => void } | undefined;
  g?.reset?.();
}

async function apply(page: Page, spec: MockSpec, options: MockOptions): Promise<void> {
  const arg = { globalName: options.globalName ?? DEFAULT_MOCK_GLOBAL, spec };
  await page.addInitScript(applyInPage, arg);
  await page.evaluate(applyInPage, arg);
}

/** メソッドの応答を固定の値にする(契約の output の形で書く。検証は client が行う) */
export async function mockReturn(page: Page, method: string, result: unknown, options: MockOptions = {}): Promise<void> {
  await apply(page, { method, result }, options);
}

/** メソッドを JSON-RPC エラー(BridgeError)で失敗させる。VB の未処理例外なら { code: -32000, message, data: "例外の型名" } */
export async function mockThrow(page: Page, method: string, error: MockErrorSpec, options: MockOptions = {}): Promise<void> {
  await apply(page, { method, error }, options);
}

/** メソッドを業務エラー(-32010。message をそのまま利用者に見せる。field で入力欄に結び付く)で失敗させる */
export async function mockBusinessError(page: Page, method: string, message: string, field?: string, options: MockOptions = {}): Promise<void> {
  await apply(page, { method, error: { code: -32010, message, ...(field !== undefined && { data: { field } }) } }, options);
}

/** 今開いているページの差し替えをすべて外す(以後の読み込みに積んだ分は残る。通常はテストごとに新しい page になるので不要) */
export async function mockReset(page: Page, options: MockOptions = {}): Promise<void> {
  await page.evaluate(resetInPage, options.globalName ?? DEFAULT_MOCK_GLOBAL);
}
