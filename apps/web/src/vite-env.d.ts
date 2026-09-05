/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebView2 の外で使う Transport。`memory`（既定）。将来 `msw` / `http` を足す */
  readonly VITE_TRANSPORT?: string;
}
