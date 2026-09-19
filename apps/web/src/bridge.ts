import { HttpTransport, MemoryTransport, createClient, selectTransport } from "@ishibashi0112/webview2-bridge-client";
import { contract, type Contract } from "@webview2-bridge/contract";
import { handlers } from "./mock/handlers";

// transport の選択:
//   window.chrome.webview があれば WebView2（VB ホスト内）、なければ VITE_TRANSPORT（既定 memory）。
//   "http" は契約を HTTP で提供するサーバー（contract/openapi.json の形）につなぐ。VITE_HTTP_BASE_URL で場所を指定する。
//   将来 "msw" などを足すときは factories にキーを追加する。
const selected = selectTransport({
  mode: import.meta.env.VITE_TRANSPORT,
  factories: {
    memory: () => new MemoryTransport<Contract>(handlers, { delay: 100 }),
    http: () => new HttpTransport({ baseUrl: import.meta.env.VITE_HTTP_BASE_URL ?? "/api" }),
  },
});

export const transportMode = selected.mode;
export const client = createClient(contract, selected.transport);
