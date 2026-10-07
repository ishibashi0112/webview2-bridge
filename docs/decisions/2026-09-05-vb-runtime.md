# VB ランタイム（Contract）

- 日付: 2026-09-05
- 状態: 採用
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- Newtonsoft は `DateParseHandling.None` で使う。`"2026-01-05T09:00:00Z"` を Date に変換せず文字列のまま往復させる（`JObject.Parse` は変換してしまうので、ブリッジ内では必ず `JsonRpc.ParseToken` を使う）
- `params` 省略時は `{}` として扱う。デシリアライズ失敗は -32602、未登録メソッドは -32601、未処理例外は -32000（`data` に例外型名）。実装から任意コードを返したいときは `JsonRpcException(code, message, data)` を投げる
- id の無い要求（通知）は処理だけ行い応答しない（`HandleAsync` が Nothing を返す）
