# VB 側でも契約の必須・文字数・範囲・列挙を検査する（`Required` と `Validate()`）

- 日付: 2026-10-07
- 状態: 採用
- 出自: 2026-10-07 の作業で追加

- 背景: 画面側は zod で送信前・受信後に検証するが、VB 側は Newtonsoft で DTO に流し込むだけで `required` も `min(1)` も見ていなかった。WebView2 経由なら client が先に弾くので実害は無いが、`HttpTransport` で他のクライアントが来た時点で穴になる。「型が強固」を両側で成立させるために、契約の規則を VB 側にも生成する
- **必須と null 可否は Newtonsoft の `Required` で、デシリアライズ時に検査する**（生成 `Dto.vb` の `<JsonProperty>`）。zod の意味をそのまま写す: 必須 → `Required.Always`（無いか null なら JsonSerializationException → -32602）、必須で `.nullable()` → `AllowNull`、`.optional()` → `DisallowNull`（zod の optional は null を拒むため。`NullValueHandling.Ignore` と併用）、optional かつ nullable → 付けない。`z.unknown()`（`JToken`）は zod が実行時に欠落を許すので付けない。値型（Integer 等）の欠落は Newtonsoft が見るので、既定値 0 で通ってしまう穴が無い
- **文字数・範囲・列挙・件数・入れ子は生成 DTO の `Validate(path, issues)` で検査する**。ランタイムに `IValidatable` を追加し、全生成クラスが実装する。`Dispatcher` はデシリアライズ直後に `Validate` を呼び、違反が 1 件でもあれば `-32602`（message は違反の一覧を `; ` で連結、data は違反ごとの文字列の配列。例 `keyword: 1 文字以上`）。入れ子のクラスは再帰、`List` は `items[0]` のように添字付き、`Dictionary` は `notes.<key>`。規則の無いクラスは空の `Validate` を持つ
- 対応する規則: `minLength` / `maxLength`、`minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum`（zod `.int()` の ±MAX_SAFE_INTEGER は除く）、`enum`（定数クラスの `Values` に含まれるか）、`minItems` / `maxItems`。**`pattern`（正規表現）は検査しない**（JS と .NET の方言差で挙動が揺れるため。必要なら Impl で）。**応答（出力）は VB 側で検査しない**（client が受信後に検証する。VB 側は自分が作る値なので実装のバグはテストで捕まえる）
- 副作用として、**直列化時に必須の参照型が `Nothing` だと Newtonsoft が例外を投げる**（`Required.Always` の規則）。Dispatcher 内なら `-32000`（message に項目名）になり、契約に合わない応答を黙って出さなくなる。イベントは `WebViewBridge.Emit` が `JsonException` を捕まえて捨て、`Debug.WriteLine` に残す（イベントは補助通知。Impl のスレッドを落とさない）。`NullValueHandling.Ignore` の付いた optional 項目は Required より先に省かれるので例外にならない
- 既存 xUnit（`WebView2Bridge.Contract.Tests`）の 2 件は旧い意味（`params` 省略で `Keyword = Nothing` のまま通る、必須の参照型を `null` で出す）を前提にしていたので新しい意味に書き換え、`Validate` と `DisallowNull` の 2 件を足した。**「VB にテストは書かない」の例外**: この挙動は dotnet の無い環境では確かめられず、生成 VB の実行時挙動を機械で確かめる唯一の場所が既存の xUnit プロジェクトだったため。テストを置く場所の方針そのものは変えない
- gen の変更: `emit-vb.ts` の `VbType` に `kind` / `element` / `enumClass` / `rules` を持たせ、`Dto.vb` に `Imports WebView2Bridge.Runtime`（`runtimeNamespace`）が付く。ランタイム同梱ファイルに `IValidatable.vb` が増え、雛形は `pnpm gen` の出力が 13 ファイルになる。契約の仕様書（`contract.md`）のエラー表にも反映
- 確認: gen のスナップショットと `Required` / `Validate` の生成内容はテストで固定。VB のコンパイルと xUnit は CI の dotnet ジョブ（Linux の Contract + Windows の sln）で確かめる。api 層（Windows）で `bridge.call` は client の検証が先に効くので、VB 側の検証を通すには HTTP か生の postMessage が要る（未着手）
