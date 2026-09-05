# HANDOFF — WinForms(VB.NET 4.8) + WebView2 + Vite/React ブリッジ基盤

このファイルは Claude Code への引き継ぎ資料。リポジトリ直下に置き、最初のプロンプトで「HANDOFF.md を読んで着手」と指示する。
仮の名前は `wvbridge`。気に入らなければ最初に改名して以降は統一する。

---

## 1. 目的（何を作るか）

VB.NET WinForms（.NET Framework 4.8）に WebView2 を載せ、UI を Vite + React + TypeScript で書くための **薄い基盤** を作る。大きなフレームワークではなく、次の 3 つ。

1. **ジェネレータ**（npm CLI）: zod で書いた契約 → JSON Schema → TS 型付きクライアント + VB.NET の DTO / Interface / Dispatcher を生成
2. **フロント側ランタイム**（npm）: `Transport` 抽象、`WebView2Transport`、`MemoryTransport`、`createClient`
3. **VB 側ランタイム**（netstandard2.0 クラスライブラリ）: WebMessage 受信、JSON-RPC 封筒の解釈、Dispatcher 呼び出し、仮想ホスト設定

最初は単一リポジトリ内で作り、境界が安定したら 1 と 2 を npm パッケージとして切り出す。

## 2. 設計の狙い（判断に迷ったらここに戻る）

- **VB で手書きするコードを極限まで減らす。** VB がやるのは「リクエストを受け、DB/サーバーと話し、値を返す」だけ。人間が書く VB は `Implements IXxxApi` した実装クラスと、ホスト Form の数十行のみ
- **資産は契約（zod）とフロントに置く。** 将来 VB → C#、あるいは別言語へ移る可能性がわずかにある。契約が言語中立（JSON Schema）なら、ジェネレータの出力先を足すだけで移れる
- **ホストは差し替え可能。** WinForms は「窓 + WebView2 + Dispatcher」だけ。将来 Photino / Tauri / ブラウザに置き換えても契約とフロントは残る
- **VS Code で開発を完結させる。** VS の役割は WinForms デザイナ、実機での WebView2 動作確認、旧プロジェクトを含む最終ビルドのみ
- **既製フレームワークは採用しない。** Photino / Electron.NET / Blazor Hybrid は 4.8 + WinForms + React の組み合わせに合わない。素の `Microsoft.Web.WebView2` を使う

## 3. 環境制約（変更不可）

| 項目 | 内容 |
|---|---|
| .NET | **.NET Framework 4.8 固定**。モダン .NET への移行はすぐには無理 |
| 言語 | **VB.NET**。C# は使わない（移行に時間がかかる）。純粋な共通層は netstandard2.0 でも VB で書く |
| JSON（.NET側） | **Newtonsoft.Json**（4.8 で枯れている方を選ぶ） |
| ビルド | `dotnet build`。新規プロジェクトはすべて **SDK スタイル**。旧スタイル .vbproj は `dotnet build` で通らない |
| 既存資産 | 旧スタイルの .vbproj（VB6 移行由来）が存在する。**触らない**。依存は「旧 → 新」の向きのみ。新側から旧を参照する場合は ProjectReference ではなく DLL 参照（HintPath）。`Microsoft.VisualBasic.Compatibility` 系は新コードで使わない |
| フロント | Vite + React + TypeScript。Node は Vite+（`vp`）経由、パッケージマネージャは **pnpm** |
| zod | Zod 4.x（`z.toJSONSchema()` を使う。`z.compile()` は任意。WebView2 で CSP を厳しくする場合は `z.config({ jitless: true })`） |
| 会社 PC | Windows 11。Microsoft Store / winget 不可。.NET SDK は VS 2022 同梱か公式 exe で導入 |
| 開発機 | Mac（Claude Code の主戦場）と会社 Windows PC を併用。**WinForms ホストの実行・実機確認は Windows のみ** |

## 4. リポジトリ構成

