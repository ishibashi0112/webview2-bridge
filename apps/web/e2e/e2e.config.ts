import { defineE2EConfig } from "@ishibashi0112/webview2-bridge-test";

// 見本アプリの自動テスト設定。パスはアプリのルート(playwright.config.ts のある apps/web)基準。
// このアプリの VB(PartsApi)は固定データのスタブで DB を使わないので db は書かない。
export default defineE2EConfig({
  web: { command: "pnpm dev", url: "http://localhost:5173" },
  host: { exe: "../../dotnet/WebView2Bridge.Host/bin/Debug/net48/WebView2Bridge.Host.exe" },
});
