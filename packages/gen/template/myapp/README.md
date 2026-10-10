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
  contract/openapi.json        # 生成（同じ契約を HTTP API として提供するときの OpenAPI 3.1。将来サーバーを VB 以外に移すための入力）
  web/                         # Vite + React。src/bridge.ts（transport 選択とモック）と src/main.tsx を手で書く
    src/generated/             # 生成（TS 型）
  scripts/deploy.ps1           # 共有フォルダへの配布（使用中の検出・控え・記録）
  dotnet/
    Directory.Build.props      # Option Strict On 等の共通設定
    MyApp.sln
    MyApp.Contract/            # netstandard2.0。Generated/ と Runtime/ は生成。手で書くものは無い
    MyApp.Impl/                # net48。IXxxApi の実装を手で書く（DB / サーバーアクセスはここ）
    MyApp.Host/                # net48 WinForms exe。MainForm.vb / Program.vb を手で書く。Bridge/ は生成。App.config は配布の形（後述）用
```

手で書くファイルは 5 つ: `contract.ts`、`bridge.ts`、`main.tsx`、`CustomersApi.vb`、`MainForm.vb`。
残りは生成物か、一度置いたら触らない設定ファイル。
自動テストは `e2e/`(screen / api / host の 3 層。[e2e/README.md](e2e/README.md))と `playwright.config.ts`、
`.env.e2e.example`(テスト DB の接続情報の雛形)。
`slnmix.config.json` は [slnmix](https://github.com/ishibashi0112/slnmix)(M365 Copilot 等のチャット AI にコードを渡すパック生成)の設定で、
`.sln` が `dotnet/` にあってもアプリのルートを基準にパックを作る(`target` と `extraRoots`)。ルートで `npx slnmix` と打つだけでよい。

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
pnpm gen              # contract.ts → schema → TS 型 / OpenAPI / VB 生成物 / VB ランタイム / WebViewBridge（11 ファイル）
pnpm dev              # http://localhost:5173 をブラウザで開く。MemoryTransport のモックで動く
```

Windows で実機（WebView2 内で VB と往復）:

```bat
set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173
dotnet run --project dotnet/MyApp.Host
```

PowerShell は `$env:WEBVIEW2_BRIDGE_DEV_URL="http://localhost:5173"`。バッジが `transport: webview2` になり、
`customers.list` で VB 側 `CustomersApi` の結果と progress が表示されれば OK。F12 で DevTools（Debug ビルドは常に開発モード）。

配布形態（環境変数なし）:

```sh
pnpm build:web                                   # → web/dist
dotnet build dotnet/MyApp.sln -c Release         # dist を bin/Release/net48/wwwroot にコピーする
```

