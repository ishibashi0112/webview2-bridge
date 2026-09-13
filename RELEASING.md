# リリース手順（npm / NuGet）

公開するのは npm の 2 つ。アプリ固有のもの（`contract/`、`apps/web`、`WebView2Bridge.Contract`、`Impl`、`Host`）は公開しない。

| 種類 | 名前 | 元 | 状態 |
|---|---|---|---|
| npm | `@ishibashi0112/webview2-bridge-gen` | `packages/gen`（VB ランタイムのコピー `vb-runtime/` を同梱） | 公開中 |
| npm | `@ishibashi0112/webview2-bridge-client` | `packages/client` | 公開中 |
| NuGet | `WebView2Bridge.Runtime` | `dotnet/WebView2Bridge.Runtime` | **保留**（pack できる状態は維持。必要になったら公開） |
| NuGet | `WebView2Bridge.WinForms` | `dotnet/WebView2Bridge.WinForms` | **保留**（同上） |

VB のランタイムは gen が `vb.runtime` / `vb.winforms` の設定で各アプリに書き出すので、**npm だけで別アプリが成立する**
（tgz だけを入れた別アプリで、Newtonsoft.Json と Microsoft.Web.WebView2 以外の NuGet を使わずビルドできることを確認済み）。
NuGet を公開するのは、アプリが増えてランタイムを DLL で共有したくなったときでよい。

どれも **Mac から公開できる**（Windows は不要）。会社 PC では公開せず、公開済みのバージョンを使うだけにする。

## 0. 事前準備（初回のみ）

- npm: `npm login`（`@ishibashi0112` スコープの公開パッケージは無料。`publishConfig.access` は `public` 済み）
- NuGet（保留中。公開する場合のみ）: <https://www.nuget.org/account/apikeys> で API キーを作る（Push 権限、Glob pattern `WebView2Bridge.*`）。
  キーはシェルの環境変数 `NUGET_API_KEY` に入れる（リポジトリには置かない）

## 1. バージョンを上げる

2 か所。npm 2 つと `WebView2BridgeVersion` は同じ番号で揃える（0.x 系。修正はパッチ版、機能追加はマイナー版）。
VB ランタイム（`dotnet/WebView2Bridge.Runtime`、`WebView2Bridge.WinForms`）を直したときも gen の番号を上げる（gen がコピーを同梱しているため）。

```sh
# npm（packages/gen と packages/client の "version"。手で編集してもよい）
(cd packages/gen    && npm version 0.1.1 --no-git-tag-version)
(cd packages/client && npm version 0.1.1 --no-git-tag-version)

# NuGet（dotnet/Directory.Build.props の WebView2BridgeVersion。手で編集してもよい）
sed -i '' 's|<WebView2BridgeVersion>.*</WebView2BridgeVersion>|<WebView2BridgeVersion>0.1.1</WebView2BridgeVersion>|' dotnet/Directory.Build.props
```

## 2. 検証

```sh
pnpm install
pnpm gen:check && pnpm test && pnpm typecheck && pnpm build
dotnet build dotnet/WebView2Bridge.sln && dotnet test dotnet/WebView2Bridge.Contract.Tests
```

## 3. 公開

```sh
# npm（build は prepublishOnly で走り、dotnet/ の VB ランタイムを vb-runtime/ に同期してから dist を作る。--dry-run で中身を確認できる）
pnpm publish:npm
```

NuGet を公開する場合（保留中）:

```sh
dotnet pack dotnet/WebView2Bridge.Runtime  -c Release -o artifacts/nuget
dotnet pack dotnet/WebView2Bridge.WinForms -c Release -o artifacts/nuget
dotnet nuget push "artifacts/nuget/*.0.1.1.nupkg" --api-key "$NUGET_API_KEY" --source https://api.nuget.org/v3/index.json --skip-duplicate
```

nuget.org は検証に数分かかる（インデックス反映まで restore できないことがある）。

## 4. コミットとタグ

```sh
git add -A && git commit -m "release: v0.1.1" && git tag v0.1.1 && git push origin main --tags
```

## 公開前に中身を確かめたいとき

```sh
pnpm pack:npm                                   # → artifacts/npm/*.tgz（別プロジェクトで npm i ./xxx.tgz して確認）
unzip -l artifacts/nuget/WebView2Bridge.Runtime.0.1.1.nupkg
```

## 利用側（会社 PC / 2 つ目のアプリ）

このリポジトリの中では workspace リンクと ProjectReference を使い続ける（公開版には依存しない）。

**別のアプリから使う場合（npm だけで完結）** — 雛形は `templates/myapp/`（README に手順あり）

`pnpm-workspace.yaml` に `allowBuilds: { esbuild: true }` を置く（pnpm 11 は esbuild の postinstall を既定で止めるため。無いと gen が動かない）。

```sh
pnpm add -D @ishibashi0112/webview2-bridge-gen zod
pnpm add @ishibashi0112/webview2-bridge-client zod
```

```jsonc
// webview2-bridge.gen.json
{
  "contract": "contract/contract.ts",
  "schemaOut": "contract/contract.schema.json",
  "ts": { "outDir": "web/src/generated", "contractImport": "../../../contract/contract" },
  "vb": {
    "outDir": "dotnet/MyApp.Contract/Generated",
    "namespace": "MyApp.Contract",
    "runtime":  { "outDir": "dotnet/MyApp.Contract/Runtime" },   // JsonRpc / Dispatcher / IBridgeEmitter
    "winforms": { "outDir": "dotnet/MyApp.Host/Bridge" }         // WebViewBridge
  }
}
```

```xml
<!-- 契約プロジェクト（netstandard2.0）: Generated/ と Runtime/ は gen が書く -->
<PackageReference Include="Newtonsoft.Json" Version="13.0.4" />
<!-- WinForms ホスト（net48）: Bridge/WebViewBridge.vb は gen が書く。PlatformTarget は x64 か x86 に固定する（AnyCPU だと WebView2Loader.dll が合わず起動時に落ちる） -->
<PlatformTarget>x64</PlatformTarget>
<!-- WinForms ホスト（net48）: Bridge/WebViewBridge.vb は gen が書く -->
<PackageReference Include="Microsoft.Web.WebView2" Version="1.0.4191.47" />
```

`webview2-bridge-gen` を実行すると 10 ファイル（schema、TS 型、VB 生成物 4、ランタイム 3、WebViewBridge 1）が書かれる。
生成コードは `Imports WebView2Bridge.Runtime` を含み、`dispatcher.Register(api)` は拡張メソッドとして生える。
NuGet 版を使う場合は `runtime` / `winforms` を書かず、上の PackageReference を `WebView2Bridge.Runtime` / `WebView2Bridge.WinForms` にする。
