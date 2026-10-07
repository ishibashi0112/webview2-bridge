# 契約の書式は zod のまま。Effect Schema は採用しない（2026-10-07）

- 日付: 2026-10-07
- 状態: 不採用（Effect Schema を採らず zod のまま）
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- 背景: Effect（Effect-TS/effect）が 2026-10-01 に 4.0 安定版（LTS）になり、zod から乗り換えるべきか検討した。Effect 4.0.1 で現行の `contract/contract.ts` を Effect Schema に書き直し、作業用ディレクトリで zod 4.6.5 と比べた（リポジトリは変更していない）
- できること: 契約の記述、JSON Schema 出力（`Schema.toJsonSchemaDocument`）、共有型の名前（`.annotate({ identifier })` → `#/$defs/<id>`）、実行時検証（Standard Schema 対応）はすべてできる
- 違い: Effect の JSON Schema は書いたスキーマではなく「JSON codec（`toCodecJson`）の encoded 側」を表すので、素直に書くと zod と形が変わる。`Schema.Number` は `number | "Infinity" | "-Infinity" | "NaN"` の union になる（emit-vb は union をエラーにする。`Schema.Finite` なら `number`）。`Schema.optional(T)` は `T | null` になるが、通常の decoder は null を拒否するので client の検証と食い違い、optional = キーごと省く（`NullValueHandling.Ignore`）の前提とも合わない（`Schema.optionalKey` なら今と同じ）。出力は `$defs` ではなく `definitions` を持つ文書で、`additionalProperties` は既定で true（`onExcessProperty: "error"` で false）
- サイズ: 同じ検証を Vite 8 でビルドすると zod 110 KB（gzip 26 KB）/ Effect 93 KB（gzip 25.5 KB）/ `zod/mini` 23 KB（gzip 6.6 KB）でほぼ同等。WebView2 はローカル配信なので判断材料にならない
- 判断: 採用しない。Effect の強み（型付きエラー、DI、構造化並行性、`effect/rpc` / `effect/http-api`）はサーバーも TS であることが前提で、サーバーが VB の本基盤では生きない。`effect/rpc` / `effect/http-api` は本基盤と役割が重なる（入れるなら基盤ごと置き換えになる）。§2 の「薄い基盤」「既製フレームワークは採用しない」にも反する（契約を書く人に `Finite` / `optionalKey` の作法を求める）。移行は gen / client / test の peerDependency、雛形、既存アプリの契約を書き換える破壊的変更になるのに得るものが無い。資産は JSON Schema 側にあるので、契約の書式を替えたくなっても変わるのは gen の入口だけで済む
- client を Standard Schema 経由にして zod 以外の検証ライブラリを受け付ける案も見送った。JSON Schema の出し方がライブラリごとに違い（上の Effect の例）、gen の前提（`z.toJSONSchema` と `.meta({ id })`）が崩れるため
- 見直す時期: (1) 画面側の非同期処理（並列・リトライ・キャンセル）が複雑になったら、画面のコードだけで Effect を使うのは可（`client.<ns>.<method>()` を `Effect.tryPromise` で包む。契約と基盤は変えない）。(2) 「HTTP / OpenAPI」の段階 ③ でサーバーを TS で書くなら、そのとき `effect/http-api` と `openapi.json` を突き合わせて検討する
