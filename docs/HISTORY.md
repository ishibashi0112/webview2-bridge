# 経緯と進捗（HANDOFF.md 旧 §12〜§14）

2026-10-07 に HANDOFF.md から切り出した。本文は当時のまま（旧 §番号を見出しに残す）。今の正は [ARCHITECTURE.md](../ARCHITECTURE.md)、判断は [docs/decisions/](decisions/README.md)。
旧 §11（CLAUDE.md 初版の写し）は捨てた。現行の規則は [CLAUDE.md](../CLAUDE.md)。

## 12. フェーズ計画と完了条件

### Phase 0 — 足場
- pnpm workspace、`dotnet/` の 3 プロジェクト + sln、Directory.Build.props、`.gitignore`、CLAUDE.md
- 完了条件: `pnpm install` が通り、`dotnet build dotnet/WebView2Bridge.Contract` が Mac で通る（中身は空でよい）

### Phase 1 — 契約とジェネレータ
- `defineContract`、`contract.ts`（§6 の 1 メソッド + 1 イベント）、`to-schema`、`emit-ts`、`emit-vb`
- 完了条件: `pnpm gen` で TS/VB が生成され、Vitest スナップショットが通り、生成された VB を含む `WebView2Bridge.Contract` が `Option Strict On` でビルドできる

### Phase 2 — フロント側ランタイムと Vite アプリ
- `packages/client` の Transport / createClient / MemoryTransport / WebView2Transport
- `apps/web`: 検索キーワードを入れて `parts.search` を呼び、結果を表にする最小 UI。イベント `progress` の受信表示
- 完了条件: ブラウザで `pnpm --filter web dev` を開き、MemoryTransport でモックの往復とイベント表示が動く。client の単体テストが通る

### Phase 3 — VB ランタイムとホスト（Windows で検証）
- `Dispatcher`（手書き側）、`WebView2Bridge.Impl` のスタブ実装、`WebView2Bridge.Host` の `WebViewBridge` と `MainForm`
- dist → wwwroot コピー
- 完了条件（Windows）: `WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173` でホストを起動し、WebView2 内で Phase 2 の UI が VB スタブと往復する。環境変数なしで起動すると `app.local` から `dist` が読まれて同じ動作をする。F12 で DevTools が開く

### Phase 4 — 切り出し
- `packages/gen` と `packages/client` を npm 公開できる形に整える
- `WebView2Bridge.Contract` のランタイム部分を `WebView2Bridge.Runtime`、Host の `WebViewBridge` を `WebView2Bridge.WinForms` として NuGet 化する
- 完了条件: `pnpm pack` した tgz と `dotnet pack` した nupkg だけを参照する別プロジェクトで、CLI 実行・client の呼び出し・生成 VB のビルド・WinForms ホストのビルドが通る（手順は RELEASING.md）
- 当初は「2 つ目のアプリで判断」としていたが、Mac と会社 Windows PC の間でこまめに同期できない前提のため、Windows 実機確認の直後に公開できるよう前倒しで準備した

Mac で Claude Code を回す場合、Phase 0〜2 と Phase 3 のコード作成までは Mac で完結し、Phase 3 の実行確認だけ Windows で行う。Windows での確認結果（ビルドエラー、実行時エラー）はそのまま Claude Code に貼って修正させる。

## 13. Claude Code への最初のプロンプト（例）

```
HANDOFF.md と CLAUDE.md を読んでから始めてください。
まず Phase 0 を完了させ、完了条件を実際にコマンドで確認してから Phase 1 に進んでください。
各 Phase の終わりで、完了条件をどう確認したかを短く報告してください。
設計上の判断が必要になったら HANDOFF.md §2 の狙いに照らして決め、決めた内容を HANDOFF.md §10 に追記してください。
```

## 14. 進捗（2026-09-05 時点）

