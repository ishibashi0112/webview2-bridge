import { expect, mockReturn, mockThrow, test } from "@ishibashi0112/webview2-bridge-test";

// L1(screen): 画面ロジック。Vite dev サーバー + MemoryTransport(web/src/bridge.ts のモック)で動く。DB も VB も不要。
// 観点は仕様書 §3-3 入力項目 / §4 機能一覧 / §8 0 件時 などから読み取る(e2e/README.md の表)。この見本は雛形の振る舞いから。

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("transport-badge")).toHaveText("memory");
});

test("keyword が空のまま検索すると全件(3 件)が一覧に出る", async ({ page }) => {
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-item")).toHaveCount(3);
  await expect(page.getByTestId("customers-item").first()).toHaveText("1: 山田商事");
});

test("keyword で名前を部分一致で絞り込める", async ({ page }) => {
  await page.getByTestId("customers-keyword").fill("佐藤");
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-item")).toHaveCount(1);
  await expect(page.getByTestId("customers-item").first()).toContainText("佐藤工業");
});

test("該当が無いときは一覧が空になる", async ({ page }) => {
  await page.getByTestId("customers-keyword").fill("該当なし");
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-progress")).toHaveText("100%");
  await expect(page.getByTestId("customers-item")).toHaveCount(0);
});

test("keyword に % を含むと業務エラーが入力欄の横に出る(VB の JsonRpcException.Business と同じ形)", async ({ page }) => {
  await page.getByTestId("customers-keyword").fill("山%");
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-keyword-error")).toHaveText("キーワードに % は使えません");
  await expect(page.getByTestId("customers-error")).toHaveCount(0);
  await expect(page.getByTestId("customers-item")).toHaveCount(0);
});

test("取得に失敗したとき(VB の未処理例外 -32000)はエラー欄にそのまま出る", async ({ page }) => {
  // モック(bridge.ts)のデータに仕込まず、このテストの間だけ応答を差し替える
  await mockThrow(page, "customers.list", { code: -32000, message: "DB に接続できません", data: "System.Data.SqlClient.SqlException" });
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-error")).toContainText("DB に接続できません");
  await expect(page.getByTestId("customers-item")).toHaveCount(0);
});

test("応答を差し替えると、その内容が一覧に出る(差し替えは次の読み込みにも効く)", async ({ page }) => {
  await mockReturn(page, "customers.list", { items: [{ id: "9", name: "差し替え" }] });
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-item")).toHaveText(["9: 差し替え"]);
  await page.reload();
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-item")).toHaveText(["9: 差し替え"]);
});

test("検索中の progress イベントが 100% まで届く", async ({ page }) => {
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-progress")).toHaveText("100%");
});
