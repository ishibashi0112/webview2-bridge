/**
 * WinForms ホスト exe を CDP(Chrome DevTools Protocol)有効で起動し、Playwright から WebView2 に接続する。
 * VB 側は無改修: WebView2 は環境変数 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS を読む。
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export interface LaunchHostOptions {
  /** ホスト exe の絶対パス */
  exe: string;
  /** exe に WEBVIEW2_BRIDGE_DEV_URL として渡す URL(dev サーバー)。省略すると exe 隣の wwwroot を読む */
  devUrl?: string | undefined;
  cdpPort?: number | undefined;
  startupTimeoutMs?: number | undefined;
  env?: Record<string, string> | undefined;
  /** 接続に使う playwright の chromium(BrowserType) */
  chromium: { connectOverCDP(endpointURL: string, options?: { timeout?: number }): Promise<Browser> };
  /** ログ出力(既定: なし) */
  log?: ((message: string) => void) | undefined;
}

export interface HostApp {
  process: ChildProcess;
  cdpUrl: string;
  userDataDir: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close(): Promise<void>;
}

export class HostLaunchError extends Error {
  override name = "HostLaunchError";
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** CDP の /json/version に応答があるか */
export async function probeCdp(cdpUrl: string, timeoutMs = 1000): Promise<boolean> {
  try {
    const res = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function launchHost(options: LaunchHostOptions): Promise<HostApp> {
  const exe = options.exe;
  const port = options.cdpPort ?? 9222;
  const cdpUrl = `http://127.0.0.1:${port}`;
  const timeoutMs = options.startupTimeoutMs ?? 30_000;
  const log = options.log ?? (() => {});

  if (!existsSync(exe)) {
    throw new HostLaunchError(`ホスト exe が見つかりません: ${exe}\n  先に dotnet build(Debug)を実行してください`);
  }
  if (await probeCdp(cdpUrl)) {
    throw new HostLaunchError(`ポート ${port} で既に何かが CDP を待ち受けています(前回の exe が残っていませんか)。終了するか e2e.config.ts の host.cdpPort を変えてください`);
  }

  const userDataDir = mkdtempSync(path.join(tmpdir(), "wv2b-e2e-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: userDataDir,
    ...(options.devUrl !== undefined && { WEBVIEW2_BRIDGE_DEV_URL: options.devUrl }),
    ...options.env,
  };
  log(`launch ${exe} (cdp ${port})`);
  const child = spawn(exe, [], { env, stdio: "ignore", cwd: path.dirname(exe), windowsHide: false });
  let exited: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  child.on("exit", (code, signal) => {
    exited = { code, signal };
  });
  const spawnError = new Promise<never>((_, reject) => child.on("error", (e) => reject(new HostLaunchError(`exe を起動できません: ${e.message}`))));

  const cleanupOnFailure = async (): Promise<void> => {
    await killTree(child);
    rmSync(userDataDir, { recursive: true, force: true });
  };

  // CDP が開くまで待つ
  const deadline = Date.now() + timeoutMs;
  try {
    while (!(await probeCdp(cdpUrl))) {
      if (exited !== undefined) {
        throw new HostLaunchError(`exe が起動直後に終了しました(code=${exited.code ?? "?"} signal=${exited.signal ?? "-"})。exe を手で起動してエラーを確認してください`);
      }
      if (Date.now() > deadline) {
        throw new HostLaunchError(`${timeoutMs}ms 待っても CDP(${cdpUrl})が開きません。exe が WebView2 を初期化できているか(WebView2 Runtime の有無)を確認してください`);
      }
      await Promise.race([sleep(250), spawnError]);
    }
    log("cdp ready");
    const browser = await options.chromium.connectOverCDP(cdpUrl, { timeout: Math.max(5_000, deadline - Date.now()) });
    const context = browser.contexts()[0];
    if (context === undefined) {
      await browser.close();
      throw new HostLaunchError("WebView2 に接続できましたが BrowserContext がありません");
    }
    let page = pickPage(context.pages(), options.devUrl);
    while (page === undefined) {
      if (Date.now() > deadline) {
        await browser.close();
        throw new HostLaunchError("WebView2 に接続できましたがページが開きません(MainForm が WebView2 を初期化しているか確認してください)");
      }
      await sleep(250);
      page = pickPage(context.pages(), options.devUrl);
    }
    await page.waitForLoadState("domcontentloaded", { timeout: Math.max(5_000, deadline - Date.now()) });
    log(`page ${page.url()}`);
    const app: HostApp = {
      process: child,
      cdpUrl,
      userDataDir,
      browser,
      context,
      page,
      async close() {
        try {
          await browser.close();
        } catch {
          // 既に切れている
        }
        await killTree(child);
        for (let i = 0; i < 5; i++) {
          try {
            rmSync(userDataDir, { recursive: true, force: true });
            break;
          } catch {
            await sleep(300);
          }
        }
      },
    };
    return app;
  } catch (e) {
    await cleanupOnFailure();
    throw e;
  }
}

function pickPage(pages: Page[], devUrl: string | undefined): Page | undefined {
  if (pages.length === 0) return undefined;
  if (devUrl !== undefined) {
    const hit = pages.find((p) => p.url().startsWith(devUrl));
    if (hit !== undefined) return hit;
  }
  return pages.find((p) => p.url() !== "about:blank") ?? pages[0];
}

/** exe とその子プロセス(msedgewebview2)を終了する */
export async function killTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  const pid = child.pid;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => resolve()));
  } else {
    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }
  }
  await Promise.race([exited, sleep(5_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}
