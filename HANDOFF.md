# HANDOFF — 入口と地図

このリポジトリの文書は 4 つに分かれている（2026-10-07 に整理。判断は [docs/decisions/2026-10-07-docs-restructure.md](docs/decisions/2026-10-07-docs-restructure.md)）。

| 読むもの | 中身 | いつ読むか |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | **今の正**。目的・制約・構成・契約の書き方・生成物・ランタイム・プロトコル・テスト・品質の門・雛形・版 | 作業を始める前に必ず |
| [CLAUDE.md](CLAUDE.md) | ルールとコマンド（AI と人の両方に向けた短い約束） | 毎回 |
| [docs/decisions/](docs/decisions/README.md) | 設計判断の記録（1 件 1 ファイル。背景・理由・採らなかった案） | 「なぜこうなっている？」と思ったとき。判断を変えるとき |
| [docs/HISTORY.md](docs/HISTORY.md) | フェーズ計画・最初のプロンプト・進捗と既知の注意点（旧 §12〜§14） | 経緯や Windows 実機での確認手順を辿るとき |
| [RELEASING.md](RELEASING.md) | npm の公開手順（Mac から） | 版を上げて公開するとき |

決めたことは `docs/decisions/` に新しいファイルを足し、`docs/decisions/README.md` の表に 1 行書く。実装の形が変わったら ARCHITECTURE.md を直す。

## 旧 §番号との対応

コードやほかのリポジトリ（slnmix 等）に残る `HANDOFF.md §n` の参照は、次の場所を指す。

| 旧 | 新しい場所 |
|---|---|
| §1 目的 / §2 設計の狙い / §3 環境制約 | ARCHITECTURE.md「目的」「設計の狙い」「制約」 |
| §4 リポジトリ構成 | ARCHITECTURE.md「リポジトリ構成」 |
| §5 通信プロトコル | ARCHITECTURE.md「通信プロトコル」 |
| §6 契約定義 | ARCHITECTURE.md「契約の書き方」 |
| §7 ジェネレータ仕様 | ARCHITECTURE.md「生成物」 |
| §8 フロント側ランタイム | ARCHITECTURE.md「フロント側ランタイム」 |
| §9 VB 側 | ARCHITECTURE.md「VB 側」 |
| §10 未決事項と実装中に決めたこと | [docs/decisions/](docs/decisions/README.md)（ブロックごとに 1 ファイル） |
| §10「HTTP / OpenAPI」 | [docs/decisions/2026-09-19-http-openapi.md](docs/decisions/2026-09-19-http-openapi.md) と ARCHITECTURE.md「HTTP で提供する」 |
| §10「自動テスト」 | [docs/decisions/2026-09-22-automated-tests.md](docs/decisions/2026-09-22-automated-tests.md) と ARCHITECTURE.md「自動テスト」 |
| §11 CLAUDE.md の写し | 捨てた（現行は CLAUDE.md） |
| §12 フェーズ計画 / §13 最初のプロンプト / §14 進捗 | [docs/HISTORY.md](docs/HISTORY.md) |
