# webview2-bridge
先に HANDOFF.md を読む。設計判断は HANDOFF.md §2 の狙いに従う。決めたことは HANDOFF.md §10 に追記する。

## ルール
- .NET Framework 4.8 / VB.NET / Newtonsoft.Json / SDK スタイル .vbproj。C# は書かない
- dotnet/ 配下は netstandard2.0（Runtime, Contract）と net48（WinForms, Impl, Host）。Runtime と Contract は WebView2 に依存させない
  - 例外: `WebView2Bridge.Contract.Tests` は Mac で `dotnet test` するため net8.0（テスト専用）
- 公開するのは gen / client / create（npm）。VB ランタイム（Runtime / WinForms）は gen が `vb-runtime/` に同梱して各アプリへ書き出す（NuGet は保留）。Contract / Impl / Host / contract / apps はアプリ固有で公開しない
- `packages/gen/vb-runtime/` は `dotnet/WebView2Bridge.Runtime` と `WebView2Bridge.WinForms` のコピー、`packages/gen/template/myapp/` は `templates/myapp/` のコピー。手で編集せず `pnpm --filter @ishibashi0112/webview2-bridge-gen sync`（`pnpm build` で自動）で同期する。VB ランタイムや雛形を直したら gen のバージョンを上げる
- 新規アプリの骨組みは `pnpm create webview2-bridge <dir> --name <Name>`（= `webview2-bridge-gen init`。リポジトリ内では `pnpm gen init`）。雛形の唯一の正は `templates/myapp/`（プレースホルダは `MyApp` / `myapp`）
- ランタイム（Dispatcher 等）は別アセンブリなので、生成コードから Partial Class で拡張しない。生成 Dispatcher は `DispatcherExtensions` の拡張メソッド
- VB は Option Strict On。生成ファイルは手で編集しない（`Generated/` と `apps/web/src/generated/` は `pnpm gen` で全上書き）
- AddHostObjectToScript は使わない。通信は JSON-RPC over postMessage（HANDOFF.md §5）
- Microsoft.VisualBasic.Compatibility 名前空間は使わない
- フロントは Vite + React + TS、pnpm。localStorage 等は使わない
- 既存の旧スタイル .vbproj には触らない（このリポジトリには含めない）
- 日付は ISO 8601 文字列で往復する。VB 側で JSON を読むときは `JObject.Parse` ではなく `JsonRpc.ParseToken` を使う（Date 自動変換を防ぐ）

## 名前
- npm: `@ishibashi0112/webview2-bridge-gen`（packages/gen）、`@ishibashi0112/webview2-bridge-client`（packages/client）、`create-webview2-bridge`（packages/create。スコープ無し）
- 契約: `@webview2-bridge/contract`（contract/、private・非公開）
- NuGet: `WebView2Bridge.Runtime`（dotnet/WebView2Bridge.Runtime、名前空間 `WebView2Bridge.Runtime`）、`WebView2Bridge.WinForms`（dotnet/WebView2Bridge.WinForms）
- .NET（アプリ固有）: `WebView2Bridge.Contract` / `WebView2Bridge.Impl` / `WebView2Bridge.Host`
- 環境変数: `WEBVIEW2_BRIDGE_DEV_URL`（Debug 時に Vite dev server へ接続）

## コマンド
- `pnpm install` / `pnpm gen` / `pnpm gen:check` / `pnpm -r test` / `pnpm -r typecheck`
- `pnpm --filter web dev`（http://localhost:5173、MemoryTransport で動く） / `pnpm --filter web build`（→ apps/web/dist）
- `dotnet build dotnet/WebView2Bridge.Contract` （Mac でも通ること）
- `dotnet test dotnet/WebView2Bridge.Contract.Tests` （Mac で通ること）
- `dotnet build dotnet/WebView2Bridge.sln` （Windows。Mac でもビルドだけは通る）
- `pnpm build`（packages/* を dist/ に。公開用）/ `pnpm pack:npm` / `dotnet pack dotnet/WebView2Bridge.Runtime -c Release -o artifacts/nuget`
- 公開は RELEASING.md の手順（Mac から。バージョンは packages/*/package.json と dotnet/Directory.Build.props の WebView2BridgeVersion）
- Mac の dotnet SDK は `~/.dotnet` に導入済み（`export PATH="$HOME/.dotnet:$PATH"`）

## Windows での実行確認（Phase 3）
1. `pnpm --filter web dev` を起動
2. `set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173` して `dotnet run --project dotnet/WebView2Bridge.Host`（Debug）
3. 環境変数なしの確認は `pnpm --filter web build` → `dotnet build dotnet/WebView2Bridge.sln` → exe を起動（`https://app.local/index.html`）
