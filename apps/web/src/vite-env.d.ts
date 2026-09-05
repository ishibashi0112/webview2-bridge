/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** transport の明示指定: "memory" | "webview2"。未指定なら自動（WebView2 内なら webview2、それ以外は memory） */
  readonly VITE_TRANSPORT?: string;
}
