# HANDOFF.md を ARCHITECTURE.md / docs/decisions/ / docs/HISTORY.md に分ける

- 日付: 2026-10-07
- 状態: 採用
- 出自: 2026-10-07 の作業で追加

- 背景: HANDOFF.md が 68KB の追記型ログになり、CLAUDE.md が「先に読め」と指示するので毎セッション大きなコンテキストを消費していた。しかも §7.2 / §9.1 は「Partial Class Dispatcher」のままで実装（拡張メソッド）と食い違う、gen の README は「NuGet の Runtime を参照」と書くが NuGet は保留、のような古い記述が残り、AI の出力を揺らす原因になっていた
- **今の正は `ARCHITECTURE.md` 1 枚**。目的と狙い、制約、構成、契約の書き方、生成物、client / VB ランタイム、プロトコル、HTTP 対応、テスト、品質の門、雛形、版、既知の割り切り。実装と食い違ったら ARCHITECTURE を直す（判断の経緯は書かない）
- **判断は `docs/decisions/` に 1 件 1 ファイル**（`YYYY-MM-DD-<slug>.md`。先頭に日付・状態・出自、本文は当時のまま）。旧 §10 の 13 ブロックと冒頭の既定値を機械的に分割し、本文は変えていない。一覧は `docs/decisions/README.md`。新しい判断はファイルを足して表に 1 行書く。覆したときは旧ファイルの状態を「置き換え → 新ファイル」にし、本文は消さない
- **経緯と進捗（旧 §12〜§14）は `docs/HISTORY.md`** に当時のまま移した。旧 §11（CLAUDE.md 初版の写し）は捨てた（現行は CLAUDE.md）
- `HANDOFF.md` は入口だけ残す（何を先に読むか、旧 §番号 → 新しい場所の対応表）。外部（slnmix の文書など）からの「HANDOFF.md §5」のような参照が解けるようにするため。コード内の `HANDOFF.md §n` 参照は新しい場所に書き換えた
- CLAUDE.md の冒頭を「先に ARCHITECTURE.md を読む。決めたことは docs/decisions/ に足す」に変えた
