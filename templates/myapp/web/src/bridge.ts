import { MemoryTransport, createClient, selectTransport, type MemoryHandlers } from "@ishibashi0112/webview2-bridge-client";
import { contract, type Contract } from "../../contract/contract";

// ブラウザ単体（pnpm dev）で動かすためのモック。VB 側 CustomersApi と振る舞いを揃える
const customers = [
  { id: "1", name: "山田商事" },
  { id: "2", name: "佐藤工業" },
  { id: "3", name: "鈴木電機" },
];
const handlers: MemoryHandlers<Contract> = {
  customers: {
    list: async (input, { emit }) => {
      emit("progress", { percent: 0 });
      await new Promise((r) => setTimeout(r, 100));
      const kw = input.keyword ?? "";
      emit("progress", { percent: 100 });
      return { items: customers.filter((c) => c.name.includes(kw)) };
    },
  },
};

// window.chrome.webview があれば WebView2（VB ホスト内）、なければ VITE_TRANSPORT（既定 memory）
const selected = selectTransport({
  mode: import.meta.env.VITE_TRANSPORT,
  factories: { memory: () => new MemoryTransport<Contract>(handlers, { delay: 50 }) },
});

export const transportMode = selected.mode;
export const client = createClient(contract, selected.transport);
