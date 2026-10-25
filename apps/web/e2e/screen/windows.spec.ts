import { expect, test } from "@ishibashi0112/webview2-bridge-test";

// L1: サブウィンドウ(src/windows.ts の openScreen)。ブラウザ単体(MemoryTransport)でも WebView2 と同じ window.open が本物のポップアップを開く。
// 新しいウィンドウは同じ context に新しい Page として現れる(waitForWindow)。WebView2 での位置・大きさ・同報は Windows 実機の確認項目(HANDOFF.md §14)

test("「右に開く」で同じ画面が別ウィンドウに開き、そこでも検索でき、もう一度押すと同じ窓を使い、閉じるボタンで閉じる", async ({ page, waitForWindow }) => {
  await page.goto("/");
  await expect(page.getByTestId("window-name")).toHaveText("window: main");

  await page.getByTestId("windows-open-right").click();
  const sub = await waitForWindow((p) => p.url().includes("#/parts"), { description: "#/parts のサブウィンドウ" });
  await expect(sub.getByTestId("window-name")).toHaveText("window: parts-right");
  await expect(sub.getByTestId("transport-badge")).toHaveText("transport: memory");
  expect(await sub.evaluate(() => window.opener !== null)).toBe(true);

  // 子ウィンドウからも契約メソッドが呼べる
  await sub.getByTestId("search-submit").click();
  await expect(sub.getByTestId("search-results").locator("tbody tr")).toHaveCount(3);

  // 名前(parts-right)が同じなので新しい窓は開かず、同じ窓が使われる(route も同じなので画面の状態も残る)
  const another = page.waitForEvent("popup", { timeout: 1_000 }).then(
    () => true,
    () => false,
  );
  await page.getByTestId("windows-open-right").click();
  expect(await another).toBe(false);
  await expect(sub.getByTestId("search-results").locator("tbody tr")).toHaveCount(3);

  // 開いた側が持つ WindowProxy の close() で閉じる
  await page.getByTestId("windows-close").click();
  await expect.poll(() => sub.isClosed()).toBe(true);
});
