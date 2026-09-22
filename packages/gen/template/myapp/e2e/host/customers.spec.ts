import { expect, test } from "@ishibashi0112/webview2-bridge-test";

// L3(host): 実 exe の WebView2 内で画面を操作し、VB の応答が画面に出るところまで通す。Windows でのみ走る。
// DB を使う画面なら、db.snapshot → 画面操作 → db.diff で DB の変化まで確かめる(e2e/README.md の見本)

test("実機: バッジが webview2 で、検索すると VB の 3 件が一覧に出る", async ({ page }) => {
  await expect(page.getByTestId("transport-badge")).toHaveText("webview2");
  await page.getByTestId("customers-search").click();
  await expect(page.getByTestId("customers-item")).toHaveCount(3);
  await expect(page.getByTestId("customers-progress")).toHaveText("100%");
});
