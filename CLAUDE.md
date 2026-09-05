# wvbridge
先に HANDOFF.md を読む。設計判断は HANDOFF.md §2 の狙いに従う。決めた判断は HANDOFF.md §10 に追記する。

## ルール
- .NET Framework 4.8 / VB.NET / Newtonsoft.Json / SDK スタイル .vbproj。C# は書かない
- dotnet/ 配下は netstandard2.0（Contract）と net48（Impl, Host）。Contract は WebView2 に依存させない
- VB は Option Strict On。生成ファイルは手で編集しない（`Generated/` は `pnpm gen` で全上書き）
- AddHostObjectToScript は使わない。通信は JSON-RPC over postMessage（HANDOFF.md §5）
- Microsoft.VisualBasic.Compatibility 名前空間は使わない
- フロントは Vite + React + TS、pnpm。localStorage 等は使わない
- 既存の旧スタイル .vbproj には触らない（このリポジトリには含めない）
- ジェネレータのエミッタ（emit-ts / emit-vb）は `contract.schema.json` だけを読む。zod の内部構造に依存させない

## コマンド
- `pnpm install` / `pnpm gen` / `pnpm -r test` / `pnpm typecheck` / `pnpm --filter web dev`
- `dotnet build dotnet/Wvbridge.Contract` （Mac / Linux でも通ること）
- `dotnet build dotnet/Wvbridge.sln` （Windows。Linux/Mac では Microsoft ビルドの .NET SDK があれば WinForms ホストもビルドのみ可能）

## 構成
- `contract/` 契約（zod）。唯一の正。`contract.schema.json` は生成物だがコミットする
- `packages/gen/` ジェネレータ CLI。`packages/client/` フロント側ランタイム
- `apps/web/` Vite + React。`src/generated/` は生成物（コミットする）
- `dotnet/Wvbridge.Contract/Generated/` は生成物（コミットする）
