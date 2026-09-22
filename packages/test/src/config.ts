/**
 * e2e.config.ts(アプリ側の設定)の型と、それを Playwright の設定に展開するヘルパ。
 *
 *   // playwright.config.ts(アプリのルート)
 *   import { defineConfig } from "@playwright/test";
 *   import { playwrightConfig } from "@ishibashi0112/webview2-bridge-test/config";
 *   import e2e from "./e2e/e2e.config";
 *   export default defineConfig(playwrightConfig(e2e));
 *
 * 3 つのプロジェクトを作る: screen(L1: Vite dev + MemoryTransport、DB なし)/ api(L2: 実 exe を契約経由で呼ぶ)/
 * host(L3: 実 exe を画面操作)。api / host は会社 PC(Windows)でしか走らない。
 * パス(exe など)は playwright.config.ts のあるディレクトリ(アプリのルート)基準。
 */
import type { Knex } from "knex";
import type { PlaywrightTestConfig, PlaywrightTestOptions, PlaywrightWorkerOptions } from "@playwright/test";

export type Layer = "screen" | "api" | "host";
export const LAYERS: readonly Layer[] = ["screen", "api", "host"];

export interface WebConfig {
  /** dev サーバーの起動コマンド(例 "pnpm --filter web dev")。Playwright の webServer に渡す */
  command: string;
  /** dev サーバーの URL(例 "http://localhost:5173")。screen の baseURL、host の WEBVIEW2_BRIDGE_DEV_URL になる */
  url: string;
  /** 既に起動していれば再利用(既定: CI 以外では true) */
  reuseExistingServer?: boolean | undefined;
  /** command を実行するディレクトリ(既定: アプリのルート) */
  cwd?: string | undefined;
  /** 起動待ちの上限 ms(既定 60000) */
  timeoutMs?: number | undefined;
}

export interface HostConfig {
  /** ホスト exe(Debug ビルド)。例 "dotnet/MyApp.Host/bin/Debug/net48/MyApp.Host.exe" */
  exe: string;
  /** WEBVIEW2_BRIDGE_DEV_URL に渡す URL(既定: web.url) */
  devUrl?: string | undefined;
  /** WebView2 の CDP ポート(既定 9222) */
  cdpPort?: number | undefined;
  /** exe 起動から CDP 接続までの上限 ms(既定 30000) */
  startupTimeoutMs?: number | undefined;
  /** exe に渡す追加の環境変数 */
  env?: Record<string, string> | undefined;
  /** テストごとにページを reload して UI の状態を戻す(既定 true) */
  reloadPerTest?: boolean | undefined;
}

export type TrackWhere = Record<string, unknown> | ((qb: Knex.QueryBuilder, testId: string) => Knex.QueryBuilder);

export interface TrackSpec {
  table: string;
  /** 行を同定するキー列 */
  key: string[];
  /**
   * 絞り込み。オブジェクトなら文字列値の "{testId}" を実行 ID に置換する(例 { CustomerCode: "{testId}-C1" })。
   * 関数なら (qb, testId) => qb.where("CustomerCode", "like", `${testId}%`) のように書く
   */
  where?: TrackWhere | undefined;
}

export interface DbConfig {
  /**
   * 接続を許可する DB 名(または "host/DB名")。接続先がここに無いとテストは起動時に止まる。
   * 本番 DB に向けて走らせないためのガードなので、テスト DB の名前だけを書く
   */
  allowedDatabases: string[];
  /** 毎テストの前後で自動的に差分を取り、増えた行を後片付けするテーブル */
  track?: TrackSpec[] | undefined;
  /** 接続情報を読む env ファイル(既定 [".env.e2e.local", ".env.e2e"]。アプリのルート基準) */
  envFiles?: string[] | undefined;
  /** snapshot で where を省略したときに読む最大行数(既定 5000) */
  maxRows?: number | undefined;
}

export interface ReportConfig {
  /** 出力先(既定 "test-results/report.md") */
  file?: string | undefined;
  /** 失敗があったときクリップボードにコピーする(既定 true。環境変数 E2E_NO_CLIPBOARD=1 でも無効) */
  clipboard?: boolean | undefined;
  /** 文字数の上限(既定 120000。M365 Copilot の貼付上限) */
  maxChars?: number | undefined;
}

