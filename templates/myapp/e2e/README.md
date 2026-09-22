# 自動テスト(e2e/)

会社 PC で手を動かす動作確認を、テストコードで置き換えるための置き場。`@ishibashi0112/webview2-bridge-test`
(Playwright のフィクスチャ + DB ヘルパ + AI 向けレポータ)を使う。テストは **すべて TypeScript**。VB にテストは書かない。

## 3 層

| 層 | 置き場 | 確かめること | DB | 走る場所 |
|---|---|---|---|---|
| screen | `e2e/screen/` | 画面の振る舞い(入力検証、活性、一覧、エラー表示)。Vite dev + モック応答 | 不要 | どこでも(Mac / Claude Code / 会社 PC) |
| api | `e2e/api/` | 実 exe の VB を契約メソッド名で直接呼び、応答と DB 更新を確認。画面は操作しない | 要 | 会社 PC(Windows) |
| host | `e2e/host/` | 実 exe の WebView2 で画面を操作し、DB が変わるところまで | 要 | 会社 PC(Windows) |

## コマンド

```sh
pnpm test          # screen(+ Vitest があればそれも)。Vite dev サーバーは自動で起動(起動済みなら再利用)
pnpm test:e2e      # api + host。先に dotnet build dotnet/MyApp.sln(Debug)
pnpm test:all      # 会社 PC で打つ 1 コマンド(test → test:e2e)
pnpm test:doctor   # 会社 PC の前提確認(ブラウザ / exe の起動と CDP 接続 / テスト DB)
```

結果は `test-results/report.md` に Markdown で出る。失敗があるとクリップボードにもコピーされるので、そのまま AI チャットに貼る。

## テストの型(これ 1 つに固定する)

```ts
import { expect, test } from "@ishibashi0112/webview2-bridge-test";

test("受注を登録すると Orders に 1 行増え、画面に採番が表示される", async ({ page, db, testId }) => {
  // Arrange: このテスト固有の前提データを入れ、変化を見たいテーブルを控える
  await db.insert("Customers", { CustomerCode: `${testId}-C1`, Name: "テスト顧客" });
  const before = await db.snapshot([{ table: "Orders", key: ["OrderNo"], where: { CustomerCode: `${testId}-C1` } }]);

  // Act: 画面を操作する(data-testid で要素を指す)
  await page.getByTestId("order-customer-code").fill(`${testId}-C1`);
  await page.getByTestId("order-submit").click();
  await expect(page.getByTestId("order-no")).toHaveText(/^ORD-/);

  // Assert: DB の変化を確かめる
  const diff = await db.diff(before);
  expect(diff.Orders.inserted).toHaveLength(1);
  expect(diff.Orders.inserted[0]).toMatchObject({ CustomerCode: `${testId}-C1`, Status: "NEW" });
});
```

api 層は Act が画面操作ではなく契約メソッドの呼び出しになる:

```ts
test("orders.register は Orders に 1 行入れ、採番した OrderNo を返す", async ({ bridge, db, testId }) => {
  await db.insert("Customers", { CustomerCode: `${testId}-C1`, Name: "テスト顧客" });
  const before = await db.snapshot([{ table: "Orders", key: ["OrderNo"], where: { CustomerCode: `${testId}-C1` } }]);
  const res = await bridge.call<{ orderNo: string }>("orders.register", { customerCode: `${testId}-C1`, lines: [{ partNo: "A-001", qty: 2 }] });
  expect(res.orderNo).toMatch(/^ORD-/);
  expect((await db.diff(before)).Orders.inserted).toHaveLength(1);
});
```

失敗を期待するときは `const err = await bridge.expectError("orders.register", {...}); expect(err.code).toBe(-32000);`。

### フィクスチャ

| 名前 | 層 | 役割 |
|---|---|---|
| `page` | 全部 | screen は Playwright のブラウザ、api / host は WebView2 のページ(テストごとに reload) |
| `bridge` | api / host | `bridge.call("ns.method", input)` / `bridge.expectError(...)`。ページ内の `window.__webview2Bridge`(開発ビルドで `web/src/bridge.ts` が公開)を呼ぶ |
| `db` | api / host | `query` / `insert` / `rows` / `snapshot` / `diff` / `expectRow`。`insert` した行と `diff` で増えた行はテスト終了時に自動で削除 |
| `testId` | 全部 | `E2E-20260922-1432-a7z9` の形。テストが作るデータのキー・名称の接頭辞にする |

### 約束

- **Arrange / Act / Assert** の 3 段で書き、1 テスト 1 観点。題名は「〜すると〜になる」の形で仕様の文に近づける
- 画面の要素は `data-testid="<画面>-<役割>"` で指す(React 側に付ける)。文言や CSS では選ばない
- 既存データに依存しない。前提行は `testId` 接頭辞を付けて `db.insert` で自分で入れる。本番データを前提にしない
- 採番値やタイムスタンプを決め打ちしない。`diff` の `inserted` から読む
- api / host は直列で走る(DB を共有するため)。screen も 1 ワーカー

## テストの観点はどこから読むか

ユーザーに聞かず、仕様書(`docs/spec/`)と設計書(`docs/design/`)から読み取る。文書に無い振る舞いはテストにせず、確認事項に回す。

| 読み取り元 | 観点 | 層 |
|---|---|---|
| 仕様書 §3-3 入力項目 / 設計書 §4-2 入力項目と検証 | 必須・桁・形式・範囲の検証と、そのエラー表示 | screen |
| 仕様書 §3-2 操作一覧 / 設計書 §4-3 操作と活性条件 | ボタン・メニューの活性条件 | screen |
| 仕様書 §4 機能一覧・§5 処理フロー / 設計書 §5 処理仕様 | 機能ごとの正常系の通し、契約メソッドごとの応答と DB 更新 | host / api |
| 仕様書 §7 業務ルール・制約 / 設計書 §3-3 キー・採番・突き合わせの規則 | ルール違反時の拒否、採番の形式 | api |
| 仕様書 §8 エラー時・0 件時 / 設計書 §8 エラー処理・0 件時の方針 | 0 件表示、失敗時のメッセージ、ロールバック | screen / api |
| 設計書 §5-3 トランザクション・排他・監査列 | 監査列の更新、二重登録の防止 | api |

## DB の設定

1. `.env.e2e.example` を `.env.e2e.local` にコピーして接続情報を書く(git には入れない)。SQL Server は `tedious`、Oracle は `oracledb`(thin モード、Instant Client 不要)が同梱済み。他の DB は `pnpm add -D pg` などドライバを足すだけ
2. `e2e/e2e.config.ts` の `db.allowedDatabases` にテスト DB の名前を書く。接続先がここに無いとテストは起動時に止まる(本番に向けて走らせないためのガード)
3. `pnpm test:doctor` で接続を確認

Oracle の注意: テーブル名・列名は引用符付きで DB に渡るので、DB 上の実際の名前(通常は大文字)で書く。日付は `toMatchObject` で必要な列だけ比べる。

## Windows で走らせる前提

- `pnpm install` が通ること(Playwright はブラウザをダウンロードしない設定 `.npmrc`。screen は PC の Edge、api / host は WebView2 ランタイムに繋ぐ)
- `dotnet build dotnet/MyApp.sln`(Debug)済み。exe は環境変数 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` 付きで起動され、CDP(F12 と同じ口)で操作される。VB の改修は不要。配布する exe には影響しない
