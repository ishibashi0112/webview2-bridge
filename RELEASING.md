# リリース手順（npm / NuGet）

公開するのは「どのアプリでも同じ道具」の 4 つ。アプリ固有のもの（`contract/`、`apps/web`、`WebView2Bridge.Contract`、`Impl`、`Host`）は公開しない。

| 種類 | 名前 | 元 |
|---|---|---|
| npm | `@ishibashi0112/webview2-bridge-gen` | `packages/gen` |
| npm | `@ishibashi0112/webview2-bridge-client` | `packages/client` |
| NuGet | `WebView2Bridge.Runtime` | `dotnet/WebView2Bridge.Runtime` |
| NuGet | `WebView2Bridge.WinForms` | `dotnet/WebView2Bridge.WinForms` |

どれも **Mac から公開できる**（Windows は不要）。会社 PC では公開せず、公開済みのバージョンを使うだけにする。

## 0. 事前準備（初回のみ）

- npm: `npm login`（`@ishibashi0112` スコープの公開パッケージは無料。`publishConfig.access` は `public` 済み）
- NuGet: <https://www.nuget.org/account/apikeys> で API キーを作る（Push 権限、Glob pattern `WebView2Bridge.*`）。
  キーはシェルの環境変数 `NUGET_API_KEY` に入れる（リポジトリには置かない）

## 1. バージョンを上げる

2 か所。npm 2 つと NuGet 2 つは同じ番号で揃える（0.x 系。Windows 検証で見つかった修正はパッチ版を出す）。

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
# npm（build は prepublishOnly で走る。--dry-run で中身を確認できる）
pnpm publish:npm

# NuGet
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

**別のアプリから使う場合**

```sh
pnpm add -D @ishibashi0112/webview2-bridge-gen zod
pnpm add @ishibashi0112/webview2-bridge-client zod
```

```xml
<!-- 契約プロジェクト（netstandard2.0） -->
<PackageReference Include="WebView2Bridge.Runtime" Version="0.1.1" />
<!-- WinForms ホスト（net48） -->
<PackageReference Include="WebView2Bridge.WinForms" Version="0.1.1" />
```

`webview2-bridge.gen.json` の `vb.namespace` をそのアプリの名前空間（例 `MyApp.Contract`）にし、`webview2-bridge-gen` を実行する。
生成コードは `Imports WebView2Bridge.Runtime` を含み、`dispatcher.Register(api)` は拡張メソッドとして生える。
