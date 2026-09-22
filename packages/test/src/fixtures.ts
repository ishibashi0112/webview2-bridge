/**
 * Playwright のフィクスチャ。テストは `import { test, expect } from "@ishibashi0112/webview2-bridge-test"` で使う。
 *
 *   test("...", async ({ page, db, testId, bridge }) => { ... })
 *
 * - page:    screen は Playwright が起動したブラウザ、api / host は CDP で繋いだ WebView2 のページ
 * - bridge:  (api / host) ページ内のブリッジクライアントを契約メソッド名で呼ぶ
 * - db:      (DB 設定があるとき) Knex を包むヘルパ。テスト終了時に入れた行を自動で消す
 * - testId:  テストごとの実行 ID(E2E-yyyymmdd-hhmm-xxxx)。前提データのキーの接頭辞に使う
 */
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import type { Knex } from "knex";
import { createBridge, DEFAULT_BRIDGE_GLOBAL, type Bridge } from "./bridge.js";
import type { E2EConfig, E2EWorkerOptions, Layer, TrackSpec, TrackWhere } from "./config.js";
import { createDb, type Db, type SnapshotSpec } from "./db/index.js";
import { checkAllowed, describeConnection } from "./db/guard.js";
import { knexConfigFromEnv, loadEnvFiles } from "./db/env.js";
import { launchHost, type HostApp } from "./host.js";

export interface E2ETestFixtures {
  testId: string;
  db: Db;
  bridge: Bridge;
}

export interface E2EWorkerFixtures extends E2EWorkerOptions {
  /** api / host で起動したホスト exe(screen では null) */
  hostApp: HostApp | null;
  /** DB 接続(設定が無ければ null) */
  dbConnection: Knex | null;
  /** playwright.config.ts のあるディレクトリ(パスの基準) */
  appRoot: string;
}

export function makeTestId(now: Date = new Date(), random: string = Math.random().toString(36).slice(2, 6)): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `E2E-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}-${random}`;
}

/** TrackSpec の where を snapshot 用に解決する("{testId}" の置換 / 関数への testId 注入) */
export function resolveTrackWhere(where: TrackWhere | undefined, testId: string): SnapshotSpec["where"] {
  if (where === undefined) return undefined;
  if (typeof where === "function") return (qb) => where(qb, testId);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(where)) out[k] = typeof v === "string" ? v.replaceAll("{testId}", testId) : v;
  return out;
}

function toSnapshotSpecs(track: readonly TrackSpec[], testId: string): SnapshotSpec[] {
  return track.map((t) => ({ table: t.table, key: t.key, where: resolveTrackWhere(t.where, testId) }));
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `base64:${value.toString("base64")}`;
  return value;
}

function requireConfig(e2e: E2EConfig | undefined): E2EConfig {
  if (e2e === undefined) {
    throw new Error("use.e2e が設定されていません。playwright.config.ts で playwrightConfig(e2e) を使ってください");
  }
  return e2e;
}

export const test = base.extend<E2ETestFixtures, E2EWorkerFixtures>({
  e2e: [undefined as unknown as E2EConfig, { option: true, scope: "worker" }],
  layer: ["screen" as Layer, { option: true, scope: "worker" }],

  appRoot: [
    async ({}, use, workerInfo) => {
      const configFile = workerInfo.config.configFile;
      await use(configFile !== undefined ? path.dirname(configFile) : workerInfo.config.rootDir);
    },
    { scope: "worker" },
  ],

  hostApp: [
    async ({ e2e, layer, appRoot, playwright }, use) => {
      if (layer === "screen") {
        await use(null);
        return;
      }
      const cfg = requireConfig(e2e);
      const host = cfg.host;
      if (host === undefined) {
        throw new Error("e2e.config.ts に host(exe のパス)がありません。api / host プロジェクトには必須です");
      }
      const app = await launchHost({
        exe: path.resolve(appRoot, host.exe),
        devUrl: host.devUrl ?? cfg.web.url,
        cdpPort: host.cdpPort,
        startupTimeoutMs: host.startupTimeoutMs,
        env: host.env,
        chromium: playwright.chromium,
      });
      await use(app);
      await app.close();
    },
    { scope: "worker", timeout: 90_000 },
  ],

  dbConnection: [
    async ({ e2e, appRoot }, use) => {
      const cfg = requireConfig(e2e);
      loadEnvFiles(appRoot, cfg.db?.envFiles);
      const knexConfig = knexConfigFromEnv();
      if (knexConfig === undefined) {
        await use(null);
        return;
      }
      const guard = checkAllowed(describeConnection(knexConfig.client, knexConfig.connection), cfg.db?.allowedDatabases ?? []);
      if (!guard.ok) throw new Error(`DB ガード: ${guard.reason}`);
      const knexModule = (await import("knex")) as unknown as { default: (config: Knex.Config) => Knex };
      const knex = knexModule.default(knexConfig as Knex.Config);
      await use(knex);
      await knex.destroy();
    },
    { scope: "worker" },
  ],

  testId: async ({}, use) => {
    await use(makeTestId());
  },

  // screen: Playwright の通常のページ。api / host: WebView2 のページ(テストごとに reload)
  page: async ({ layer, hostApp, context, e2e }, use, testInfo) => {
    if (layer === "screen" || hostApp === null) {
      const p = await context.newPage();
      await use(p);
      return;
    }
    const p: Page = hostApp.page;
    if (e2e?.host?.reloadPerTest !== false) {
      await p.reload({ waitUntil: "domcontentloaded" });
    }
    await use(p);
    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        const body = await p.screenshot({ fullPage: true });
        await testInfo.attach("screenshot", { body, contentType: "image/png" });
      } catch {
        // ページが閉じているなど。スクリーンショットは補助情報なので黙って続ける
      }
    }
  },

  bridge: async ({ page, layer, e2e }, use) => {
    if (layer === "screen") {
      throw new Error("bridge フィクスチャは api / host プロジェクトでだけ使えます(screen はモック応答なので契約を直接呼ぶ意味がありません)");
    }
    await use(createBridge(page, e2e?.bridgeGlobal ?? DEFAULT_BRIDGE_GLOBAL));
  },

  db: async ({ dbConnection, e2e, testId }, use, testInfo) => {
    if (dbConnection === null) {
      throw new Error(
        "DB が設定されていません(.env.e2e.local に E2E_DB_CLIENT などを書き、e2e.config.ts の db.allowedDatabases にテスト DB 名を入れる)。DB を使わないテストは db を受け取らないでください",
      );
    }
    const cfg = requireConfig(e2e);
    const warnings: string[] = [];
    const db = createDb(dbConnection, {
      maxRows: cfg.db?.maxRows,
      onWarning: (m) => warnings.push(m),
      onDiff: async (diff) => {
        await testInfo.attach("db-diff", { body: JSON.stringify(diff, jsonReplacer, 2), contentType: "application/json" });
      },
    });
    const track = cfg.db?.track ?? [];
    const before = track.length > 0 ? await db.snapshot(toSnapshotSpecs(track, testId)) : null;
    await use(db);
    if (before !== null) {
      try {
        await db.diff(before);
      } catch (e) {
        warnings.push(`後片付け前の差分取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const result = await db.cleanup();
    if (result.failures.length > 0 || warnings.length > 0) {
      await testInfo.attach("db-cleanup", {
        body: JSON.stringify({ deleted: result.deleted, failures: result.failures, warnings }, jsonReplacer, 2),
        contentType: "application/json",
      });
    }
  },
});

export { expect };