```
wvbridge/
  package.json                 # pnpm workspace root
  pnpm-workspace.yaml
  HANDOFF.md                   # このファイル
  CLAUDE.md                    # §11 の内容
  contract/
    contract.ts                # zod による契約定義（唯一の正）
    contract.schema.json       # 生成: JSON Schema 中間表現（コミットする）
  packages/
    gen/                       # ジェネレータ CLI（TS）
      src/
        define.ts              # defineContract()
        to-schema.ts           # zod → contract.schema.json
        emit-ts.ts             # → apps/web/src/generated/
        emit-vb.ts             # → dotnet/Wvbridge.Contract/Generated/
      test/                    # Vitest スナップショット
    client/                    # フロント側ランタイム（TS）
      src/
        transport.ts           # Transport interface, JSON-RPC 型
        webview2.ts            # WebView2Transport
        memory.ts              # MemoryTransport
        create-client.ts       # createClient(contract, transport)
  apps/
    web/                       # Vite + React
      src/generated/           # 生成物（コミットする）
      src/mock/handlers.ts     # MemoryTransport 用ハンドラ
  dotnet/
    Directory.Build.props      # LangVersion, Nullable 等の共通設定
    Wvbridge.sln
    Wvbridge.slnf              # 旧プロジェクトを除外したフィルタ（将来用）
    Wvbridge.Contract/         # netstandard2.0 / VB / 生成 DTO・Interface・Dispatcher + ランタイム
    Wvbridge.Impl/             # net48 / VB / 人間が書く実装（DB・サーバー）
    Wvbridge.Host/             # net48 / VB / WinForms exe + WebView2
```

## 5. 通信プロトコル（JSON-RPC 2.0 サブセット）

Web → Host: `window.chrome.webview.postMessage(obj)`（オブジェクトをそのまま渡す。Host 側は `e.WebMessageAsJson` で受ける）
Host → Web: `CoreWebView2.PostWebMessageAsJson(json)`。Web 側は `window.chrome.webview.addEventListener("message", e => e.data)`

```jsonc
// 要求（Web → Host）
{ "jsonrpc": "2.0", "id": "uuid-or-counter", "method": "parts.search", "params": { ... } }

// 応答（Host → Web）
{ "jsonrpc": "2.0", "id": "...", "result": { ... } }
{ "jsonrpc": "2.0", "id": "...", "error": { "code": -32601, "message": "Method not found", "data": null } }

// 通知（Host → Web、id なし）
{ "jsonrpc": "2.0", "method": "event.progress", "params": { ... } }
```

- `method` は `"<namespace>.<name>"`。イベントは `"event.<name>"`
- エラーコード: JSON-RPC 標準（-32700 Parse, -32600 Invalid Request, -32601 Method not found, -32602 Invalid params）+ アプリ定義は -32000 以下。VB 側で例外が出たら `-32000`、`message` に例外メッセージ、`data` に例外型名
- `AddHostObjectToScript` は **使わない**（COM 経由で同期・型情報なし・遅い）
- キャンセルは初期スコープ外。要求 id が一意であることだけ保証する

## 6. 契約定義（zod）

```ts
// contract/contract.ts
import { z } from "zod";
import { defineContract } from "@wvbridge/gen";

const Part = z.object({
  partNo: z.string(),
  name: z.string(),
  qty: z.number().int(),
  updatedAt: z.string(), // ISO 8601。日付は初期は String で往復する（§10 参照）
});

export const contract = defineContract({
  methods: {
    parts: {
      search: {
        input: z.object({ keyword: z.string().min(1), limit: z.number().int().optional() }),
        output: z.object({ items: z.array(Part) }),
      },
    },
  },
  events: {
    progress: z.object({ percent: z.number(), message: z.string().optional() }),
  },
});
export type Contract = typeof contract;
```

`defineContract` は型を保持して返すだけの identity 関数でよい。ジェネレータは `z.toJSONSchema()` で `contract.schema.json` を作り、**以降のエミッタは JSON Schema だけを読む**（zod の内部構造に依存しない）。

