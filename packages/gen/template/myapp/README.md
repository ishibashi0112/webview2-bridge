# MyApp — webview2-bridge を使う新規アプリの雛形

公開済みの npm（`@ishibashi0112/webview2-bridge-gen` / `-client`）だけで成立する最小構成。
`pnpm create webview2-bridge <dir> --name <AppName>`（= `webview2-bridge-gen init`）がこのフォルダをコピーし、`MyApp` を指定名に置換して書き出す
（手でコピーして `MyApp` を置換しても同じ）。
NuGet は Newtonsoft.Json と Microsoft.Web.WebView2 の 2 つしか使わない。

```
myapp/
  package.json                 # pnpm スクリプト（gen / gen:check / dev / build:web）
  pnpm-workspace.yaml          # web を workspace に。esbuild の postinstall 許可（必須）
  webview2-bridge.gen.json     # ジェネレータ設定（出力先・名前空間）
  contract/contract.ts         # zod による契約（唯一の正）。手で書く
  contract/contract.schema.json# 生成
  web/                         # Vite + React。src/bridge.ts（transport 選択とモック）と src/main.tsx を手で書く
    src/generated/             # 生成（TS 型）
  dotnet/
    Directory.Build.props      # Option Strict On 等の共通設定
    MyApp.sln
    MyApp.Contract/            # netstandard2.0。Generated/ と Runtime/ は生成。手で書くものは無い
    MyApp.Impl/                # net48。IXxxApi の実装を手で書く（DB / サーバーアクセスはここ）
    MyApp.Host/                # net48 WinForms exe。MainForm.vb / Program.vb を手で書く。Bridge/ は生成
```

手で書くファイルは 5 つ: `contract.ts`、`bridge.ts`、`main.tsx`、`CustomersApi.vb`、`MainForm.vb`。
残りは生成物か、一度置いたら触らない設定ファイル。

## 前提ツール

| ツール | 用途 | 備考 |
|---|---|---|
| Node.js 22 以上 + pnpm 11（Corepack） | 生成、フロント開発 | `corepack enable` で pnpm が入る |
| .NET SDK 8 以上 | `dotnet build` / `dotnet run` | VS 2022 17.8 以降に同梱。VS 無しなら SDK 単体でよい |
| WebView2 Runtime | 実行 | Windows 11 は標準搭載 |
| Visual Studio 2022 | **任意**。フォームデザイナと GUI デバッガが要るときだけ | 「.NET デスクトップ開発」ワークロード |

## 初回

```sh
pnpm install          # esbuild の postinstall 許可は pnpm-workspace.yaml に設定済み
pnpm gen              # contract.ts → schema → TS 型 / VB 生成物 / VB ランタイム / WebViewBridge（10 ファイル）
pnpm dev              # http://localhost:5173 をブラウザで開く。MemoryTransport のモックで動く
```

Windows で実機（WebView2 内で VB と往復）:

```bat
set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173
dotnet run --project dotnet/MyApp.Host
```

PowerShell は `$env:WEBVIEW2_BRIDGE_DEV_URL="http://localhost:5173"`。バッジが `transport: webview2` になり、
`customers.list` で VB 側 `CustomersApi` の結果と progress が表示されれば OK。F12 で DevTools。

配布形態（環境変数なし）:

```sh
pnpm build:web                                   # → web/dist
dotnet build dotnet/MyApp.sln -c Release         # dist を bin/Release/net48/wwwroot にコピーする
```

`bin/Release/net48/MyApp.exe` を起動すると `https://app.local/index.html` から wwwroot が読まれる。
配布するのは `bin/Release/net48/` 一式（wwwroot を含む）。

## 日々のループ（API を 1 つ足す）

1. `contract/contract.ts` にメソッドを足す
2. `pnpm gen`（CI では `pnpm gen:check`）
3. `web/src/bridge.ts` のモックに同じメソッドを足し、画面を作る（ブラウザだけで進む）
4. `dotnet/MyApp.Impl/` に実装を書く。新しい namespace を足したら `MainForm.vb` の `dispatcher.Register(...)` も 1 行足す
5. Windows で `dotnet run` して実機確認

## Visual Studio はいつ要るか

ビルド・実行・生成はすべて VS 無し（VS Code + ターミナル）で進められる。VS を開くのは次のときだけ。

- **フォームデザイナ**で WinForms の部品（メニュー、NotifyIcon、ツールバー等）を置きたいとき。
  この雛形の `MainForm.vb` はコードだけで WebView2 を Dock=Fill しているので、デザイナ無しで完結している
- VB 側に**ブレークポイント**を張って GUI デバッガで追いたいとき（`Debug.WriteLine` と WebView2 の DevTools で足りることが多い）
- 既存の旧スタイル .vbproj を含む**最終ビルド**（旧プロジェクトから Host を参照する等）

VS で開く場合は `dotnet/MyApp.sln` をそのまま開ける（SDK スタイル .vbproj）。

## 注意

- `MyApp.Host.vbproj` の `<PlatformTarget>x64</PlatformTarget>` を消して AnyCPU にしない。Windows の `dotnet build` で WebView2 のローダーが x86 だけになり、起動時に `BadImageFormatException` になる。32 ビット専用の DB ドライバ等が要るなら `x86` にする
- `pnpm-workspace.yaml` の `allowBuilds: { esbuild: true }` を消さない。pnpm 11 は postinstall を既定で止めるため、無いと gen が動かない
- `webview2-bridge.gen.json` の `ts.contractImport` は **生成ファイル（web/src/generated/）から見た相対パス**
- 生成物（`Generated/`、`Runtime/`、`Bridge/`、`web/src/generated/`、`contract.schema.json`）は手で編集しない。コミットはする
- ランタイムを上げるときは gen のバージョンを上げて `pnpm gen` を再実行する（`Runtime/` と `Bridge/` が更新される）
- 日付は ISO 8601 文字列で往復する。union / z.date 等は契約に使えない（gen がエラーで止める）
