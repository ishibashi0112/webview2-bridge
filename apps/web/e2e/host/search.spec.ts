import { expect, test } from "@ishibashi0112/webview2-bridge-test";

// L3: 実 exe の WebView2 内で画面を操作し、VB の応答が画面に出るところまで通す。Windows でのみ走る(pnpm test:e2e)。
// screen(L1)と同じ操作を、モックではなく本物の VB に対して行う

test("実機: バッジが webview2 で、m6 検索で VB の 3 件と progress 100% が表示される", async ({ page }) => {
  await expect(page.getByTestId("transport-badge")).toHaveText("transport: webview2");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-results").locator("tbody tr")).toHaveCount(3);
  await expect(page.getByTestId("search-progress")).toContainText("100%");
});

test('実機: keyword "error" で VB の例外が -32000 として表示される', async ({ page }) => {
  await page.getByTestId("search-keyword").fill("error");
  await page.getByTestId("search-submit").click();
  await expect(page.getByTestId("search-error-kind")).toContainText("-32000");
});
