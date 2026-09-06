# vb-runtime

VB.NET ランタイムのコピー。**手で編集しない。**

唯一の正はリポジトリの `dotnet/WebView2Bridge.Runtime/*.vb` と `dotnet/WebView2Bridge.WinForms/WebViewBridge.vb`。
`pnpm --filter @ishibashi0112/webview2-bridge-gen sync:vb-runtime`（`pnpm build` でも自動実行）でここへコピーされ、
npm パッケージに同梱される。`vb-runtime.test.ts` が dotnet/ と一致していることを検証する。

利用側アプリでは `webview2-bridge.gen.json` の `vb.runtime.outDir` / `vb.winforms.outDir` を設定すると、
`webview2-bridge-gen` がこれらを auto-generated ヘッダ付きで書き出す（NuGet は不要）。