## 7. ジェネレータ仕様

### 7.1 TS 出力（`apps/web/src/generated/`）
- `contract-types.ts`: 各 method の `Input` / `Output` 型、イベント型、`MethodMap` / `EventMap`
- 型は `z.infer` で契約から直接取れるので、TS 出力は最小限でよい。クライアント本体は `packages/client` の `createClient` が型パラメータで受ける

### 7.2 VB 出力（`dotnet/Wvbridge.Contract/Generated/`）
- `Dto.vb`: JSON Schema の object ごとに `Public Class`。プロパティは PascalCase、`<JsonProperty("camelCase")>` を付与
- `Interfaces.vb`: namespace ごとに `Public Interface IPartsApi` / `Function Search(req As PartsSearchRequest) As Task(Of PartsSearchResponse)`
- `Dispatcher.Generated.vb`: `Partial Public Class Dispatcher` に `Register(api As IPartsApi)` と、`method` 文字列 → デシリアライズ → Interface 呼び出し → シリアライズ の分岐
- `Events.vb`: `Public Class PartsEvents` に `Sub Progress(payload As ProgressEvent)` のような型付き発行ヘルパ（内部で `Bridge.Emit("event.progress", payload)`）

型マッピング（初期値。必要に応じて変更可）

| JSON Schema | VB.NET |
|---|---|
| string | String |
| number | Double |
| integer | Integer（`format: int64` なら Long） |
| boolean | Boolean |
| array | `List(Of T)` |
| object | 生成クラス（名前は `<Namespace><Method>Request/Response` または zod の `.describe()` / 変数名から） |
| optional / nullable | 参照型はそのまま、値型は `Nullable(Of T)` |
| enum（string） | String + `Public Const` を並べたクラス（VB の `Enum` にはしない。値の往復を文字列のまま保つ） |
| 上記以外（union 等） | 初期はエラーにして生成を止める |

- 生成ファイル冒頭に `' <auto-generated /> ... DO NOT EDIT` を入れる
- VB は `Option Strict On` で通るコードを吐く
- 生成のたびに完全上書き。人間が書くファイルとは分ける

### 7.3 CLI
`pnpm gen`（root）で `contract/contract.ts` → `contract.schema.json` → TS/VB を一気に生成。Vitest でスナップショットテストを持つ（TS 出力・VB 出力とも）。

## 8. フロント側ランタイム（`packages/client`）

```ts
export interface Transport {
  call(method: string, params: unknown): Promise<unknown>;
  on(event: string, handler: (params: unknown) => void): () => void; // unsubscribe を返す
}

export function createClient<C extends ContractShape>(contract: C, transport: Transport): Client<C>;
// client.parts.search({ keyword: "x" }) : Promise<{ items: Part[] }>
// client.events.on("progress", p => ...)
// 入力は送信前に zod で safeParse、出力は受信後に safeParse。失敗時は BridgeValidationError
```

- `WebView2Transport`: `window.chrome.webview` を使う。pending Map で id → resolve/reject。タイムアウト（既定 30s）
- `MemoryTransport(handlers, { delay? })`: `handlers` は契約から型付けされた `{ parts: { search: async (input) => output } }`。イベントを擬似発火する `emit()` を持つ
- Transport の選択: `window.chrome?.webview` があれば WebView2、なければ `import.meta.env.VITE_TRANSPORT`（`memory` 既定）。将来 `msw` / `http` を足せる形にしておく

## 9. VB 側（`dotnet/`）

### 9.1 Wvbridge.Contract（netstandard2.0, VB）
- 生成物（§7.2）
- ランタイム: `JsonRpc.vb`（封筒の型・エラーコード定数）、`Dispatcher.vb`（`Partial Public Class Dispatcher` の手書き側。`Function HandleAsync(requestJson As String) As Task(Of String)`、未登録メソッドは -32601、例外は -32000 に変換）
- **WebView2 に依存しない**（netstandard2.0 でビルドできることが重要。Mac でもビルド可）
- NuGet: Newtonsoft.Json のみ

