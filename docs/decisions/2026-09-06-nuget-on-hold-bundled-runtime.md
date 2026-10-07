# NuGet 保留と gen によるランタイム出力（2026-09-06）

- 日付: 2026-09-06
- 状態: 採用（NuGet の公開は保留。gen がランタイムを同梱）
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- npm 0.1.0 を公開した時点で、管理を npm 1 系統にまとめたいという要望により **NuGet の公開は保留**にした（pack できる状態は維持）。理由: Mac と会社 PC がこまめに同期できず、管理するパッケージは少ないほどよい。VB ランタイムの改修は稀
- 代わりに gen が VB ランタイムを同梱し、設定 `vb.runtime.outDir` / `vb.winforms.outDir` で各アプリに書き出す。`packages/gen/vb-runtime/` は `dotnet/` のコピー（`scripts/sync-vb-runtime.mjs`、`pnpm build` で自動同期、テストで同期を検証）。唯一の正は引き続き `dotnet/` 側
- 書き出すファイルは auto-generated ヘッダ（gen のバージョン入り）付きで、`pnpm gen` で上書きされる。名前空間は NuGet 版と同じ `WebView2Bridge.Runtime` / `WebView2Bridge.WinForms` なので、どちらを使っても契約の生成物と呼び出し側は同一
- 同じディレクトリに複数の出力を向けても互いの生成物を消さないよう、古い生成物の削除はディレクトリ単位でまとめて行う
- このリポジトリでは `runtime` / `winforms` を設定せず ProjectReference のまま（`webview2-bridge.gen.json` は変更なし）
- 検証: gen 0.2.0 の tgz だけを入れた別アプリで、nuget.org の Newtonsoft.Json と Microsoft.Web.WebView2 以外を使わずに Contract / Impl / Host（WinForms exe）がビルドできた
- 単位の整理: アプリ 1 つ = Host の exe 1 つ = リポジトリ 1 つ（フロントと VB は同じリポジトリに置く。契約が唯一の正で両側へ生成するため）。既存 VB アプリの 1 Form として組み込む形も可
- 次の候補: 新しいアプリの骨組み（contract.ts、gen.json、3 つの .vbproj、MainForm、web）を置く `webview2-bridge-gen init` コマンド
