# HTTP / OpenAPI: サーバー側を VB 以外に置き換えられる形を保つ（2026-09-19）

- 日付: 2026-09-19
- 状態: 採用
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- 背景: WinForms + WebView2 のデスクトップはいずれ Web（クラウド）に、サーバー側処理は VB.NET から別言語に移る時期が来る、という前提を置く。契約を OpenAPI 準拠の HTTP API にそのまま写せて、画面側は fetch ベースへ滑らかに切り替えられる、を要件に加えた
- 現状確認: 画面は `client.parts.search()` しか呼ばず、postMessage は `Transport`（`call` / `on` の 2 メソッド）の中に閉じている。契約は JSON Schema 2020-12 で、OpenAPI 3.1 が採用しているのと同じ。VB の Impl は `IXxxApi` の DTO in / DTO out で JSON-RPC も WebView2 も知らない。`Dispatcher.HandleAsync` は文字列 in / out なので HttpListener の後ろにも置ける。つまり捨てるのは WinForms Host と `WebViewBridge`、移植するのは Impl の業務ロジックだけ。契約・gen・client・React は残る
- **画面のコードを `fetch()` に書き換えることはしない。** 置き換えは Transport 層で行う（`HttpTransport` の中で fetch を使う）。型付けと zod 検証を残し、切り替えは環境変数（`VITE_TRANSPORT=http`、`VITE_HTTP_BASE_URL`）だけで済ませる
- **HTTP へのマッピング**（契約は動詞入りの RPC 型なので、GET/PUT/DELETE やリソース URL を持つ純粋な REST には寄せない。Connect RPC / tRPC / gRPC transcoding と同じ流儀）
  - `<ns>.<name>` → `POST /<ns>/<name>`。requestBody = input、200 の body = output。どちらも素の JSON で JSON-RPC の封筒は付けない
  - 失敗は JSON-RPC の error オブジェクト `{ code, message, data }` をそのまま body に載せる。-32602 / -32600 / -32700 → 400、-32601 → 404、それ以外（-32000 等）→ 500。`HttpTransport` はこれを同じコードの `BridgeError` に戻すので、画面のエラー処理は変わらない。body が JSON-RPC error でない失敗（プロキシの HTML 等）やネットワーク断は -32603 に包む
  - イベントは `GET /events` を Server-Sent Events で提供する。各 `data:` 行は postMessage と同じ JSON-RPC 通知 `{ "jsonrpc": "2.0", "method": "event.<name>", "params": {...} }`（サーバー側は `BuildNotification` の出力をそのまま流せる）。`HttpTransport` は EventSource ではなく fetch でストリームを読む（認証ヘッダを call と同じように付けるため）。最初の `on()` で接続し、切れたら `retryMs`（既定 3s）後に再接続、`dispose()` で切る。サーバーにイベントが無いときは `events: false`（`on()` は no-op）
  - **設計上の制約: イベントは進捗表示などの補助通知に留め、業務の正しさをイベントに依存させない。** HTTP には postMessage の push に 1 対 1 で対応するものが無く、SSE は切断・再接続で取りこぼしうるため
  - 認証などの横断事項は契約に含めない（OpenAPI は `security: []`）。配備側で決め、`HttpTransport` の `headers`（関数可）/ `credentials` で付ける
- **gen に `emit-openapi.ts` を追加**。設定 `openapi.out`（例 `contract/openapi.json`）を書くと OpenAPI 3.1 を生成する（省略時は出さない）。`$defs` は `components/schemas` へ、メソッド入出力は VB の DTO と同じ名前 `<Ns><Method>Request` / `Response`、イベントは `<Name>Event` で components に置く（他言語のサーバースタブを openapi-generator 等で起こしたとき VB と同じ名前になる）。`.meta({ id })` の名前付きスキーマがそのまま入出力なら alias（`$ref`）にして重複させない。名前衝突はエラー。`operationId` は `partsSearch`（camelCase）、元のメソッド名は `x-webview2-bridge-method`。イベント一覧は `x-webview2-bridge.events`。オプション: `title` / `version`（契約の版）/ `servers`（既定 `["/"]`）/ `basePath` / `eventsPath`（`false` で省略）。Redocly CLI の lint で valid（残る警告は `info.license` 無しと events の 4xx 無しのみ）
- **client に `HttpTransport` を追加**（`packages/client/src/http.ts`）。`{ baseUrl, fetch?, headers?, credentials?, timeoutMs?, events? }`。テストは Node の `node:http` で契約を HTTP 提供する最小サーバーを立て、`createClient` 経由の往復・エラーコードの対応・ヘッダ・SSE の受信と再接続・dispose を実機の HTTP で確認している（VB を待たずに「サーバーが差し替え可能か」を Mac で確かめる手段でもある）。client の devDependencies に `@types/node` を追加（テストのみ）
- apps/web の `bridge.ts` に `http` ファクトリを追加（`VITE_TRANSPORT=http`、`VITE_HTTP_BASE_URL` 既定 `/api`）。雛形 `templates/myapp/` は触っていない（雛形は公開済み 0.3.1 の client に依存しており、`HttpTransport` は次の版から。**次のリリース（0.4.0、機能追加なのでマイナー）で雛形にも `http` ファクトリを足す**）
- 移行の段階: ① 今の WinForms デスクトップ → ② 同じ VB Impl を HttpListener（net48）で LAN 公開しブラウザから使う（`WebView2Bridge.HttpHost` を足す。`/<ns>/<name>` → `<ns>.<name>` に変換して `Dispatcher.HandleAsync` に渡し、JSON-RPC 応答を上のステータス対応で HTTP に写す。数十行）→ ③ `openapi.json` を元に別言語でサーバーを書き直し、画面は `VITE_TRANSPORT=http` に切り替えるだけ。②③は必要になったときに着手する
