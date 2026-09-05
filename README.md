# webview2-bridge

WinForms (VB.NET / .NET Framework 4.8) + WebView2 + Vite/React の薄いブリッジ基盤。
zod で書いた契約から TypeScript の型付きクライアントと VB.NET の DTO / Interface / Dispatcher を生成する。

詳細は [HANDOFF.md](HANDOFF.md)（設計・仕様・決定事項）と [CLAUDE.md](CLAUDE.md)（ルール・コマンド）。

## 構成

| パス | 内容 |
|---|---|
| `contract/contract.ts` | zod による契約定義（唯一の正） |
| `packages/gen` | `@ishibashi0112/webview2-bridge-gen` — 契約 → JSON Schema → TS 型 / VB コード |
| `packages/client` | `@ishibashi0112/webview2-bridge-client` — Transport 抽象、WebView2Transport、MemoryTransport、createClient |
| `apps/web` | Vite + React のサンプル UI（ブラウザ単体では MemoryTransport で動く） |
| `dotnet/WebView2Bridge.Contract` | netstandard2.0 / VB — 生成物 + JSON-RPC ランタイム（WebView2 非依存） |
| `dotnet/WebView2Bridge.Impl` | net48 / VB — 人間が書く API 実装 |
| `dotnet/WebView2Bridge.Host` | net48 / VB — WinForms + WebView2 ホスト |

## 使い方

```sh
pnpm install
pnpm gen                     # contract.ts → contract.schema.json → TS / VB を生成
pnpm -r test                 # gen / client の Vitest
pnpm --filter web dev        # http://localhost:5173（MemoryTransport）

dotnet build dotnet/WebView2Bridge.Contract
dotnet test  dotnet/WebView2Bridge.Contract.Tests
dotnet build dotnet/WebView2Bridge.sln            # Host の実行は Windows のみ
```

Windows で Host を Vite dev server につなぐ場合は、Debug ビルドで環境変数 `WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173` を設定して起動する。
環境変数なしで起動すると exe 隣の `wwwroot`（`pnpm --filter web build` の `dist` をビルド時にコピー）を `https://app.local/` から読む。