| Phase | 状態 | 確認したこと |
|---|---|---|
| 0 足場 | 完了 | `pnpm install`、`dotnet build dotnet/WebView2Bridge.Contract`、`dotnet build dotnet/WebView2Bridge.sln`（Mac / Linux でビルドのみ） |
| 1 契約とジェネレータ | 完了 | `pnpm gen` / `pnpm gen:check`、Vitest（gen 18 件、スナップショット含む）、生成 VB を含む Contract のビルド |
| 2 フロント側ランタイムと Vite アプリ | 完了 | Vitest（client 19 件）、`pnpm typecheck`、`pnpm --filter web build`、dev サーバーをヘッドレス Chromium で開き MemoryTransport で検索結果・progress イベント・入力検証エラー・-32000 エラーの表示を確認 |
| 3 VB ランタイムとホスト | **完了（2026-09-06 Windows 実機確認済み）** | Windows 11 で `dotnet build dotnet/WebView2Bridge.sln`（6 プロジェクト）と `dotnet test` 16 件。`WEBVIEW2_BRIDGE_DEV_URL` で dev サーバー接続: バッジ `transport: webview2`、`m6` で VB スタブの 3 件と progress 0/50/100% を受信、`error` で `-32000 Simulated failure`（`System.InvalidOperationException`）、F12 で DevTools。環境変数なし: `https://app.local/index.html` から `wwwroot` が配信され同じく `webview2` で動作 |
| 4 切り出し | **完了。npm 3 つ（gen / client / create-webview2-bridge）を 0.3.0 で公開（2026-09-13。init / create コマンド、PlatformTarget x64 固定。0.3.1 は client のみ公開されていた、既知の注意点参照）。0.4.0（OpenAPI 出力、HttpTransport、雛形に http ファクトリ）も 2026-09-19 に公開済み。NuGet は保留** | レジストリの gen 0.2.0 / client 0.2.0 だけを入れた新規アプリで CLI が VB ランタイム込みの 10 ファイルを生成することを確認。tgz 版では NuGet を Newtonsoft.Json と Microsoft.Web.WebView2 のみでビルドできることも確認済み。手順は RELEASING.md |
| 5 自動テスト | **実装完了。0.5.0 として npm 4 つを公開、タグ v0.5.0 を push 済み（2026-09-22）。Windows 実機は未確認** | `packages/test` Vitest 45 件（sqlite の DB ヘルパ、ヘッドレス Chromium を代役にした CDP 起動 / 契約呼び出し）、`apps/web` の screen 6 件が Linux（Claude Code on the web）で通過。雛形は tgz から scaffold → install → gen:check → web typecheck → screen 4 件通過。api / host は会社 PC で `pnpm --filter web test:doctor` → `test:e2e` |

### 経緯
- 2026-09-05 に Mac ローカルの Claude Code で Phase 0〜3 のコードを作成（この版）。同日、別セッション（Claude Code on the web）でも HANDOFF.md だけの状態から同じ Phase 0〜3 を `wvbridge` 名で実装して main に入れたが、Mac 版のほうが完成度が高い（optional プロパティの `NullValueHandling.Ignore`、`Namespace Global.`、record / unknown 対応、VS デザイナ対応、LocalAppData のユーザーデータ等）ため **Mac 版を main に採用**した。wvbridge 版はブランチ `claude/progress-and-remaining-tasks-kv24ls` の履歴に残っている（参照用。今後は使わない）
- 名前は `webview2-bridge` / `WebView2Bridge.*` で確定（§10 参照）

