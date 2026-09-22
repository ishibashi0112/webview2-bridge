import { expect, test } from "@ishibashi0112/webview2-bridge-test";

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

test("検索中の progress イベントが 100% まで届く", async ({ page }) => {
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-progress")).toHaveText("100%");
});
