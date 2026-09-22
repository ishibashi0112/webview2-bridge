/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** transport の明示指定: "memory" | "webview2" | "http"。未指定なら自動（WebView2 内なら webview2、それ以外は memory） */
  readonly VITE_TRANSPORT?: string;
  /** VITE_TRANSPORT=http のときの baseUrl（既定 "/api"） */
  readonly VITE_HTTP_BASE_URL?: string;
  /** "1" なら本番ビルドでもブリッジクライアントを window.__webview2Bridge に公開する(自動テスト用。開発ビルドは常に公開) */
  readonly VITE_EXPOSE_BRIDGE?: string;
}
