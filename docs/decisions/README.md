# 設計判断の記録（ADR）

1 判断 1 ファイル。ファイル名は `YYYY-MM-DD-<slug>.md`、先頭に日付・状態・出自、本文は決めた時点の記録（後から書き換えない）。
今の正は [ARCHITECTURE.md](../../ARCHITECTURE.md)。ここは「なぜそうなっているか」を引く場所。

## 足し方

1. `docs/decisions/YYYY-MM-DD-<slug>.md` を作る（背景 → 決めたこと → 理由 → 確認したこと。採らなかった案も書く）
2. 下の表に 1 行足す
3. 覆したときは、旧ファイルの「状態」を「置き換え → `<新ファイル>`」にする。本文は消さない
4. 実装の形が変わったら ARCHITECTURE.md も直す（判断の経緯はこちら、今の形はあちら）

## 一覧

| 日付 | 判断 | 状態 | ファイル |
|---|---|---|---|
| 2026-09-05 | フロント側ランタイム（client） | 採用 | [2026-09-05-client-runtime.md](2026-09-05-client-runtime.md) |
| 2026-09-05 | 契約とジェネレータ | 採用 | [2026-09-05-contract-and-generator.md](2026-09-05-contract-and-generator.md) |
| 2026-09-05 | 環境・ビルド | 採用 | [2026-09-05-environment-and-build.md](2026-09-05-environment-and-build.md) |
| 2026-09-05 | Host | 採用 | [2026-09-05-host.md](2026-09-05-host.md) |
| 2026-09-05 | 初期の既定値（未決事項の置き方） | 採用（日付は文字列、バイナリと大きな配列は後回し、名前付け規則はスナップショットで固定） | [2026-09-05-initial-defaults.md](2026-09-05-initial-defaults.md) |
| 2026-09-05 | パッケージ化（Phase 4、2026-09-05） | 採用（NuGet の公開は翌日の判断で保留に） | [2026-09-05-packaging.md](2026-09-05-packaging.md) |
| 2026-09-05 | VB ランタイム（Contract） | 採用 | [2026-09-05-vb-runtime.md](2026-09-05-vb-runtime.md) |
| 2026-09-06 | NuGet 保留と gen によるランタイム出力（2026-09-06） | 採用（NuGet の公開は保留。gen がランタイムを同梱） | [2026-09-06-nuget-on-hold-bundled-runtime.md](2026-09-06-nuget-on-hold-bundled-runtime.md) |
| 2026-09-13 | 新規アプリの雛形 `templates/myapp/`（2026-09-13） | 採用 | [2026-09-13-app-template-and-init.md](2026-09-13-app-template-and-init.md) |
| 2026-09-19 | HTTP / OpenAPI: サーバー側を VB 以外に置き換えられる形を保つ（2026-09-19） | 採用 | [2026-09-19-http-openapi.md](2026-09-19-http-openapi.md) |
| 2026-09-22 | 自動テスト: 動作確認をテストコードで置き換える（2026-09-22） | 採用 | [2026-09-22-automated-tests.md](2026-09-22-automated-tests.md) |
| 2026-10-06 | 雛形に `.gitattributes` を追加、`allowBuilds` に oracledb を明示（2026-10-06、0.5.1） | 採用 | [2026-10-06-template-gitattributes-allowbuilds.md](2026-10-06-template-gitattributes-allowbuilds.md) |
| 2026-10-07 | CI と Biome と `pnpm check`: 揺れを機械で止める（2026-10-07、0.5.2） | 採用（react-doctor / fallow は不採用） | [2026-10-07-ci-biome-check.md](2026-10-07-ci-biome-check.md) |
| 2026-10-07 | 契約の仕様書 `contract.md` を gen が生成する | 採用 | [2026-10-07-contract-markdown.md](2026-10-07-contract-markdown.md) |
| 2026-10-07 | HANDOFF.md を ARCHITECTURE.md / docs/decisions/ / docs/HISTORY.md に分ける | 採用 | [2026-10-07-docs-restructure.md](2026-10-07-docs-restructure.md) |
| 2026-10-07 | 契約の書式は zod のまま。Effect Schema は採用しない（2026-10-07） | 不採用（Effect Schema を採らず zod のまま） | [2026-10-07-keep-zod-not-effect.md](2026-10-07-keep-zod-not-effect.md) |
| 2026-10-07 | VB 側でも契約の必須・文字数・範囲・列挙を検査する（`Required` と `Validate()`） | 採用 | [2026-10-07-vb-input-validation.md](2026-10-07-vb-input-validation.md) |
