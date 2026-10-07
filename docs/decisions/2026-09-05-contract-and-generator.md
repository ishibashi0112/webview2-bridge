# 契約とジェネレータ

- 日付: 2026-09-05
- 状態: 採用
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- `contract/` は private な workspace パッケージ `@webview2-bridge/contract` にした。apps/web と生成 TS はこの名前で import する（相対パス `../../../contract` を避けるため）。公開しない
- ジェネレータの設定はリポジトリ直下の `webview2-bridge.gen.json`。`pnpm gen` で生成、`pnpm gen:check` で最新か検査（CI 用）
- JSON Schema は契約全体を 1 つの `z.object` に包んで `z.toJSONSchema(root, { io: "output" })` を 1 回だけ呼ぶ。`.meta({ id })` 付きスキーマがルート `$defs` に 1 回だけ集約され `#/$defs/<id>` で参照される
- **DTO 名の規則**（スナップショットで固定）
  - 共有したい object / enum には `.meta({ id: "Part" })` を付ける → その名前のクラス（TS は `Part` 型も export）
  - method 入出力: `<Namespace><Method>Request` / `<Namespace><Method>Response`、イベント: `<Name>Event`
  - 無名の入れ子 object: `<親クラス><Prop>`、配列要素: 単数化（`items`→`Item`, `children`→`Child`, `ies`→`y`, それ以外は `<Prop>Item`）
  - string enum: `<親クラス><Prop>` の `NotInheritable Class` に `Public Const`（プロパティの型は String）。`.meta({ id })` を付ければその名前
  - 名前衝突はエラーで止める（`.meta({ id })` で回避する）
- 型マッピングの追加: `z.record(z.string(), T)` → `Dictionary(Of String, T)`、`z.unknown()/z.any()` → `JToken`、`z.string().nullable()` → `type: [X, "null"]` を null 許容として解釈。union / intersection / z.date / bigint はエラー
- **optional の JSON 表現**: required でないプロパティには `NullValueHandling.Ignore` を付け、Nothing なら JSON からキーごと省く（zod の `.optional()` は `null` を拒否するため）。required かつ nullable は `null` を出す。値型は optional / nullable のとき `Nullable(Of T)`
- required な `List` / `Dictionary` プロパティは `New` で初期化しておく（実装が詰め忘れても `[]` が返る）
- 生成ファイルは `Namespace Global.WebView2Bridge.Contract` に置く（RootNamespace に依存しない）。共通ヘッダに `Imports System`
- `Dispatcher.Generated.vb` は `RegisterHandler(Of TReq, TRes)("parts.search", AddressOf api.Search)` を並べるだけ。デシリアライズ・エラー変換は手書きの `Dispatcher.vb` が持つ
- イベントは namespace を持たないので、生成するのは単一の `BridgeEvents` クラス。発行先は Contract の `IBridgeEmitter`（Host の `WebViewBridge` が実装）
- TS 出力 `contract-types.ts` は `z.input` / `z.output` で契約から型を引く（JSON Schema から型を再構築しない）。`$defs` の型は `PartsSearchOutput["items"][number]` のような indexed access で導出
