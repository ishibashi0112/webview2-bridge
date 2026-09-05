import type { Transport } from "./transport.js";
import { WebView2Transport } from "./webview2.js";

export type TransportFactory = () => Transport;

export interface SelectTransportOptions {
  /**
   * 明示的なモード。アプリ側で `import.meta.env.VITE_TRANSPORT` を渡す想定。
   * undefined / "" / "auto" のときは WebView2 があれば "webview2"、なければ fallback。
   */
  mode?: string | undefined;
  /** モード名 → transport 生成。"webview2" を省略すると既定の WebView2Transport */
  factories: Record<string, TransportFactory>;
  /** auto で WebView2 が無いときに使うモード（既定 "memory"） */
  fallback?: string;
}

/**
 * 実行環境から transport を選ぶ。
 * 将来 "msw" / "http" などを足すときは factories にキーを追加するだけでよい。
 */
export function selectTransport(options: SelectTransportOptions): { mode: string; transport: Transport } {
  const factories: Record<string, TransportFactory> = {
    webview2: () => new WebView2Transport(),
    ...options.factories,
  };
  let mode = options.mode?.trim() || "auto";
  if (mode === "auto") {
    mode = WebView2Transport.isAvailable() ? "webview2" : (options.fallback ?? "memory");
  }
  const factory = factories[mode];
  if (!factory) {
    throw new Error(`Unknown transport mode "${mode}" (available: ${Object.keys(factories).join(", ")})`);
  }
  return { mode, transport: factory() };
}
