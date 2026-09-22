# @ishibashi0112/webview2-bridge-test

webview2-bridge で作ったアプリ(WinForms + WebView2 + React)の動作確認を、Playwright のテストコードで置き換えるための部品。

- **フィクスチャ**: `page`(WebView2 のページ)/ `bridge`(契約メソッドを直接呼ぶ)/ `db`(Knex を包む DB ヘルパ。前後差分と自動の後片付け)/ `testId`
- **ホスト起動**: exe を `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=NNNN` 付きで起動し、CDP で接続する。VB は無改修
- **レポータ**: 結果を AI チャットに貼れる Markdown(`test-results/report.md`)にまとめ、失敗があればクリップボードへ
- **doctor**: 会社 PC の前提(ブラウザ / exe と CDP / テスト DB とガード)を 1 コマンドで確認

雛形(`pnpm create webview2-bridge`)には組み込み済み。テストの書き方は雛形の `e2e/README.md`。

## 使い方

```ts
// playwright.config.ts(アプリのルート)
import { defineConfig } from "@playwright/test";
import { playwrightConfig } from "@ishibashi0112/webview2-bridge-test/config";
import e2e from "./e2e/e2e.config";
export default defineConfig(playwrightConfig(e2e));

// e2e/e2e.config.ts
import { defineE2EConfig } from "@ishibashi0112/webview2-bridge-test";
export default defineE2EConfig({
  web: { command: "pnpm dev", url: "http://localhost:5173" },
  host: { exe: "dotnet/MyApp.Host/bin/Debug/net48/MyApp.Host.exe" },
  db: { allowedDatabases: ["MyApp_Test"] },
});

// e2e/host/order.spec.ts
import { expect, test } from "@ishibashi0112/webview2-bridge-test";
test("受注を登録すると Orders に 1 行増える", async ({ page, db, testId }) => {
  const before = await db.snapshot([{ table: "Orders", key: ["OrderNo"], where: { CustomerCode: `${testId}-C1` } }]);
  await page.getByTestId("order-submit").click();
  expect((await db.diff(before)).Orders.inserted).toHaveLength(1);
});
```

プロジェクトは `screen`(Vite dev + モック。DB なし)/ `api`(実 exe を契約経由で呼ぶ)/ `host`(実 exe を画面操作)の 3 つ。
`playwright test --project screen` はどこでも、`--project api --project host` は Windows で走る。

DB の接続情報は `.env.e2e.local`(`E2E_DB_CLIENT=mssql|oracledb|pg|mysql2|better-sqlite3` と `E2E_DB_HOST` 等)。
接続先が `db.allowedDatabases` に無いと起動時に止まる。ドライバ(`tedious` / `oracledb` / `pg` / `mysql2`)はアプリ側で入れる。

環境変数:

| 変数 | 用途 |
|---|---|
| `E2E_BROWSER_EXECUTABLE` | screen 用ブラウザの実行ファイルを直接指定(Chromium をダウンロードできない環境) |
| `E2E_BROWSER_CHANNEL` | screen 用のチャンネル(Windows の既定は `msedge`。`""` で Playwright 同梱の Chromium) |
| `E2E_NO_CLIPBOARD` | レポートをクリップボードにコピーしない |

## 開発

```sh
pnpm test        # Vitest(diff / guard / env / db(sqlite) / reporter / config / bridge / host)
pnpm typecheck
```

`test/host.test.ts` は WinForms ホストの代わりにヘッドレス Chromium(`test/fixtures/fake-host.sh`)を起動して CDP 接続を通す。
Chromium が無ければスキップ。`E2E_BROWSER_EXECUTABLE` で実行ファイルを指定できる。
