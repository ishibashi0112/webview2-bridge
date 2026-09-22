/**
 * launchHost / createBridge の統合テスト。WinForms ホストの代わりに fixtures/fake-host.sh(ヘッドレス Chromium)を起動し、
 * 本物の CDP 接続でページ取得と契約呼び出しを通す。Chromium が無い環境ではスキップ。
 */
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridge } from "../src/bridge.js";
import { HostLaunchError, launchHost, probeCdp } from "../src/host.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeHost = path.join(here, "fixtures/fake-host.sh");
const chrome = process.env["E2E_BROWSER_EXECUTABLE"] ?? safeExecutablePath();
const canRun = process.platform !== "win32" && chrome !== undefined && existsSync(chrome);

function safeExecutablePath(): string | undefined {
  try {
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>fake app</title></head><body>
<h1 data-testid="title">fake app</h1>
<script>
  window.__webview2Bridge = {
    parts: {
      search: async (input) => ({ items: [{ partNo: "A-001", name: "Bolt " + input.keyword }] }),
      fail: async () => { const e = new Error("Simulated failure"); e.name = "BridgeError"; e.code = -32000; e.data = "System.InvalidOperationException"; throw e; },
    },
  };
</script></body></html>`;

describe.skipIf(!canRun)("launchHost + createBridge (fake host = headless Chromium)", () => {
  let server: http.Server;
  let devUrl: string;
  const env = { FAKE_HOST_CHROME: chrome ?? "" };

  beforeAll(async () => {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("no address");
    devUrl = `http://127.0.0.1:${addr.port}/index.html`;
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("起動 → CDP 接続 → ページ取得 → 契約呼び出し → close で子プロセスが終わる", async () => {
    const app = await launchHost({ exe: fakeHost, devUrl, cdpPort: 9333, env, chromium, startupTimeoutMs: 30_000 });
    try {
      expect(app.page.url()).toBe(devUrl);
      expect(await app.page.getByTestId("title").textContent()).toBe("fake app");
      const bridge = createBridge(app.page);
      expect(await bridge.isAvailable()).toBe(true);
      expect(await bridge.call("parts.search", { keyword: "M6" })).toEqual({ items: [{ partNo: "A-001", name: "Bolt M6" }] });
      const err = await bridge.expectError("parts.fail");
      expect(err.code).toBe(-32000);
      // 同じポートで 2 つ目は起動できない
      await expect(launchHost({ exe: fakeHost, devUrl, cdpPort: 9333, env, chromium })).rejects.toThrow(HostLaunchError);
    } finally {
      await app.close();
    }
    expect(app.process.exitCode !== null || app.process.signalCode !== null).toBe(true);
    expect(existsSync(app.userDataDir)).toBe(false);
    expect(await probeCdp(app.cdpUrl)).toBe(false);
  }, 60_000);

  it("exe が無ければ HostLaunchError", async () => {
    await expect(launchHost({ exe: path.join(here, "nope.exe"), chromium })).rejects.toThrow(/dotnet build/);
  });

  it("起動直後に終了する exe は理由付きで失敗する", async () => {
    await expect(launchHost({ exe: path.join(here, "fixtures/exit-host.sh"), cdpPort: 9334, chromium, startupTimeoutMs: 10_000 })).rejects.toThrow(/起動直後に終了/);
  }, 20_000);
});