export interface E2EConfig {
  web: WebConfig;
  host?: HostConfig | undefined;
  db?: DbConfig | undefined;
  /** ブリッジクライアントを公開している window のプロパティ名(既定 "__webview2Bridge") */
  bridgeGlobal?: string | undefined;
  report?: ReportConfig | undefined;
}

export function defineE2EConfig(config: E2EConfig): E2EConfig {
  return config;
}

/** Playwright の use に足す、このパッケージのワーカーオプション */
export interface E2EWorkerOptions {
  e2e: E2EConfig;
  layer: Layer;
}

/**
 * ブラウザの選び方(screen 用)。
 * - E2E_BROWSER_EXECUTABLE があればその実行ファイル(Chromium をダウンロードできない環境向け)
 * - Windows は既定で Edge(channel "msedge")。E2E_BROWSER_CHANNEL で変えられる("" で Playwright 同梱の Chromium)
 * - それ以外は Playwright 同梱の Chromium(`npx playwright install chromium`)
 */
export function browserUse(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Partial<PlaywrightWorkerOptions> {
  const executablePath = env["E2E_BROWSER_EXECUTABLE"];
  if (executablePath !== undefined && executablePath !== "") {
    return { browserName: "chromium", launchOptions: { executablePath } };
  }
  const channel = env["E2E_BROWSER_CHANNEL"];
  if (channel !== undefined) {
    return channel === "" ? { browserName: "chromium" } : { browserName: "chromium", channel };
  }
  return platform === "win32" ? { browserName: "chromium", channel: "msedge" } : { browserName: "chromium" };
}

export type E2EPlaywrightConfig = PlaywrightTestConfig<PlaywrightTestOptions, PlaywrightWorkerOptions & E2EWorkerOptions>;

export interface PlaywrightConfigOptions {
  /** テストの置き場(既定 "e2e")。配下に screen / api / host */
  testDir?: string | undefined;
  /** 追加・上書きしたい Playwright 設定 */
  overrides?: E2EPlaywrightConfig | undefined;
}

/** e2e.config.ts から Playwright の設定を組み立てる */
export function playwrightConfig(e2e: E2EConfig, options: PlaywrightConfigOptions = {}): E2EPlaywrightConfig {
  const testDir = options.testDir ?? "e2e";
  const reporterOptions: ReportConfig = { ...e2e.report };
  const config: E2EPlaywrightConfig = {
    testDir,
    outputDir: "test-results",
    // DB を共有する api / host は直列。screen も揃えて 1 ワーカー(件数が小さいので十分)
    workers: 1,
    fullyParallel: false,
    retries: 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: [["list"], ["@ishibashi0112/webview2-bridge-test/reporter", reporterOptions]],
    use: {
      e2e,
      layer: "screen",
      baseURL: e2e.web.url,
      screenshot: "only-on-failure",
      ...browserUse(),
    },
    webServer: {
      command: e2e.web.command,
      url: e2e.web.url,
      reuseExistingServer: e2e.web.reuseExistingServer ?? process.env["CI"] === undefined,
      timeout: e2e.web.timeoutMs ?? 60_000,
      ...(e2e.web.cwd !== undefined && { cwd: e2e.web.cwd }),
    },
    projects: [
      { name: "screen", testDir: `${testDir}/screen`, use: { layer: "screen" } },
      { name: "api", testDir: `${testDir}/api`, use: { layer: "api" }, timeout: 90_000 },
      { name: "host", testDir: `${testDir}/host`, use: { layer: "host" }, timeout: 90_000 },
    ],
  };
  const o = options.overrides;
  if (o === undefined) return config;
  const { use: oUse, projects: oProjects, ...rest } = o;
  const merged: E2EPlaywrightConfig = { ...config, ...rest, use: { ...config.use, ...oUse } };
  if (oProjects !== undefined) merged.projects = oProjects;
  return merged;
}
