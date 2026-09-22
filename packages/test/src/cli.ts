#!/usr/bin/env node
/**
 * `webview2-bridge-test doctor [--config e2e/e2e.config.ts] [--skip-browser] [--skip-host] [--skip-db]`
 * 会社 PC での前提を 1 コマンドで確かめる:
 *   1. Playwright が入っていて、screen 用のブラウザ(Windows は Edge)を起動できる
 *   2. ホスト exe を CDP 付きで起動して WebView2 に接続し、ページを 1 つ取れる
 *   3. .env.e2e.local の設定でテスト DB に繋がり、ガードを通り、1 行読める
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Knex } from "knex";
import { tsImport } from "tsx/esm/api";
import { browserUse, type E2EConfig } from "./config.js";
import { knexConfigFromEnv, loadEnvFiles } from "./db/env.js";
import { checkAllowed, describeConnection } from "./db/guard.js";
import { launchHost } from "./host.js";

interface DoctorOptions {
  config: string;
  skipBrowser: boolean;
  skipHost: boolean;
  skipDb: boolean;
}

function usage(): never {
  console.error(`Usage: webview2-bridge-test doctor [--config <e2e.config.ts>] [--skip-browser] [--skip-host] [--skip-db]

  アプリのルート(playwright.config.ts のある場所)で実行する。既定の設定は e2e/e2e.config.ts`);
  process.exit(2);
}

function parseArgs(argv: string[]): DoctorOptions {
  const o: DoctorOptions = { config: "e2e/e2e.config.ts", skipBrowser: false, skipHost: false, skipDb: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--config") o.config = argv[++i] ?? usage();
    else if (a === "--skip-browser") o.skipBrowser = true;
    else if (a === "--skip-host") o.skipHost = true;
    else if (a === "--skip-db") o.skipDb = true;
    else if (a === "-h" || a === "--help") usage();
    else {
      console.error(`Unknown argument: ${a}`);
      usage();
    }
  }
  return o;
}

async function loadConfig(file: string): Promise<E2EConfig> {
  const full = path.resolve(file);
  if (!existsSync(full)) throw new Error(`設定ファイルがありません: ${full}`);
  const mod = (await tsImport(pathToFileURL(full).href, import.meta.url)) as Record<string, unknown>;
  const cfg = (mod["default"] ?? mod["e2e"]) as E2EConfig | undefined;
  if (cfg === undefined || typeof cfg !== "object" || typeof (cfg as { web?: unknown }).web !== "object") {
    throw new Error(`${file} は defineE2EConfig({...}) を default export してください`);
  }
  return cfg;
}

type Check = { name: string; run: () => Promise<string> };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function doctor(argv: string[]): Promise<number> {
  const o = parseArgs(argv);
  const appRoot = process.cwd();
  let cfg: E2EConfig;
  try {
    cfg = await loadConfig(o.config);
  } catch (e) {
    console.error(`✗ 設定: ${errorMessage(e)}`);
    return 1;
  }
  console.log(`設定: ${o.config} (ルート ${appRoot})`);

  const checks: Check[] = [];
  if (!o.skipBrowser) {
    checks.push({
      name: "Playwright とブラウザ (screen 用)",
      run: async () => {
        const pw = (await import("@playwright/test")) as unknown as { chromium: { launch(o: Record<string, unknown>): Promise<{ version(): string; close(): Promise<void> }> }; default?: unknown };
        const use = browserUse();
        const launchOptions = { headless: true, ...(use.channel !== undefined && { channel: use.channel }), ...(use.launchOptions ?? {}) };
        const browser = await pw.chromium.launch(launchOptions);
        const version = browser.version();
        await browser.close();
        return `起動 OK (${use.channel ?? use.launchOptions?.executablePath ?? "chromium"} ${version})`;
      },
    });
  }
  if (!o.skipHost) {
    checks.push({
      name: "ホスト exe の起動と CDP 接続 (api / host 用)",
      run: async () => {
        if (cfg.host === undefined) return "e2e.config.ts に host が無いためスキップ";
        const pw = (await import("@playwright/test")) as unknown as { chromium: Parameters<typeof launchHost>[0]["chromium"] };
        const app = await launchHost({
          exe: path.resolve(appRoot, cfg.host.exe),
          devUrl: cfg.host.devUrl ?? cfg.web.url,
          cdpPort: cfg.host.cdpPort,
          startupTimeoutMs: cfg.host.startupTimeoutMs,
          env: cfg.host.env,
          chromium: pw.chromium,
        });
        try {
          const url = app.page.url();
          const title = await app.page.title().catch(() => "");
          const exposed = await app.page
            .evaluate((g) => typeof (window as unknown as Record<string, unknown>)[g] === "object", cfg.bridgeGlobal ?? "__webview2Bridge")
            .catch(() => false);
          return `接続 OK (${url}${title !== "" ? ` "${title}"` : ""}, window.${cfg.bridgeGlobal ?? "__webview2Bridge"}: ${exposed ? "公開あり" : "未公開 — dev サーバーが起動しているか、bridge.ts の公開行を確認"})`;
        } finally {
          await app.close();
        }
      },
    });
  }
  if (!o.skipDb) {
    checks.push({
      name: "テスト DB への接続とガード (api / host 用)",
      run: async () => {
        const loaded = loadEnvFiles(appRoot, cfg.db?.envFiles);
        const knexConfig = knexConfigFromEnv();
        if (knexConfig === undefined) {
          return `E2E_DB_CLIENT が未設定のためスキップ (読んだ env ファイル: ${loaded.length > 0 ? loaded.map((f) => path.relative(appRoot, f)).join(", ") : "なし"})`;
        }
        const desc = describeConnection(knexConfig.client, knexConfig.connection);
        const guard = checkAllowed(desc, cfg.db?.allowedDatabases ?? []);
        if (!guard.ok) throw new Error(guard.reason);
        const knexModule = (await import("knex")) as unknown as { default: (c: Knex.Config) => Knex };
        const knex = knexModule.default(knexConfig as Knex.Config);
        try {
          const sql = knexConfig.client === "oracledb" ? "select 1 as ok from dual" : "select 1 as ok";
          await knex.raw(sql);
          return `接続 OK (${desc.label})`;
        } finally {
          await knex.destroy();
        }
      },
    });
  }

  let failures = 0;
  for (const c of checks) {
    try {
      const msg = await c.run();
      console.log(`✓ ${c.name}: ${msg}`);
    } catch (e) {
      failures++;
      console.log(`✗ ${c.name}: ${errorMessage(e)}`);
    }
  }
  console.log(failures === 0 ? "\nすべて通りました。pnpm test:all を実行できます" : `\n${failures} 件が通りませんでした。上の理由を直してから再実行してください`);
  return failures === 0 ? 0 : 1;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "doctor") return doctor(rest);
  usage();
}

// gen / create の cli と同じく bin 専用ファイルなので無条件に実行する(pnpm の bin シムはシンボリックリンク経由で
// 起動するため、process.argv[1] と import.meta.url の比較では「直接実行」を判定できない)
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`webview2-bridge-test: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
