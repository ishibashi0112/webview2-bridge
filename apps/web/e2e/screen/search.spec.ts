import { expect, mockReturn, mockThrow, test } from "@ishibashi0112/webview2-bridge-test";

// L1: 画面ロジック。Vite dev サーバー + MemoryTransport(src/mock/handlers.ts)で動く。DB も VB も不要。
// 観点はこの見本の振る舞い(README / handlers.ts)から: 検索結果の表示、limit、入力検証、ホスト例外、0 件、progress

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("transport-badge")).toHaveText("transport: memory");
});

test("既定の keyword(m6)で検索すると一覧に 3 件表示される", async ({ page }) => {
  await page.getByTestId("search-submit").click();
  const rows = page.getByTestId("search-results").locator("tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("A-001");
  await expect(rows.nth(2)).toContainText("Washer M6");
});

test("limit を指定すると件数が絞られる", async ({ page }) => {
  await page.getByTestId("search-limit").fill("2");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-results").locator("tbody tr")).toHaveCount(2);
});

test("keyword が空だと送信前の入力検証エラーになり、一覧は出ない", async ({ page }) => {
  await page.getByTestId("search-keyword").fill("");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-error-kind")).toHaveText("validation (input)");
  await expect(page.getByTestId("search-results")).toHaveCount(0);
});

test('keyword が "error" だとホスト例外(-32000)が表示される', async ({ page }) => {
  await page.getByTestId("search-keyword").fill("error");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-error-kind")).toContainText("-32000");
  await expect(page.getByTestId("search-error")).toContainText("Simulated failure");
});

test('keyword に "%" を含むと業務エラー(-32010)が message と field 付きで表示される', async ({ page }) => {
  await page.getByTestId("search-keyword").fill("m6%");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-error-kind")).toHaveText("business -32010");
  await expect(page.getByTestId("search-error")).toContainText("キーワードに % は使えません");
  await expect(page.getByTestId("search-error")).toContainText("field: keyword");
  await expect(page.getByTestId("search-results")).toHaveCount(0);
});

test("mockThrow で差し替えた失敗(-32603 等)がそのテストの間だけ表示される", async ({ page }) => {
  await mockThrow(page, "parts.search", { code: -32603, message: "差し替えた失敗", data: { reason: "test" } });
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-error-kind")).toHaveText("BridgeError -32603");
  await expect(page.getByTestId("search-error")).toContainText("差し替えた失敗");
});

test("mockReturn で差し替えた応答が一覧に出る", async ({ page }) => {
  await mockReturn(page, "parts.search", { items: [{ partNo: "Z-999", name: "差し替え", qty: 1, updatedAt: "2026-10-09T00:00:00Z" }] });
  await page.getByTestId("search-submit").click();
  const rows = page.getByTestId("search-results").locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Z-999");
});

test("該当が無いときは「該当なし」の行が出る", async ({ page }) => {
  await page.getByTestId("search-keyword").fill("zzz");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-empty")).toBeVisible();
});

test("検索中の progress イベントが 100% まで届き、events ログに残る", async ({ page }) => {
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-progress")).toContainText("100%");
  await expect(page.getByTestId("events-log").locator("li")).toHaveCount(3);
});