### 次にやること
1. ~~Windows で Phase 3 の実機確認~~（2026-09-06 完了。見つかった問題は `pnpm gen:check` の改行差分のみで、修正済み）
2. ~~gen / client 0.2.0 を公開~~（2026-09-06 完了。npm 上の gen は 0.2.0 のみ、client は 0.1.0 と 0.2.0。NuGet は公開しない）
3. 以降、会社 PC は公開版を使う。修正はパッチ版を出して番号を上げる
4. 業務画面の 1 枚目を作る: 契約にメソッドを足す → `pnpm gen` → Impl に実装 → React で画面（ブラウザ単体はモックで開発、Windows で実機確認）
5. 新規アプリは `webview2-bridge-gen init` で始める（2026-09-13 実装、同日 gen / client 0.3.0 として npm 公開済み。雛形 `templates/myapp/` は Windows 実機で起動確認済み）。`create-webview2-bridge` 0.3.0 も同日公開し、Mac で公開版だけを使い `pnpm create webview2-bridge my-app --name MyInventory` → install → gen:check（10 files）→ web build → `dotnet build -c Release`（0 警告、win-x64 ローダー）が通ることを確認。~~次は Windows で同じ手順を一度通してから業務画面の 1 枚目へ~~（2026-09-19 完了: 会社の Windows 11 PC で公開版 0.4.0 だけを使い `pnpm create webview2-bridge@0.4.0`（対話入力で `test_webview2` / `TestWebview2`）→ `pnpm install` → `gen:check` → `pnpm dev`（`transport: memory`）→ `dotnet run`（`transport: webview2`、VB の 3 件と progress 100%）→ `pnpm build:web` → `dotnet build -c Release`（0 エラー）→ `bin\Release\net48\TestWebview2.Host.exe` 単体起動、まで通った）
6. HTTP / OpenAPI（2026-09-19、§10 参照）: gen の `openapi` 出力と client の `HttpTransport` を実装し、**0.4.0 として npm 3 つを公開済み、タグ v0.4.0 を push 済み（2026-09-19）**（版上げ、雛形に `openapi` 出力と `http` ファクトリ、雛形依存 zod 4.6.5、RELEASING 手順 2 の検証、`pnpm pack:npm` の tgz だけで scaffold → install → gen:check（11 files）→ web build → `dotnet build -c Release` が通ることを確認。公開後、`templates/myapp` で `pnpm install` して公開版 0.4.0 で gen:check と web の typecheck が通ることも確認）。注意: pnpm 11 は公開直後の版を `minimumReleaseAge` で拒むことがあり、その場合 `pnpm-workspace.yaml` に `minimumReleaseAgeExclude` が自動で追記される。雛形にはこの追記を残さない（install 後に `git checkout templates/myapp/pnpm-workspace.yaml`、`templates/myapp/pnpm-lock.yaml` は削除）。会社 PC で公開直後に `pnpm create webview2-bridge` を試す場合も同じ現象が起こりうる。VB の HttpListener ホスト（②）と他言語サーバー（③）は必要になったときに
7. 自動テスト（2026-09-22、§10 参照）: `packages/test` と雛形の `e2e/` を実装し、**0.5.0 として npm 4 つを公開、タグ v0.5.0 を push 済み（2026-09-22。`npm view` で 4 つとも `latest` が 0.5.0、公開版の tgz に `_npmrc` / `slnmix.config.json` / `e2e/` が入っていることを確認）**。**次は会社 PC で** `git pull` → `pnpm install` → `dotnet build dotnet/WebView2Bridge.sln`（Debug）→ `pnpm --filter web test:doctor` → `pnpm --filter web test:e2e`（api 4 件 + host 2 件）。その後、雛形から作った新規アプリ（当日は `pnpm create webview2-bridge@0.5.0 ...` と版を明示）で `pnpm test:all` まで確認する。DB ヘルパの SQL Server / Oracle 実機確認はテスト DB のある業務アプリで行う（`.env.e2e.local` と `db.allowedDatabases`）
8. 雛形に `.gitattributes` と `allowBuilds.oracledb: false`（2026-10-06、§10 参照）: **0.5.1 として npm 4 つを公開、タグ v0.5.1 を push 済み（2026-10-06。`npm view` で 4 つとも `latest` が 0.5.1）**。公開版だけで `pnpm dlx create-webview2-bridge@0.5.1` → `.gitattributes` と `oracledb: false` が出力される → `pnpm install`（`minimumReleaseAgeExclude` が自動追記される）→ gen:check（11 files）→ web typecheck → build:web → screen 4 件、`core.autocrlf=true` の git で commit → checkout しても生成物が LF のまま、を Linux（Claude Code on the web）で確認した。0.5.0 以前で作ったアプリ（s-b 等）には §10 のとおり `.gitattributes` と `oracledb: false` を手で足す
9. CI と Biome と `pnpm check`（2026-10-07、§10 参照）: `.github/workflows/ci.yml`（node / dotnet-linux / dotnet-windows）、`biome.json`、root と雛形の `pnpm check`、雛形の `_biome.json`。0.5.2 に版上げ（公開はユーザー）。CI の結果: 初回（run 1）は Node 22.23.3 で gen のテスト 4 件が落ちた（§10「初回 CI で見つかった環境差」。テスト側の一時ディレクトリを直して解決）。2 回目（run 2、2026-10-07 13:30Z、<https://github.com/ishibashi0112/webview2-bridge/actions/runs/37629051246>）は node / dotnet-linux / dotnet-windows の 3 ジョブとも成功（所要約 75 秒。Windows の sln ビルドは 25 秒）。**次は会社 PC で** `git pull` → `pnpm install` → `pnpm check` が通ることと、VS Code で保存時に Biome が整形することを確認する。公開（0.5.2）は RELEASING.md の手順で

### Windows での確認手順（Phase 3 の完了条件。2026-09-06 に確認済み。再確認用に残す）
1. `git pull` 後、`pnpm install && pnpm gen:check && pnpm --filter web build`
2. `dotnet build dotnet/WebView2Bridge.sln`（WebView2 Runtime が入っていること。`dotnet/global.json` は .NET 8 以上の SDK を要求する）
3. dev 接続の確認: 別ターミナルで `pnpm --filter web dev` を起動し、`set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173`（PowerShell は `$env:WEBVIEW2_BRIDGE_DEV_URL="http://localhost:5173"`）を設定して `dotnet run --project dotnet/WebView2Bridge.Host`（または `dotnet/WebView2Bridge.Host/bin/Debug/net48/WebView2Bridge.Host.exe`）を起動。バッジが `transport: webview2` になり、検索で VB スタブ（`WebView2Bridge.Impl/PartsApi.vb`）の結果と progress が表示されること。keyword を `error` にすると -32000 が表示されること
4. 配布形態の確認: 環境変数なしで起動し、`https://app.local/index.html` から `wwwroot` の dist が読まれて同じ動作をすること
5. F12 で DevTools が開くこと
6. 問題が出たらエラーをそのまま Claude Code に貼って修正する（`MainForm.vb` / `WebViewBridge.vb` が疑わしい箇所の中心）

