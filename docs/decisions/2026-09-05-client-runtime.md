# フロント側ランタイム（client）

- 日付: 2026-09-05
- 状態: 採用
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- `Transport.on` の第 1 引数は `"event.progress"` のような完全名。`createClient(...).events.on("progress", ...)` が接頭辞を付ける
- `MemoryTransport` はハンドラの第 2 引数に `{ emit }` を渡す（モック内から progress を発火できる）。要求・応答・イベントは JSON に一度直列化して往復させ、wire 上の挙動（undefined の欠落等）を再現する
- transport の選択は `selectTransport({ mode: import.meta.env.VITE_TRANSPORT, factories: {...} })`。ライブラリ側は `import.meta.env` を読まない。`msw` / `http` は factories にキーを足す
- `WebView2Transport` は `PostWebMessageAsString` で文字列が来ても JSON として解釈する。既定タイムアウト 30s。`dispose()` で待機中の要求を reject