`bin/Release/net48/MyApp.Host.exe` を起動すると `https://app.local/index.html` から wwwroot が読まれる
（index.html の更新日時を `?v=` に付けて開くので、入れ替え後に WebView2 のキャッシュから古い画面が出ることはない）。
配布するのは `bin/Release/net48/` 一式（wwwroot を含む）。
exe の隣に DLL や wwwroot を並べたくない（共有フォルダで母艦と同じ階層に置く等）ときは、`MyApp.Host.vbproj` の `<AppFilesDir>` を `MyApp\` にする。
直下は `MyApp.Host.exe` と `MyApp.Host.exe.config` だけになり、残り（DLL、`WebView2Loader.dll`、wwwroot）は `MyApp\` に入る
（`App.config` の `probing privatePath` と `MainForm.FilesDirName` がこのフォルダ名を前提にしているので、名前は変えない。exe はどちらの形でも動く）。
空に戻してビルドすると `MyApp\` は消えて元の形に戻る（`RemoveAppFilesDirLayout`。古い `MyApp\wwwroot` が残って優先されることはない）。

共有フォルダへ配布するときは `scripts/deploy.ps1`（Windows PowerShell 5.1 で動く）:

```powershell
.\scripts\deploy.ps1 -Target \\server\share\MyApp            # ビルド → 配布物の確認 → 使用中の確認 → 確認(y/N) → 控え → 入れ替え → 記録
.\scripts\deploy.ps1 -Target \\server\share\MyApp -SkipBuild -DryRun
.\scripts\deploy.ps1 -Target \\server\share\MyApp -SkipBuild -Source artifacts\deploy-backup\<日時>   # 控えから戻す
```

配布先の exe / DLL を 1 つでも開けなければ「使っている人がいる」として何も変えずに止まる（途中まで入れ替わった状態を作らない）。
入れ替える前の版は `artifacts\deploy-backup\<日時>\` に控え、配布先に `MyApp.deploy-info.txt`（日時・配布した人・git のコミット・控えの場所）を書く。
配布先ごとの設定（`*.local.config`）は配布先の物を残す（`-Keep` で変更可）。配布先の直下にほかのアプリのファイルがあっても触らない。
Release では F12（開発者ツール）と F5 / Ctrl+R（再読込。編集中の内容が確認なしに消える）などブラウザのショートカットが効かない。
本番の exe で調べたいときは環境変数 `WEBVIEW2_BRIDGE_DEV=1` を付けて起動すると開発モードになる（`MainForm.DevMode`）。

## 自動テスト(動作確認をコードで置き換える)

```sh
pnpm test          # screen: ブラウザ + モックで画面の振る舞い。どこでも走る（mockReturn / mockThrow でテストごとに応答を差し替えられる）
pnpm test:doctor   # 会社 PC の前提確認(初回): ブラウザ / exe の起動と CDP 接続 / テスト DB
pnpm test:e2e      # api + host: 実 exe の VB を契約経由で呼ぶ / 画面から DB まで通す。Windows のみ。先に dotnet build(Debug)
pnpm test:all      # 会社 PC で打つ 1 コマンド
```

結果は `test-results/report.md` に出て、失敗があればクリップボードにもコピーされる(AI チャットに貼る)。
テストの書き方・観点の読み取り元・DB の設定は [e2e/README.md](e2e/README.md)。VB にテストは書かない(実 exe を TS から動かして確かめる)。

## 日々のループ（API を 1 つ足す）

1. `contract/contract.ts` にメソッドを足す
2. `pnpm gen`（CI では `pnpm gen:check`）
3. `web/src/bridge.ts` のモックに同じメソッドを足し、画面を作る（ブラウザだけで進む）
4. `dotnet/MyApp.Impl/` に実装を書く。新しい namespace を足したら `MainForm.vb` の `dispatcher.Register(...)` も 1 行足す
   （忘れると開発モードの起動時に「登録されていないメソッド」の MessageBox が出る。`dispatcher.MissingMethods()`）
   利用者に見せるエラーは `Throw JsonRpcException.Business("メッセージ", "入力項目の JSON 名")`（-32010）。
   モックは `throw businessError("メッセージ", { field: "..." })`、画面は `isUserFacingError(e)` / `errorField(e)` で受ける（見本: keyword に `%`）
5. `e2e/screen/` に画面のテスト、`e2e/api/` に契約メソッドのテストを足す(`pnpm test` はどこでも走る)
6. Windows で `pnpm test:all`(実機の api / host まで自動で確認)

## Visual Studio はいつ要るか

ビルド・実行・生成はすべて VS 無し（VS Code + ターミナル）で進められる。VS を開くのは次のときだけ。

- **フォームデザイナ**で WinForms の部品（メニュー、NotifyIcon、ツールバー等）を置きたいとき。
  この雛形の `MainForm.vb` はコードだけで WebView2 を Dock=Fill しているので、デザイナ無しで完結している
- VB 側に**ブレークポイント**を張って GUI デバッガで追いたいとき（`Debug.WriteLine` と WebView2 の DevTools で足りることが多い）
- 既存の旧スタイル .vbproj を含む**最終ビルド**（旧プロジェクトから Host を参照する等）

VS で開く場合は `dotnet/MyApp.sln` をそのまま開ける（SDK スタイル .vbproj）。

## 注意

- `MyApp.Host.vbproj` の `<PlatformTarget>x64</PlatformTarget>` を消して AnyCPU にしない。Windows の `dotnet build` で WebView2 のローダーが x86 だけになり、起動時に `BadImageFormatException` になる。32 ビット専用の DB ドライバ等が要るなら `x86` にする
- `pnpm-workspace.yaml` の `allowBuilds`（`esbuild: true` / `oracledb: false`）を消さない。pnpm 11 は postinstall を既定で止めるため、`esbuild` を許可しないと gen が動かず、許可も拒否もしていない依存があると `pnpm install` が `ERR_PNPM_IGNORED_BUILDS` で失敗する。ビルドスクリプトを持つ依存を足したら、ここに `true` / `false` を書く
- `webview2-bridge.gen.json` の `ts.contractImport` は **生成ファイル（web/src/generated/）から見た相対パス**
- 生成物（`Generated/`、`Runtime/`、`Bridge/`、`web/src/generated/`、`contract.schema.json`）は手で編集しない。コミットはする
- ランタイムを上げるときは gen のバージョンを上げて `pnpm gen` を再実行する（`Runtime/` と `Bridge/` が更新される）
- 日付は ISO 8601 文字列で往復する。union / z.date 等は契約に使えない（gen がエラーで止める）
- 金額・工数など VB 側で `Decimal` にしたい数値は `z.number().meta({ format: "decimal" })` と書く（既定の `z.number()` は `Double`。TS は `number` のまま）
- 公開当日の webview2-bridge の版を入れると、pnpm が `pnpm-workspace.yaml` に `minimumReleaseAgeExclude`（公開から 24 時間以内でもその版を使う指示）を自動で足す。翌日以降は消してよい（残しても害は無い）