### 9.2 Wvbridge.Impl（net48, VB）
- `PartsApi.vb`: `Implements IPartsApi`。Phase 3 ではスタブ（固定データ）でよい
- 将来ここに SqlClient / Oracle.ManagedDataAccess（Framework 版）を閉じ込める

### 9.3 Wvbridge.Host（net48, VB, WinForms exe）
- `WebViewBridge.vb`: `WebView2` コントロールと `Dispatcher` を受け取り、`WebMessageReceived` → `HandleAsync` → `PostWebMessageAsJson`。`Emit(method, payload)` を公開
- `MainForm.vb`: Dock=Fill の WebView2。`EnsureCoreWebView2Async` 後に
  - Debug かつ環境変数 `WVBRIDGE_DEV_URL` があれば `Navigate(そのURL)`（通常 `http://localhost:5173`）
  - それ以外は `SetVirtualHostNameToFolderMapping("app.local", <exe隣の wwwroot>, Allow)` → `Navigate("https://app.local/index.html")`
  - `Settings.AreDevToolsEnabled = True`（F12 で DevTools）
- `vite build` の `dist` を `wwwroot` として出力ディレクトリにコピーする MSBuild ターゲット（または pnpm スクリプト）
- NotifyIcon 等の OS 寄り機能は将来ここに足す

### 9.4 .vbproj 雛形

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net48</TargetFramework>
    <UseWindowsForms>true</UseWindowsForms>
    <RootNamespace>Wvbridge.Host</RootNamespace>
    <OptionStrict>On</OptionStrict>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Web.WebView2" Version="最新安定版" />
    <ProjectReference Include="..\Wvbridge.Contract\Wvbridge.Contract.vbproj" />
    <ProjectReference Include="..\Wvbridge.Impl\Wvbridge.Impl.vbproj" />
  </ItemGroup>
