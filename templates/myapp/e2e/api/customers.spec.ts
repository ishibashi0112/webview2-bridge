import { expect, test } from "@ishibashi0112/webview2-bridge-test";

// L2(api): 実 exe(MyApp.Host、Debug ビルド)の VB(CustomersApi)を契約経由で直接呼ぶ。画面は操作しない。Windows でのみ走る。
// DB を使う VB なら、db.snapshot → bridge.call → db.diff で DB の変化まで確かめる(e2e/README.md の見本)

test("customers.list は keyword が無ければ全件を返す", async ({ bridge }) => {
  const res = await bridge.call<{ items: { id: string; name: string }[] }>("customers.list", {});
  expect(res.items.map((c) => c.name)).toEqual(["山田商事", "佐藤工業", "鈴木電機"]);
});

test("customers.list は keyword で名前を部分一致で絞り込む", async ({ bridge }) => {
  const res = await bridge.call<{ items: { id: string }[] }>("customers.list", { keyword: "鈴木" });
  expect(res.items.map((c) => c.id)).toEqual(["3"]);
});
