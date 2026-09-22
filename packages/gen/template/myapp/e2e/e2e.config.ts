import { defineE2EConfig } from "@ishibashi0112/webview2-bridge-test";

// 自動テストの設定。パスはこのアプリのルート(playwright.config.ts のある場所)基準。
export default defineE2EConfig({
  // screen の baseURL と、host に渡す WEBVIEW2_BRIDGE_DEV_URL。Playwright が起動し、起動済みなら再利用する
  web: { command: "pnpm dev", url: "http://localhost:5173" },
  // api / host が起動する exe(Debug ビルド。先に dotnet build dotnet/MyApp.sln)
  host: { exe: "dotnet/MyApp.Host/bin/Debug/net48/MyApp.Host.exe" },
  // DB を検証するとき(接続情報は .env.e2e.local。.env.e2e.example を参照)
  // db: {
  //   // 本番に向けて走らないためのガード。テスト DB の名前(または "host/DB名")だけを書く。空だと DB を使うテストは起動時に止まる
  //   allowedDatabases: ["MyApp_Test"],
  //   // 毎テストの前後で自動的に差分を取り、増えた行を後片付けするテーブル(任意)
  //   track: [{ table: "Orders", key: ["OrderNo"], where: (qb, testId) => qb.where("CustomerCode", "like", `${testId}%`) }],
  // },
});
