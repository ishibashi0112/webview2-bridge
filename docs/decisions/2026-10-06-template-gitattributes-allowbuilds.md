# 雛形に `.gitattributes` を追加、`allowBuilds` に oracledb を明示（2026-10-06、0.5.1）

- 日付: 2026-10-06
- 状態: 採用
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- 背景: `pnpm create webview2-bridge` で作った新規アプリ（SBOM、`ishibashi0112/s-b`）に `.gitattributes` が無かった。本体は `* text=auto eol=lf` で生成物を LF に固定し、Windows の `core.autocrlf=true` による CRLF 化と `pnpm gen:check` の誤検知を防いでいる（2026-09-06 の Windows 確認で実際に改行差分が出た。§14）が、雛形から作ったアプリにはこの保護が無かった。s-b では手で本体と同じ `.gitattributes` を足して回避した
- `templates/myapp/.gitattributes` を追加した。規則は本体直下の `.gitattributes` と同じ（`* text=auto eol=lf` + バイナリ指定）で、コメントだけ雛形向けにした。本体の規則を変えたら雛形も揃える
- **同梱は改名しない**: `.gitattributes` は npm pack / pnpm pack とも tgz に入り、npm / pnpm の install でも消えないことを確認した（2026-10-06、npm 10.9 / pnpm 11.18）。`.gitignore` / `.npmrc` と違って `_gitattributes` にする必要が無いので、そのまま同梱・コピーする（`BUNDLED_RENAMES` / `BUNDLED_RESTORE` は変えない）。pack で落ちるようになったらそこに足す
- テスト: `init.test.ts` の scaffold テストで `.gitattributes` が出力され `* text=auto eol=lf` を含むことを検証する（既存の同期テストは dotfile も対象なので `.gitattributes` の同期も検証される。同梱コピーから消すと両方落ちることを確認）
- 検証: `pnpm pack:npm` の tgz から create → scaffold したアプリに `.gitattributes` が出力され、`core.autocrlf=true` の git で commit → checkout しても生成物が LF のまま（`.gitattributes` が無いと CRLF になる）。同じアプリで install → gen:check（11 files）→ web typecheck → screen 4 件が通った
- 版: 雛形を変えたので gen を 0.5.1 にした。RELEASING 手順 1 に従い npm 4 つと `WebView2BridgeVersion` を 0.5.1 に揃え、雛形の gen / client / test の版を `^0.5.1` に、`pnpm gen:template` でランタイムのヘッダを 0.5.1 にした。**公開はユーザーが行う**（RELEASING.md）
- **雛形の `allowBuilds` に `oracledb: false` を追加（同じ 0.5.1）**: 検証中に、雛形から作ったばかりのアプリの `pnpm install` が `ERR_PNPM_IGNORED_BUILDS: oracledb@7.0.1` で終了コード 1 になることが分かった（pnpm 11.18。許可も拒否もしていないビルドスクリプトがあると失敗する。公開版 `create-webview2-bridge@0.5.0` で作ったアプリでも再現）。oracledb の install スクリプトは Node の版と Thick モード用バイナリの有無を確かめてメッセージを出すだけで、何も書き換えない（バイナリは tgz に同梱済み）。雛形は Thin モード（Instant Client 不要）で使うので `false`（拒否）にした。`true` にしても動くが、何もしないスクリプトを許可する理由が無い。Thick モードが要るときも Oracle Client を入れれば動く。検証: tgz から scaffold したアプリで手を加えずに install（終了コード 0）→ gen:check → web typecheck → build:web → screen 4 件、knex 経由で oracledb が Thin モードで読み込めることを確認。雛形 README の注意も「ビルドスクリプトを持つ依存を足したら `allowBuilds` に `true` / `false` を書く」に直した。0.5.0 以前で作ったアプリ（s-b 等）で install が落ちる場合は、同じ 1 行を `pnpm-workspace.yaml` に足す
- 0.5.0 以前で作ったアプリには、本体か雛形の `.gitattributes` を手でコピーしてコミットする。コミットだけでは既存の作業ツリーは CRLF のまま残るので、Windows では変更をすべてコミットしてから `git rm -r --cached . && git reset --hard` で LF に書き直す（Linux の `core.autocrlf=true` で再現して確認）