### 既知の注意点
- **pnpm 11 の `minimumReleaseAge`（既定 1440 分 = 24 時間）**: `pnpm create webview2-bridge` や `pnpm install` は、公開から 24 時間経っていない版を黙って避け、条件を満たす一番新しい版を使う。2026-09-19 に会社 PC と Mac で `pnpm create webview2-bridge`（版指定なし）を実行したところ、同日公開の 0.4.0 ではなく 0.3.0 が動き、対話入力が無い旧 usage が表示された（0.3.0 には対話入力が無い。Mac の pty で再現し、`pnpm create webview2-bridge@0.4.0` なら対話入力まで動くことを確認）。**公開当日に試すときは版を明示する**（`pnpm create webview2-bridge@0.4.0 my-app`）。翌日以降は版指定なしでよい。版を明示した場合や、依存の版が新しい場合は pnpm が `pnpm-workspace.yaml` に `minimumReleaseAgeExclude` を自動追記する（雛形には残さない）
- **pnpm の「Choose which packages to build」プロンプト**: `pnpm create` / `pnpm dlx` の実行時に、依存の esbuild（gen → tsx → esbuild）のビルド許可を聞かれる。init は tsx / esbuild を使わないので、何も選ばず Enter で進めてよい（「All packages were added to allowBuilds with value false」と出るが問題ない）。作ったアプリ側の `pnpm install` は雛形の `pnpm-workspace.yaml` に `allowBuilds: { esbuild: true }` があるので聞かれない
- **npm 上の版の実態**（2026-09-19 に `npm view <pkg> versions` で確認）: gen は 0.2.0 / 0.3.0 / 0.4.0、create は 0.3.0 / 0.4.0、client は 0.1.0〜0.3.1 / 0.4.0。**gen と create の 0.3.1 は公開されていない**（0.3.1 の publish は client だけ成功していた。§10 の「0.3.1 公開済み」は client のみが正しい）。0.4.0 で 3 つとも揃ったので実害は無いが、公開後は 4 パッケージの `npm view <pkg> versions` を確認する（RELEASING.md 手順 3 に追記）。2026-09-22 の 0.5.0 は 4 つとも公開できた。ただし公開直後の `npm view <pkg> version`（= `dist-tags.latest`）は数分間古い版を返すことがある（create が 0.4.0 と表示された後、`versions` には 0.5.0 があり、少し待つと `latest` も 0.5.0 になった）。判定は `npm view <pkg> versions` で行い、`latest` は時間をおいて見直す
- **公開直後は tgz が数分間 404 になることがある**（2026-10-06）: gen 0.5.1 は公開（13:42:33Z）から約 5 分間、`npm view` では版が見えるのに tgz の取得が 404 で、`pnpm dlx create-webview2-bridge@0.5.1` が `ERR_PNPM_FETCH_404` で落ちた（client / create / test の tgz は先に取れていた）。404 で落ちたら数分おいて再実行する
- **雛形の `MyApp.sln` は公開 tgz では CRLF**（0.4.0〜0.5.1 で確認）: リポジトリの index は LF なので、公開に使った Mac の作業ツリーのファイルだけが CRLF で、それがそのまま同梱されていると推定（`dotnet` が CRLF で書いたファイルは、index が LF に正規化されても作業ツリーには CRLF のまま残る）。害は無い（新規アプリの最初の `git add` で `CRLF will be replaced by LF` の警告が出て、LF でコミットされる）。直すなら Mac で `rm templates/myapp/dotnet/MyApp.sln && git checkout -- templates/myapp/dotnet/MyApp.sln` を実行してから `pnpm build`
- `WebView2Bridge.Contract.Tests` は net8.0。VS 2022 17.8 以降なら .NET 8 SDK が同梱されている。無ければ sln から一時的に外す
- `package.json` の `packageManager` は pnpm 11 系。Corepack が有効なら初回にダウンロード確認が出る（Enter で続行）
- Linux（Ubuntu ディストリ版の .NET SDK）で Host までビルドするには Microsoft ビルドの SDK（`Microsoft.NET.Sdk.WindowsDesktop` 同梱）が別途必要。Mac の公式インストーラ版と Windows は不要
