/**
 * Transport の選択と client の生成（アプリ内で 1 か所だけ）。
 * - window.chrome.webview があれば WebView2Transport（WinForms ホスト内）
 * - なければ VITE_TRANSPORT（既定 memory）。将来 msw / http を足すときはここに case を追加する
 */
import { createClient, hasWebView2, MemoryTransport, WebView2Transport, type Transport } from "@wvbridge/client";
import { contract } from "@wvbridge/contract";
import { createMockHandlers } from "./mock/handlers";

export type TransportKind = "webview2" | "memory";

export function resolveTransportKind(): TransportKind {
  if (hasWebView2()) return "webview2";
  const env = import.meta.env.VITE_TRANSPORT ?? "memory";
  switch (env) {
    case "memory":
      return "memory";
    default:
      console.warn(`[wvbridge] unknown VITE_TRANSPORT="${env}", falling back to memory`);
      return "memory";
  }
}

export function createTransport(kind: TransportKind): Transport {
  switch (kind) {
    case "webview2":
      return new WebView2Transport();
    case "memory":
      return new MemoryTransport(createMockHandlers(), { delay: 150 });
  }
}

export const transportKind = resolveTransportKind();
export const client = createClient(contract, createTransport(transportKind));