</Project>
```

Mac でホストをビルドする場合は `<EnableWindowsTargeting>true</EnableWindowsTargeting>` を試す。通らなければホストは Windows でのみビルドする（Contract / Impl は Mac で通ること）。

## 10. 未決事項（既定値を置いてあるので、変えたければ変える）

- 日付の往復: 初期は ISO 8601 文字列。VB 側で `Date` にしたくなったら `format: date-time` → `Date` のマッピングを追加
- バイナリ: 初期スコープ外（必要なら base64 文字列）
- 大きな配列（数万行）の性能: 初期は気にしない。問題が出たら分割送信を検討
- パッケージ名 `@wvbridge/*` は仮

### 10.1 実装時に決めた事項（2026-09-05、Phase 0〜3）

**名前・ツール**
- 名前は `wvbridge` のまま（リポジトリ名 `webview2-bridge` とは別名）。npm は `@wvbridge/*`、VB は `Wvbridge.*`
- Vite+（`vp`）は前提にしない。package.json のスクリプトは素の `vite` / `vitest` / `tsc`（`vp` は手元で任意に使う）
- 採用バージョン: TypeScript 5.9、Vite 7、Vitest 4、@vitejs/plugin-react 5、Zod 4.5、React 19、Newtonsoft.Json 13.0.4、Microsoft.Web.WebView2 1.0.4191.47
- `contract/` は workspace パッケージ `@wvbridge/contract`（`contract.ts` を export）。生成 TS は `import type { contract } from "@wvbridge/contract"` で型を参照する
- `defineContract` と `ContractShape` 型は `@wvbridge/gen`（`packages/gen/src/define.ts`）に置く。`@wvbridge/client` は型だけ gen に依存する（Phase 4 で切り出すときに見直す）

**JSON Schema（`contract.schema.json`）**
- 契約全体を 1 つの object（`{ methods: { ns: { method: { input, output } } }, events: { name } }`）に包んで `z.toJSONSchema()` にかけ、1 ドキュメントにする。`.meta({ id: "Part" })` を付けたスキーマは `$defs` に 1 回だけ出て `$ref` で参照される → VB では 1 クラス
- `io` は既定（output）。`.default()` は input 側では required 扱いになるので契約では使わない（値の既定は VB 側で持つ）
- `z.number().int()` は `Integer`。`Long` にしたいときは `.meta({ format: "int64" })` を付ける（`z.int64()` は bigint になり JSON Schema にできない）
- 対応する型: string / number / integer / boolean / array / object / string enum / `X | null`。それ以外（union、unknown、record、tuple、再帰）はジェネレータがエラーで止まる

**DTO クラス名の導出（`packages/gen/src/model.ts` に集約、スナップショットで固定）**
- `$defs` のキー（`.meta({ id })`）はそのままクラス名
- メソッドの input / output が無名 object → `<Namespace><Method>Request` / `<Namespace><Method>Response`（`master-data.getAddress` → `MasterDataGetAddressRequest`）
- イベント payload が無名 object → `<Event>Event`
- 無名 object の中の object プロパティ → `<親クラス><Prop>`、配列要素の object → `<親クラス><Prop>Item`
- string enum は VB では `String` のまま往復し、同じ規則の名前で `Public Const` を並べた `NotInheritable Class` を生成する（`All` 配列付き）
- プロパティは PascalCase + `<JsonProperty("camelCase")>`。VB 予約語は `[Date]` のように角括弧で逃がす。大文字小文字だけが違う名前、クラス名と同じ名前はエラー

**VB 生成物の形**
- `Namespace` ブロックは書かず、プロジェクトの RootNamespace（`Wvbridge.Contract`）に入れる
- `Dispatcher.Generated.vb` は namespace ごとに `Public Sub Register(api As IPartsApi)` を生成し、中で `RegisterHandler("parts.search", Async Function(params) ...)` を登録する。手書き側 `Runtime/Dispatcher.vb` が `RegisterHandler` / `DeserializeParams(Of T)` / `HandleAsync` を持つ
- イベント発行ヘルパのクラス名は `BridgeEvents`（HANDOFF §7.2 の `PartsEvents` は例示。イベントは namespace を持たないため 1 クラス）。発行先は `IEventSink.Emit(method, payload)`。実体は Host の `WebViewBridge`
- 生成ファイルは先頭に `<auto-generated />` マーカーを持つ。CLI はこのマーカーがあるファイルだけを上書き・削除する（手書きファイルには触らない）。`pnpm gen --check` で差分があれば exit 1（CI 用）

**VB ランタイム**
- シリアライザは `DateParseHandling.None`（Newtonsoft が ISO 文字列を勝手に DateTime にしないように）
- `InvalidParamsException`（Contract）は -32602 に変換される。Impl 側からも投げてよい。その他の例外は -32000、`message` に例外メッセージ、`data` に例外型名
- `Dispatcher.HandleAsync` は例外を投げない（必ずエラー応答 JSON を返す）。要求 id は文字列・数値どちらでもそのまま返す
- `WebViewBridge.Attach()` は `EnsureCoreWebView2Async` の後に呼ぶ。`Emit` は別スレッドから呼ばれても `Control.BeginInvoke` で UI スレッドに戻して `PostWebMessageAsJson` する
- Contract のテストは `dotnet/Wvbridge.Contract.Tests`（MSTest、**net8.0**）。製品コードは 4.8 のままで、テストランナーだけモダン .NET を使う（Mac / Linux で `dotnet test` できるようにするため）。会社 PC で .NET 8 SDK が無い場合は sln から外すか slnf で除外する

**フロント側**
- `Transport.on(event)` はイベントの短い名前（`progress`）を受ける。ワイヤ上の `event.` 接頭辞は Transport 内で付け外しする
- Transport の選択ロジックは `apps/web/src/bridge.ts` に置く（client パッケージは `hasWebView2()` だけ提供）。`chrome.webview` があれば WebView2、なければ `VITE_TRANSPORT`（既定 `memory`）
- `createClient` は入力を zod で parse した結果（default / transform 適用後）を送る。出力・イベントも受信後に parse する。イベントの契約違反は既定で `console.warn`（`onEventValidationError` で差し替え可）
- `MemoryTransport` のハンドラは `(input, ctx)` を受け、`ctx.emit("progress", ...)` で Host 側イベントを擬似発火できる。ハンドラの例外は VB 側と同じく -32000 の `BridgeError` になる
- Vite の `base` は `./`（`https://app.local/index.html` の仮想ホストでも配下パスでも動くように）
- `createClient` は namespace 名 `events` / `transport` を予約する

**開発環境**
- Mac / Linux で `Wvbridge.Host`（WinForms）までビルドするには **Microsoft ビルドの .NET SDK** が必要（`Microsoft.NET.Sdk.WindowsDesktop` を含む）。Ubuntu のディストリ版 `dotnet-sdk-8.0` には含まれないため、この作業では packages.microsoft.com の deb を展開して `sdk/8.0.424` を並置した。Mac の公式インストーラ版なら追加作業は不要のはず。`Directory.Build.props` で Windows 以外のとき `EnableWindowsTargeting=true` を付けている

## 11. CLAUDE.md（リポジトリ直下に置く内容）

```markdown
# wvbridge
先に HANDOFF.md を読む。設計判断は HANDOFF.md §2 の狙いに従う。

## ルール
- .NET Framework 4.8 / VB.NET / Newtonsoft.Json / SDK スタイル .vbproj。C# は書かない
- dotnet/ 配下は netstandard2.0（Contract）と net48（Impl, Host）。Contract は WebView2 に依存させない
- VB は Option Strict On。生成ファイルは手で編集しない（`Generated/` は `pnpm gen` で全上書き）
- AddHostObjectToScript は使わない。通信は JSON-RPC over postMessage（HANDOFF.md §5）
- Microsoft.VisualBasic.Compatibility 名前空間は使わない
- フロントは Vite + React + TS、pnpm。localStorage 等は使わない
- 既存の旧スタイル .vbproj には触らない（このリポジトリには含めない）

## コマンド
- `pnpm install` / `pnpm gen` / `pnpm -r test` / `pnpm --filter web dev`
- `dotnet build dotnet/Wvbridge.Contract` （Mac でも通ること）
- `dotnet build dotnet/Wvbridge.sln` （Windows）
```

## 12. フェーズ計画と完了条件

### Phase 0 — 足場
- pnpm workspace、`dotnet/` の 3 プロジェクト + sln、Directory.Build.props、`.gitignore`、CLAUDE.md
- 完了条件: `pnpm install` が通り、`dotnet build dotnet/Wvbridge.Contract` が Mac で通る（中身は空でよい）

### Phase 1 — 契約とジェネレータ
- `defineContract`、`contract.ts`（§6 の 1 メソッド + 1 イベント）、`to-schema`、`emit-ts`、`emit-vb`
- 完了条件: `pnpm gen` で TS/VB が生成され、Vitest スナップショットが通り、生成された VB を含む `Wvbridge.Contract` が `Option Strict On` でビルドできる

### Phase 2 — フロント側ランタイムと Vite アプリ
- `packages/client` の Transport / createClient / MemoryTransport / WebView2Transport
- `apps/web`: 検索キーワードを入れて `parts.search` を呼び、結果を表にする最小 UI。イベント `progress` の受信表示
- 完了条件: ブラウザで `pnpm --filter web dev` を開き、MemoryTransport でモックの往復とイベント表示が動く。client の単体テストが通る

### Phase 3 — VB ランタイムとホスト（Windows で検証）
- `Dispatcher`（手書き側）、`Wvbridge.Impl` のスタブ実装、`Wvbridge.Host` の `WebViewBridge` と `MainForm`
- dist → wwwroot コピー
- 完了条件（Windows）: `WVBRIDGE_DEV_URL=http://localhost:5173` でホストを起動し、WebView2 内で Phase 2 の UI が VB スタブと往復する。環境変数なしで起動すると `app.local` から `dist` が読まれて同じ動作をする。F12 で DevTools が開く

### Phase 4 — 切り出し（後回し）
- `packages/gen` と `packages/client` を npm 公開できる形に整える
- `Wvbridge.Contract` のランタイム部分を NuGet にするかは 2 つ目のアプリで判断

Mac で Claude Code を回す場合、Phase 0〜2 と Phase 3 のコード作成までは Mac で完結し、Phase 3 の実行確認だけ Windows で行う。Windows での確認結果（ビルドエラー、実行時エラー）はそのまま Claude Code に貼って修正させる。

## 13. Claude Code への最初のプロンプト（例）

```
HANDOFF.md と CLAUDE.md を読んでから始めてください。
まず Phase 0 を完了させ、完了条件を実際にコマンドで確認してから Phase 1 に進んでください。
各 Phase の終わりで、完了条件をどう確認したかを短く報告してください。
設計上の判断が必要になったら HANDOFF.md §2 の狙いに照らして決め、決めた内容を HANDOFF.md §10 に追記してください。
```

## 14. 進捗（2026-09-05 時点）

| Phase | 状態 | 確認したこと |
|---|---|---|
| 0 足場 | 完了 | `pnpm install`、`dotnet build dotnet/Wvbridge.Contract`、`dotnet build dotnet/Wvbridge.sln`（Linux） |
| 1 契約とジェネレータ | 完了 | `pnpm gen` / `pnpm gen --check`、Vitest 16 件（スナップショット含む）、生成 VB を含む Contract のビルド、網羅用契約（enum / nullable / ネスト / 複数 namespace）の VB もコンパイル確認 |
| 2 フロント側ランタイムと Vite アプリ | 完了 | Vitest 18 件、`pnpm typecheck`、`pnpm build:web`、dev サーバーを Chromium（Playwright）で開き MemoryTransport で検索結果・progress イベント・契約違反・ホストエラー表示を確認 |
| 3 VB ランタイムとホスト | **コード作成とビルドまで完了。Windows での実行確認が残件** | `dotnet build dotnet/Wvbridge.sln`（Linux、Host 含む）、dist → `bin/Debug/net48/wwwroot` コピー、`dotnet test dotnet/Wvbridge.Contract.Tests` 15 件 |
| 4 切り出し | 未着手（後回し） | — |

### Windows で行う残件（Phase 3 の完了条件）

1. `pnpm install && pnpm gen && pnpm build:web`
2. `dotnet build dotnet/Wvbridge.sln`（WebView2 Runtime が入っていること）
3. dev 接続の確認: 別ターミナルで `pnpm dev:web` を起動し、`set WVBRIDGE_DEV_URL=http://localhost:5173`（PowerShell は `$env:WVBRIDGE_DEV_URL="http://localhost:5173"`）を設定して `dotnet/Wvbridge.Host/bin/Debug/net48/Wvbridge.Host.exe` を起動。バッジが `webview2` になり、検索で VB スタブ（`Wvbridge.Impl/PartsApi.vb`）の結果と progress が表示されること。`error` で検索すると -32000 が表示されること
4. 配布形態の確認: 環境変数なしで起動し、`https://app.local/index.html` から `wwwroot` の dist が読まれて同じ動作をすること
5. F12 で DevTools が開くこと
6. 問題が出たらエラーをそのまま Claude Code に貼って修正する（`MainForm.vb` / `WebViewBridge.vb` が疑わしい箇所の中心）

### 既知の注意点
- `Wvbridge.Contract.Tests` は net8.0。VS 2022 17.8 以降なら .NET 8 SDK が同梱されている。無ければ sln から一時的に外す
- `Wvbridge.Host` の `CopyWebDist` ターゲットは `apps/web/dist/index.html` があるときだけ動く。dist が無いとビルド時にメッセージを出すだけで失敗はしない
