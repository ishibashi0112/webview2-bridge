import { expect, test } from "@ishibashi0112/webview2-bridge-test";

// L2: 実 exe(WebView2Bridge.Host、Debug ビルド)の VB PartsApi を契約経由で直接呼ぶ。画面は操作しない。
// Windows でのみ走る(pnpm test:e2e)。観点は Impl/PartsApi.vb の振る舞い(handlers.ts と同じ)

test("parts.search は keyword に部分一致する部品を返す", async ({ bridge }) => {
  const res = await bridge.call<{ items: { partNo: string }[] }>("parts.search", { keyword: "m6" });
  expect(res.items.map((p) => p.partNo)).toEqual(["A-001", "A-002", "A-003"]);
});

test("parts.search は limit で件数を絞る", async ({ bridge }) => {
  const res = await bridge.call<{ items: unknown[] }>("parts.search", { keyword: "m6", limit: 1 });
  expect(res.items).toHaveLength(1);
});

test('parts.search は keyword が "error" のときホスト例外 -32000 を返す', async ({ bridge }) => {
  const err = await bridge.expectError("parts.search", { keyword: "error" });
  expect(err.code).toBe(-32000);
  expect(err.data).toBe("System.InvalidOperationException");
});

test("parts.search は空の keyword を送信前の入力検証で拒否する", async ({ bridge }) => {
  const err = await bridge.expectError("parts.search", { keyword: "" });
  expect(err.remoteName).toBe("BridgeValidationError");
});
