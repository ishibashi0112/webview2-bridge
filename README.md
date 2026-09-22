# webview2-bridge

WinForms (VB.NET / .NET Framework 4.8) + WebView2 + Vite/React の薄いブリッジ基盤。
zod で書いた契約から TypeScript の型付きクライアントと VB.NET の DTO / Interface / Dispatcher を生成する。

詳細は [HANDOFF.md](HANDOFF.md)（設計・仕様・決定事項・進捗）、[CLAUDE.md](CLAUDE.md)（ルール・コマンド）、[RELEASING.md](RELEASING.md)（公開手順）。

## 構成

| パス | 内容 | 公開 |
|---|---|---|
| `packages/gen` | `@ishibashi0112/webview2-bridge-gen` — 契約 → JSON Schema → TS 型 / VB コード | npm |
| `packages/client` | `@ishibashi0112/webview2-bridge-client` — Transport 抽象、WebView2Transport、MemoryTransport、createClient | npm |
| `packages/create` | `create-webview2-bridge` — `pnpm create webview2-bridge <dir>` で新規アプリを書き出す（gen の `init` の短い入口） | npm |
| `packages/test` | `@ishibashi0112/webview2-bridge-test` — 自動テストの部品。Playwright フィクスチャ（WinForms ホストを CDP 起動、契約メソッドの直接呼び出し、Knex による DB 前後差分と後片付け）、AI 向け Markdown レポータ、`doctor`（会社 PC の前提確認） | npm |
| `dotnet/WebView2Bridge.Runtime` | JSON-RPC ランタイム（Dispatcher / JsonRpc / IBridgeEmitter）。netstandard2.0、WebView2 非依存。**gen がコピーを同梱し、各アプリへ書き出す**（NuGet `WebView2Bridge.Runtime` は保留） | npm（gen 経由） |
| `dotnet/WebView2Bridge.WinForms` | WebView2 コントロールと Dispatcher をつなぐ WebViewBridge。net48。同上（NuGet `WebView2Bridge.WinForms` は保留） | npm（gen 経由） |
| `contract/contract.ts` | zod による契約定義（唯一の正） | — |
| `apps/web` | Vite + React のサンプル UI（ブラウザ単体では MemoryTransport で動く）。`e2e/` に screen / api / host の自動テスト | — |
| `dotnet/WebView2Bridge.Contract` | このアプリの生成コード（`pnpm gen` の出力先）。Runtime を参照 | — |
| `dotnet/WebView2Bridge.Impl` | 人間が書く API 実装 | — |
| `dotnet/WebView2Bridge.Host` | WinForms + WebView2 ホスト exe | — |
| `dotnet/WebView2Bridge.Contract.Tests` | xUnit（net8.0、Mac で `dotnet test` 可） | — |

## 使い方

```sh
pnpm install
pnpm gen                     # contract.ts → contract.schema.json → TS / VB を生成（gen:check で差分検査）
pnpm test                    # gen / client / test の Vitest + apps/web の screen テスト（Playwright。Mac は初回 npx playwright install chromium）
pnpm typecheck
pnpm --filter web dev        # http://localhost:5173（MemoryTransport）
pnpm --filter web build      # → apps/web/dist（Host ビルド時に wwwroot へコピー）
pnpm build                   # packages/* を dist/ にビルド（公開用。開発時は不要）

dotnet build dotnet/WebView2Bridge.Contract
dotnet test  dotnet/WebView2Bridge.Contract.Tests
dotnet build dotnet/WebView2Bridge.sln            # Host の実行は Windows のみ
```

自動テストは 3 層（`apps/web/e2e/`、雛形の `e2e/README.md` 参照）: `screen`（ブラウザ + MemoryTransport。どこでも）/ `api`（実 exe の VB を契約経由で直接呼ぶ）/ `host`（実 exe の WebView2 を画面操作）。
api / host は Windows で `pnpm --filter web test:e2e`（先に `dotnet build`、`pnpm --filter web test:doctor` で前提確認）。結果は `test-results/report.md` に出て、失敗があればクリップボードにも入る。
VB にテストは書かない（実 exe を TypeScript から動かして確かめる）。設計は slnmix リポジトリの `docs/HANDOFF-testing-2026-09.md`。

Windows で Host を Vite dev server につなぐ場合は、Debug ビルドで環境変数 `WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173` を設定して起動する。
環境変数なしで起動すると exe 隣の `wwwroot`（`pnpm --filter web build` の `dist` をビルド時にコピー）を `https://app.local/` から読む。

## 別のアプリから使う

```sh
pnpm add -D @ishibashi0112/webview2-bridge-gen zod && pnpm add @ishibashi0112/webview2-bridge-client zod
```

`webview2-bridge.gen.json` に `vb.namespace`（自分の名前空間）と `vb.runtime.outDir` / `vb.winforms.outDir` を書いて
`webview2-bridge-gen` を実行すると、契約の生成物に加えて VB ランタイムと WebViewBridge も書き出される。
VB 側の NuGet 参照は Newtonsoft.Json と Microsoft.Web.WebView2 だけでよい（RELEASING.md 参照）。

**新規アプリは `pnpm create webview2-bridge my-app --name MyInventory` で作る**（`pnpm dlx @ishibashi0112/webview2-bridge-gen init ...` と同じ）。
雛形の正体は [templates/myapp](templates/myapp/)（contract / web / dotnet の 3 プロジェクト / gen.json / README）で、gen がコピーを同梱し `MyApp` を指定名に置換して書き出す。
公開前の版を試すときはこのリポジトリで `pnpm gen init <dir> --name <Name>`。
pnpm 11 は esbuild（gen が使う tsx の依存）の postinstall を既定で止めるので、新しいアプリの `pnpm-workspace.yaml` に `allowBuilds: { esbuild: true }` が必要（雛形には設定済み）。
