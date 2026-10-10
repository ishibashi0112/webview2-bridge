# HANDOFF — WinForms(VB.NET 4.8) + WebView2 + Vite/React ブリッジ基盤

このファイルは Claude Code への引き継ぎ資料。リポジトリ直下に置き、最初のプロンプトで「HANDOFF.md を読んで着手」と指示する。
名前は `webview2-bridge`（リポジトリ名に合わせて確定）。npm は `@ishibashi0112/webview2-bridge-gen` / `@ishibashi0112/webview2-bridge-client`、.NET は `WebView2Bridge.Contract` / `WebView2Bridge.Impl` / `WebView2Bridge.Host`、環境変数は `WEBVIEW2_BRIDGE_DEV_URL`。

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
webview2-bridge/
  package.json                 # pnpm workspace root
  pnpm-workspace.yaml
  webview2-bridge.gen.json     # ジェネレータ設定（入力 contract / 出力先）
  HANDOFF.md                   # このファイル
  CLAUDE.md                    # §11 の内容
  RELEASING.md                 # npm / NuGet の公開手順（Mac から行う）
  LICENSE                      # MIT
  contract/                    # private workspace package "@webview2-bridge/contract"
    contract.ts                # zod による契約定義（唯一の正）
    contract.schema.json       # 生成: JSON Schema 中間表現（コミットする）
  packages/
    gen/                       # ジェネレータ CLI（TS）。npm: @ishibashi0112/webview2-bridge-gen
      src/
        define.ts              # defineContract()
        to-schema.ts           # zod → contract.schema.json
        emit-ts.ts             # → apps/web/src/generated/
        emit-vb.ts             # → dotnet/WebView2Bridge.Contract/Generated/
        generate.ts / cli.ts   # 設定ファイルを読んで一括生成（CLI: webview2-bridge-gen）
      test/                    # Vitest スナップショット
      tsconfig.build.json      # 公開用 dist/ のビルド設定（開発時は src/*.ts を直接参照）
    client/                    # フロント側ランタイム（TS）。npm: @ishibashi0112/webview2-bridge-client
      src/
        transport.ts           # Transport interface, JSON-RPC 型
        webview2.ts            # WebView2Transport
        memory.ts              # MemoryTransport
        create-client.ts       # createClient(contract, transport)
        select-transport.ts    # 実行環境からの Transport 選択
  apps/
    web/                       # Vite + React
      src/generated/           # 生成物（コミットする）
      src/mock/handlers.ts     # MemoryTransport 用ハンドラ
  dotnet/
    Directory.Build.props      # LangVersion, Nullable 等の共通設定
    WebView2Bridge.sln
    WebView2Bridge.slnf              # 旧プロジェクトを除外したフィルタ（将来用）
    WebView2Bridge.Runtime/          # netstandard2.0 / VB / JSON-RPC ランタイム（Dispatcher, JsonRpc, IBridgeEmitter）。NuGet: WebView2Bridge.Runtime
    WebView2Bridge.WinForms/         # net48 / VB / WebViewBridge（WebView2 と Dispatcher の接続）。NuGet: WebView2Bridge.WinForms
    WebView2Bridge.Contract/         # netstandard2.0 / VB / このアプリの生成 DTO・Interface・Dispatcher 拡張・Events（Runtime を参照）
    WebView2Bridge.Impl/             # net48 / VB / 人間が書く実装（DB・サーバー）
    WebView2Bridge.Host/             # net48 / VB / WinForms exe + WebView2（WinForms パッケージを参照）
    WebView2Bridge.Contract.Tests/   # net8.0 / VB / xUnit（Dispatcher + 生成コードの単体テスト。Mac で dotnet test 可）
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
- **業務エラー（2026-10-09）**: `-32010` は業務エラーで、`message` をそのまま利用者に見せてよい。`data` は省略（null）か `{ "field": "<要求の JSON 名>" }`（結び付く入力欄。camelCase）。`-32010`〜`-32019` は「利用者向け」の範囲で、`-32011` 以降はアプリが決める（例: ファイルに書き込めない）。VB は `Throw JsonRpcException.Business(message, field)`、モックは `throw businessError(message, { field })`、画面は `isUserFacingError(e)` / `isBusinessError(e)` / `errorField(e)`（client）。HTTP に写すときは 422（§10「HTTP / OpenAPI」）
- `AddHostObjectToScript` は **使わない**（COM 経由で同期・型情報なし・遅い）
- キャンセルは初期スコープ外。要求 id が一意であることだけ保証する

## 6. 契約定義（zod）

```ts
// contract/contract.ts
import { z } from "zod";
import { defineContract } from "@ishibashi0112/webview2-bridge-gen";

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

### 7.2 VB 出力（`dotnet/WebView2Bridge.Contract/Generated/`）
- `Dto.vb`: JSON Schema の object ごとに `Public Class`。プロパティは PascalCase、`<JsonProperty("camelCase")>` を付与
- `Interfaces.vb`: namespace ごとに `Public Interface IPartsApi` / `Function Search(req As PartsSearchRequest) As Task(Of PartsSearchResponse)`
- `Dispatcher.Generated.vb`: `Partial Public Class Dispatcher` に `Register(api As IPartsApi)` と、`method` 文字列 → デシリアライズ → Interface 呼び出し → シリアライズ の分岐
- `Events.vb`: `Public Class PartsEvents` に `Sub Progress(payload As ProgressEvent)` のような型付き発行ヘルパ（内部で `Bridge.Emit("event.progress", payload)`）

型マッピング（初期値。必要に応じて変更可）

| JSON Schema | VB.NET |
|---|---|
| string | String |
| number | Double（`z.number().meta({ format: "decimal" })` なら Decimal。2026-10-09） |
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

### 9.1 WebView2Bridge.Contract（netstandard2.0, VB）
- 生成物（§7.2）
- ランタイム: `JsonRpc.vb`（封筒の型・エラーコード定数）、`Dispatcher.vb`（`Partial Public Class Dispatcher` の手書き側。`Function HandleAsync(requestJson As String) As Task(Of String)`、未登録メソッドは -32601、例外は -32000 に変換）
- **WebView2 に依存しない**（netstandard2.0 でビルドできることが重要。Mac でもビルド可）
- NuGet: Newtonsoft.Json のみ

### 9.2 WebView2Bridge.Impl（net48, VB）
- `PartsApi.vb`: `Implements IPartsApi`。Phase 3 ではスタブ（固定データ）でよい
- 将来ここに SqlClient / Oracle.ManagedDataAccess（Framework 版）を閉じ込める

### 9.3 WebView2Bridge.Host（net48, VB, WinForms exe）
- `WebViewBridge.vb`: `WebView2` コントロールと `Dispatcher` を受け取り、`WebMessageReceived` → `HandleAsync` → `PostWebMessageAsJson`。`Emit(method, payload)` を公開
- `MainForm.vb`: Dock=Fill の WebView2。`EnsureCoreWebView2Async` 後に
  - Debug かつ環境変数 `WEBVIEW2_BRIDGE_DEV_URL` があれば `Navigate(そのURL)`（通常 `http://localhost:5173`）
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
    <RootNamespace>WebView2Bridge.Host</RootNamespace>
    <OptionStrict>On</OptionStrict>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Web.WebView2" Version="最新安定版" />
    <ProjectReference Include="..\WebView2Bridge.Contract\WebView2Bridge.Contract.vbproj" />
    <ProjectReference Include="..\WebView2Bridge.Impl\WebView2Bridge.Impl.vbproj" />
  </ItemGroup>
</Project>
```

Mac でホストをビルドする場合は `<EnableWindowsTargeting>true</EnableWindowsTargeting>` を試す。通らなければホストは Windows でのみビルドする（Contract / Impl は Mac で通ること）。

## 10. 未決事項（既定値を置いてあるので、変えたければ変える）

- 日付の往復: 初期は ISO 8601 文字列。VB 側で `Date` にしたくなったら `format: date-time` → `Date` のマッピングを追加
- バイナリ: 初期スコープ外（必要なら base64 文字列）
- 大きな配列（数万行）の性能: 初期は気にしない。問題が出たら分割送信を検討
- ジェネレータの名前付け規則（DTO クラス名の導出）: 実装しながら決め、スナップショットで固定する
- パッケージ名は `@ishibashi0112/webview2-bridge-gen` / `@ishibashi0112/webview2-bridge-client` で確定（workspace 内でも同名で参照する）

### 10.1 実装中に決めたこと（2026-09-05, Phase 0〜3 コード作成）

**環境・ビルド**
- Mac の .NET SDK は `dotnet-install.sh --channel 8.0` で `~/.dotnet` に導入した（sudo 不要・削除可）。`dotnet/global.json` は 8.0.100 以上を `rollForward: latestMajor` で許容するので、Windows は VS 2022 同梱の SDK でそのまま通る
- `Directory.Build.props` で Mac 上は `EnableWindowsTargeting=true` にした。結果、Contract だけでなく Impl / Host（WinForms + WebView2）も Mac で **ビルド** は通る（実行は Windows のみ）。Linux（Claude Code on the web、Microsoft ビルドの SDK）でも同様に通る（2026-10-09。§14 既知の注意点）
- `dotnet/WebView2Bridge.Contract.Tests`（xUnit, **net8.0**）を追加。製品コードは netstandard2.0 / net48 のままで、テストだけ Mac で `dotnet test` するための例外
- pnpm は 11 系。`pnpm-workspace.yaml` の `allowBuilds` で esbuild のみ postinstall を許可

**契約とジェネレータ**
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

**VB ランタイム（Contract）**
- Newtonsoft は `DateParseHandling.None` で使う。`"2026-01-05T09:00:00Z"` を Date に変換せず文字列のまま往復させる（`JObject.Parse` は変換してしまうので、ブリッジ内では必ず `JsonRpc.ParseToken` を使う）
- `params` 省略時は `{}` として扱う。デシリアライズ失敗は -32602、未登録メソッドは -32601、未処理例外は -32000（`data` に例外型名）。実装から任意コードを返したいときは `JsonRpcException(code, message, data)` を投げる
- id の無い要求（通知）は処理だけ行い応答しない（`HandleAsync` が Nothing を返す）

**フロント側ランタイム（client）**
- `Transport.on` の第 1 引数は `"event.progress"` のような完全名。`createClient(...).events.on("progress", ...)` が接頭辞を付ける
- `MemoryTransport` はハンドラの第 2 引数に `{ emit }` を渡す（モック内から progress を発火できる）。要求・応答・イベントは JSON に一度直列化して往復させ、wire 上の挙動（undefined の欠落等）を再現する
- transport の選択は `selectTransport({ mode: import.meta.env.VITE_TRANSPORT, factories: {...} })`。ライブラリ側は `import.meta.env` を読まない。`msw` / `http` は factories にキーを足す
- `WebView2Transport` は `PostWebMessageAsString` で文字列が来ても JSON として解釈する。既定タイムアウト 30s。`dispose()` で待機中の要求を reject

**Host**
- 環境変数名は `WEBVIEW2_BRIDGE_DEV_URL`（Debug ビルドのみ有効）
- WebView2 のユーザーデータは `%LOCALAPPDATA%\WebView2Bridge.Host`（exe 隣に書けない配置を想定）
- `apps/web/dist` が存在すれば Host のビルド後に `$(OutDir)wwwroot` へコピーする MSBuild ターゲット `CopyWebDist`（無ければスキップ）。Vite は `base: "./"`
- Host → Web の送信は `WebViewBridge.Post` で UI スレッドへマーシャリングする（`BeginInvoke`）。Impl のどのスレッドから `BridgeEvents.Progress` を呼んでもよい

**パッケージ化（Phase 4、2026-09-05）**
- 公開は 4 つ: npm `@ishibashi0112/webview2-bridge-gen` / `-client`、NuGet `WebView2Bridge.Runtime`（netstandard2.0）/ `WebView2Bridge.WinForms`（net48）。いずれも公開パッケージ（MIT）。手順は RELEASING.md。Mac から公開でき、会社 PC は公開版を restore するだけ
- npm は pnpm の `publishConfig` で公開時だけ `exports` / `bin` を `dist/` に向ける。workspace 内の開発では従来どおり `src/*.ts` を直接参照する（ビルド不要）。`dist/` は `tsc -p tsconfig.build.json`（NodeNext）で生成
- gen の CLI は `#!/usr/bin/env node` で動く。TypeScript の契約ファイルは `tsx/esm/api` の `tsImport` で読み込む（tsx は gen の dependency。利用側アプリに tsx を要求しない）
- **生成 Dispatcher は Partial Class をやめ、`Public Module DispatcherExtensions` の拡張メソッドにした**。`Dispatcher` が別アセンブリ（Runtime パッケージ）に移ったため Partial では結合できない。呼び出し側の書き方 `dispatcher.Register(api)` は変わらない。`MethodNames` は `DispatcherExtensions.MethodNames`
- ランタイムの名前空間は `WebView2Bridge.Runtime`（旧 `WebView2Bridge.Contract`）。生成される `Dispatcher.Generated.vb` と `Events.vb` は `Imports WebView2Bridge.Runtime` を持つ。名前空間は gen の `vb.runtimeNamespace` で変更可
- `WebViewBridge` は `WebView2Bridge.WinForms` 名前空間に移動。Host は `Imports WebView2Bridge.Runtime` と `Imports WebView2Bridge.WinForms` を追加
- NuGet のメタデータとバージョン（`WebView2BridgeVersion`）は `dotnet/Directory.Build.props` に集約。`IsPackable` は既定 false、Runtime / WinForms のみ true。XML ドキュメントを同梱
- バージョンは npm 2 つと NuGet 2 つで同じ番号を使う（0.x 系）。生成コードとランタイムの互換性は「同じマイナー版なら互換」を目安にする
- 別アプリで使うときの流れ: gen / client を npm から、Runtime を契約プロジェクトに、WinForms をホストに PackageReference。`vb.namespace` を自分の名前空間にする。この流れは tgz / nupkg のみを参照する一時プロジェクトで実際にビルド・実行して確認した

**NuGet 保留と gen によるランタイム出力（2026-09-06）**
- npm 0.1.0 を公開した時点で、管理を npm 1 系統にまとめたいという要望により **NuGet の公開は保留**にした（pack できる状態は維持）。理由: Mac と会社 PC がこまめに同期できず、管理するパッケージは少ないほどよい。VB ランタイムの改修は稀
- 代わりに gen が VB ランタイムを同梱し、設定 `vb.runtime.outDir` / `vb.winforms.outDir` で各アプリに書き出す。`packages/gen/vb-runtime/` は `dotnet/` のコピー（`scripts/sync-vb-runtime.mjs`、`pnpm build` で自動同期、テストで同期を検証）。唯一の正は引き続き `dotnet/` 側
- 書き出すファイルは auto-generated ヘッダ（gen のバージョン入り）付きで、`pnpm gen` で上書きされる。名前空間は NuGet 版と同じ `WebView2Bridge.Runtime` / `WebView2Bridge.WinForms` なので、どちらを使っても契約の生成物と呼び出し側は同一
- 同じディレクトリに複数の出力を向けても互いの生成物を消さないよう、古い生成物の削除はディレクトリ単位でまとめて行う
- このリポジトリでは `runtime` / `winforms` を設定せず ProjectReference のまま（`webview2-bridge.gen.json` は変更なし）
- 検証: gen 0.2.0 の tgz だけを入れた別アプリで、nuget.org の Newtonsoft.Json と Microsoft.Web.WebView2 以外を使わずに Contract / Impl / Host（WinForms exe）がビルドできた
- 単位の整理: アプリ 1 つ = Host の exe 1 つ = リポジトリ 1 つ（フロントと VB は同じリポジトリに置く。契約が唯一の正で両側へ生成するため）。既存 VB アプリの 1 Form として組み込む形も可
- 次の候補: 新しいアプリの骨組み（contract.ts、gen.json、3 つの .vbproj、MainForm、web）を置く `webview2-bridge-gen init` コマンド

**新規アプリの雛形 `templates/myapp/`（2026-09-13）**
- `init` コマンドの前段として、公開版 npm 0.2.0 だけで成立する最小アプリを `templates/myapp/` に置いた（contract 1 メソッド + 1 イベント、web、Contract / Impl / Host の 3 .vbproj、README）。root の pnpm workspace には含めない（`templates/` は `pnpm-workspace.yaml` の `packages` に無い）。コピーして `MyApp` を置換して使う
- 検証: Mac でテンプレート内 `pnpm install && pnpm gen:check && pnpm build:web` と `dotnet build dotnet/MyApp.sln`（0 警告、wwwroot コピー含む）が通ることを確認。2026-09-13 に会社の Windows 11 PC（AMD64）で Release exe を起動し、`transport: webview2` で `customers.list` が VB 側の 3 件を返すことを確認（PlatformTarget x64 固定後）
- 見つかった落とし穴 2 つを雛形と README / RELEASING.md に反映: (1) pnpm 11 は esbuild の postinstall を止めるので `allowBuilds: { esbuild: true }` が必須、(2) `ts.contractImport` は生成ファイルの場所からの相対パス（`web/src/generated/` なら `../../../contract/contract`）
- **Host は `PlatformTarget` を x64 に固定する（2026-09-13、Windows 実機で判明）**。AnyCPU のままだと Windows の `dotnet build` で SDK が .NET Framework exe に `win7-x86` を仮定し、WebView2 の targets が `runtimes\win-x86` のローダーだけを出力する一方、SDK の後段処理（`GetDefaultPlatformTargetForNetFramework`。`runtimes/win7-x86/` 配下の native 資産しか見ない）が PlatformTarget を AnyCPU に戻すため、exe は 64 ビットで動き、exe 隣に置かれた x86 の `WebView2Loader.dll` を拾って `BadImageFormatException` になる。本体 Host は `WebView2Bridge.WinForms` の ProjectReference 経由で 3 種類のローダーが出力に混ざるため偶然動いていた（テンプレートは WebViewBridge をソースで取り込むので救いがなかった）。Mac 上では RID 推定が走らないので再現しない。x86 専用のドライバが要るアプリは x86 に固定する（AnyCPU には戻さない）
- **`webview2-bridge-gen init <dir> [--name <Name>] [--force]` を実装（2026-09-13）**。`templates/myapp/` を `packages/gen/template/myapp/` に同期（`scripts/sync-template.mjs`、`pnpm build` で自動、`init.test.ts` が同期と「雛形の生成物が現行 gen で最新」「雛形の package.json が gen と同じ版」を検証）して npm に同梱し、init はそれをコピーして `MyApp` → 指定名、`myapp` → 小文字名に置換、.sln のプロジェクト GUID を振り直す。`.gitignore` は npm pack が改名するので `_gitignore` として同梱し init が戻す。名前は VB 識別子（`^[A-Za-z_][A-Za-z0-9_]*$`）に限定、既定はディレクトリ名の PascalCase。init は tsx / zod を読まない（CLI で generate を遅延 import）。リポジトリ内では `pnpm gen init` で公開前の版を試せる。検証: dist の CLI で生成した別アプリが npm 0.2.0 だけで install / gen:check / web build / dotnet build まで通る
- **`create-webview2-bridge` を追加（2026-09-13）**。`pnpm create <name>` は `create-<name>` パッケージを実行する規約なので、`pnpm create webview2-bridge <dir>` と短く書けるように、gen の `scaffold` を呼ぶだけの薄いパッケージ `packages/create` を **スコープ無し**で公開する（`@ishibashi0112/` が付くと長い、という要望。名前は 2026-09-13 時点で未使用だった）。gen には `workspace:^` で依存し、版は他の npm と同じ番号で揃えて `pnpm publish:npm` で一緒に公開する（公開済みの版は pnpm がスキップする）。公開パッケージは 3 つになるが、create の中身はほぼ変わらない
- **0.3.1（2026-09-13）**: (1) アプリ名にプレースホルダと同じ `MyApp` を許可した（`pnpm create webview2-bridge my-app` の既定名が `MyApp` になり、置換は無害なのに拒否していた）。(2) 端末（stdin が TTY）で `<dir>` や `--name` を省くと対話で聞く（`askInitOptions`。既定値は Enter で採用、不正な名前は聞き直し。パイプや CI では従来どおり usage / 既定値）。gen と create の両 CLI で共通。(3) 雛形の依存を最新（React 19.3、Vite 8.3、zod 4.6）に上げた。TypeScript 7 はメジャーなので 5.9 のまま。方針: キャレット付きなのでマイナー版は利用側で自動的に最新、宣言はリリース時に揃える、メジャーは雛形のビルド確認後に上げる（RELEASING.md 手順 1）
- VS の位置づけを雛形 README に明記: 生成・ビルド・実行は VS 無しで完結する。VS が要るのはフォームデザイナ、GUI デバッガ、旧 .vbproj を含む最終ビルドのときだけ。雛形の MainForm はデザイナを使わずコードで WebView2 を Dock=Fill する

**HTTP / OpenAPI: サーバー側を VB 以外に置き換えられる形を保つ（2026-09-19）**
- 背景: WinForms + WebView2 のデスクトップはいずれ Web（クラウド）に、サーバー側処理は VB.NET から別言語に移る時期が来る、という前提を置く。契約を OpenAPI 準拠の HTTP API にそのまま写せて、画面側は fetch ベースへ滑らかに切り替えられる、を要件に加えた
- 現状確認: 画面は `client.parts.search()` しか呼ばず、postMessage は `Transport`（`call` / `on` の 2 メソッド）の中に閉じている。契約は JSON Schema 2020-12 で、OpenAPI 3.1 が採用しているのと同じ。VB の Impl は `IXxxApi` の DTO in / DTO out で JSON-RPC も WebView2 も知らない。`Dispatcher.HandleAsync` は文字列 in / out なので HttpListener の後ろにも置ける。つまり捨てるのは WinForms Host と `WebViewBridge`、移植するのは Impl の業務ロジックだけ。契約・gen・client・React は残る
- **画面のコードを `fetch()` に書き換えることはしない。** 置き換えは Transport 層で行う（`HttpTransport` の中で fetch を使う）。型付けと zod 検証を残し、切り替えは環境変数（`VITE_TRANSPORT=http`、`VITE_HTTP_BASE_URL`）だけで済ませる
- **HTTP へのマッピング**（契約は動詞入りの RPC 型なので、GET/PUT/DELETE やリソース URL を持つ純粋な REST には寄せない。Connect RPC / tRPC / gRPC transcoding と同じ流儀）
  - `<ns>.<name>` → `POST /<ns>/<name>`。requestBody = input、200 の body = output。どちらも素の JSON で JSON-RPC の封筒は付けない
  - 失敗は JSON-RPC の error オブジェクト `{ code, message, data }` をそのまま body に載せる。-32602 / -32600 / -32700 → 400、-32601 → 404、-32010〜-32019（利用者向け。§5）→ 422、それ以外（-32000 等）→ 500。`HttpTransport` はこれを同じコードの `BridgeError` に戻すので、画面のエラー処理は変わらない。body が JSON-RPC error でない失敗（プロキシの HTML 等）やネットワーク断は -32603 に包む
  - イベントは `GET /events` を Server-Sent Events で提供する。各 `data:` 行は postMessage と同じ JSON-RPC 通知 `{ "jsonrpc": "2.0", "method": "event.<name>", "params": {...} }`（サーバー側は `BuildNotification` の出力をそのまま流せる）。`HttpTransport` は EventSource ではなく fetch でストリームを読む（認証ヘッダを call と同じように付けるため）。最初の `on()` で接続し、切れたら `retryMs`（既定 3s）後に再接続、`dispose()` で切る。サーバーにイベントが無いときは `events: false`（`on()` は no-op）
  - **設計上の制約: イベントは進捗表示などの補助通知に留め、業務の正しさをイベントに依存させない。** HTTP には postMessage の push に 1 対 1 で対応するものが無く、SSE は切断・再接続で取りこぼしうるため
  - 認証などの横断事項は契約に含めない（OpenAPI は `security: []`）。配備側で決め、`HttpTransport` の `headers`（関数可）/ `credentials` で付ける
- **gen に `emit-openapi.ts` を追加**。設定 `openapi.out`（例 `contract/openapi.json`）を書くと OpenAPI 3.1 を生成する（省略時は出さない）。`$defs` は `components/schemas` へ、メソッド入出力は VB の DTO と同じ名前 `<Ns><Method>Request` / `Response`、イベントは `<Name>Event` で components に置く（他言語のサーバースタブを openapi-generator 等で起こしたとき VB と同じ名前になる）。`.meta({ id })` の名前付きスキーマがそのまま入出力なら alias（`$ref`）にして重複させない。名前衝突はエラー。`operationId` は `partsSearch`（camelCase）、元のメソッド名は `x-webview2-bridge-method`。イベント一覧は `x-webview2-bridge.events`。オプション: `title` / `version`（契約の版）/ `servers`（既定 `["/"]`）/ `basePath` / `eventsPath`（`false` で省略）。Redocly CLI の lint で valid（残る警告は `info.license` 無しと events の 4xx 無しのみ）
- **client に `HttpTransport` を追加**（`packages/client/src/http.ts`）。`{ baseUrl, fetch?, headers?, credentials?, timeoutMs?, events? }`。テストは Node の `node:http` で契約を HTTP 提供する最小サーバーを立て、`createClient` 経由の往復・エラーコードの対応・ヘッダ・SSE の受信と再接続・dispose を実機の HTTP で確認している（VB を待たずに「サーバーが差し替え可能か」を Mac で確かめる手段でもある）。client の devDependencies に `@types/node` を追加（テストのみ）
- apps/web の `bridge.ts` に `http` ファクトリを追加（`VITE_TRANSPORT=http`、`VITE_HTTP_BASE_URL` 既定 `/api`）。雛形 `templates/myapp/` は触っていない（雛形は公開済み 0.3.1 の client に依存しており、`HttpTransport` は次の版から。**次のリリース（0.4.0、機能追加なのでマイナー）で雛形にも `http` ファクトリを足す**）
- 移行の段階: ① 今の WinForms デスクトップ → ② 同じ VB Impl を HttpListener（net48）で LAN 公開しブラウザから使う（`WebView2Bridge.HttpHost` を足す。`/<ns>/<name>` → `<ns>.<name>` に変換して `Dispatcher.HandleAsync` に渡し、JSON-RPC 応答を上のステータス対応で HTTP に写す。数十行）→ ③ `openapi.json` を元に別言語でサーバーを書き直し、画面は `VITE_TRANSPORT=http` に切り替えるだけ。②③は必要になったときに着手する

**自動テスト: 動作確認をテストコードで置き換える（2026-09-22）**
- 背景と設計の正本は slnmix リポジトリの `docs/HANDOFF-testing-2026-09.md`（3 リポジトリ横断。ユーザー承認済み）。要点: 専用ツールは作らず Playwright Test / Vitest / Knex の上に部品 3 つ（ホスト起動 + 契約呼び出し、DB ヘルパ、レポータ）と `doctor` だけを自作する。**テストはすべて TypeScript で、VB にテストは書かない**（VB は「テストされる側」）
- **3 層**: `e2e/screen`（L1: Vite dev + MemoryTransport。DB 不要。Mac / Claude Code が自走）/ `e2e/api`（L2: 実 exe の VB を契約経由で直接呼ぶ。`bridge.call("ns.method", input)`）/ `e2e/host`（L3: 実 exe の WebView2 を画面操作）。api / host は Windows でのみ走り、DB を共有するので 1 ワーカー直列
- **WebView2 への接続は CDP**（Playwright 公式の方法）: exe を `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` と `WEBVIEW2_USER_DATA_FOLDER`（一時ディレクトリ）、`WEBVIEW2_BRIDGE_DEV_URL`（Vite dev）付きで spawn し、`/json/version` が応答したら `connectOverCDP` → `contexts()[0].pages()[0]`。**VB は無改修**。api / host も dev サーバー経由で動かす（`pnpm build:web` は不要。開発ビルドだけが `window.__webview2Bridge` を公開するため）
- **`window.__webview2Bridge`**: `bridge.ts` が `import.meta.env.DEV || VITE_EXPOSE_BRIDGE === "1"` のとき `createClient` の戻り値を window に公開する。L2 はこれを `page.evaluate` から呼ぶ。本番ビルドでは公開しない
- **新パッケージ `packages/test`（npm `@ishibashi0112/webview2-bridge-test`。公開は 4 つ目）**: `test` / `expect`（`@playwright/test` を拡張。フィクスチャ `page` / `bridge` / `db` / `testId`、ワーカーオプション `e2e` / `layer`）、`defineE2EConfig` + `playwrightConfig`（`/config`。projects / webServer / reporter / 1 ワーカー / Windows は `channel: "msedge"`、`E2E_BROWSER_EXECUTABLE` で実行ファイル指定）、`/reporter`（Markdown を `test-results/report.md` に出し、失敗があればクリップボードへ。petari と同じ OS コマンド方式。error-context 等のテキスト添付は本文に取り込む。120K 文字で切る）、CLI `webview2-bridge-test doctor`（e2e.config.ts を `tsx` で読み、ブラウザ起動 / exe の CDP 起動 / DB 接続とガードの 3 点を確認）
- **DB ヘルパは Knex を包む**（`db.query` / `insert` / `rows` / `snapshot` / `diff` / `expectRow`）。選定理由: SQL Server と Oracle の両方を公式 dialect で持つのは Knex だけ（Prisma / Drizzle は Oracle 非対応、Kysely はコミュニティ dialect）。既存 DB にテーブル名文字列で動的アクセスする用途にスキーマ生成型 ORM は過剰。方言差（プレースホルダ / 識別子引用符 / LIMIT）は Knex に任せる。ドライバはアプリ側の devDependency（雛形は `tedious` と `oracledb` を同梱。`mssql` パッケージは Knex では使われないので入れない）。接続情報は `.env.e2e.local`（`E2E_DB_*`。Node 標準の `util.parseEnv` で読み、既存の環境変数は上書きしない）。**ガード**: `db.allowedDatabases` に接続先（DB 名か `host/DB名`）が無いと起動時に止まる。空も止める。**後片付け**: `insert` した行と `diff` で増えた行を逆順に削除。`db.track` を書くと毎テストの前後で自動的に差分を取り、アプリが作った行も消す。`snapshot` で `where` を省くと警告し `maxRows`（5000）で打ち切る
- **api / host は Playwright の既定ブラウザも起動する**（`page` フィクスチャの上書きが `context` に依存するため。Windows では headless Edge）。1〜2 秒の無駄だが、Playwright 内蔵のスクリーンショット / トレース処理を screen で失わないための割り切り。host 層の失敗時スクリーンショットは `page` フィクスチャが自前で撮って添付する
- **`test/host.test.ts` は WinForms ホストの代役としてヘッドレス Chromium を起動する**（`test/fixtures/fake-host.sh` が WebView2 と同じ環境変数を解釈）。本物の CDP 接続 → ページ取得 → `bridge.call` → 終了処理まで Mac / Linux で通る。Windows 実機の確認は `pnpm --filter web test:doctor` と `test:e2e`（**2026-09-22 時点で未実施**。ユーザーが会社 PC で行う）
- **雛形**: `playwright.config.ts`（ルート）、`e2e/e2e.config.ts`、`e2e/{screen,api,host}/customers.spec.ts`、`e2e/README.md`（テストの型・観点の読み取り元・DB 設定）、`.env.e2e.example`、`.npmrc`（`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`。**npm pack は `.npmrc` を同梱しないので `_npmrc` として同梱し init が戻す**。`.gitignore` → `_gitignore` と同じ仕組み。tgz から scaffold して戻ることを確認済み）、scripts `test` / `test:e2e` / `test:all` / `test:doctor`。`main.tsx` の要素に `data-testid`。sync-template は `test-results` / `playwright-report` を除外
- **Claude Code on the web の環境は Chromium をダウンロードできない**（プロキシで遮断。同梱は chromium-1194 = Playwright 1.56）。`E2E_BROWSER_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` を付ければ Playwright 1.63 でも screen と host.test が動くことを確認済み
- **slnmix との整合（2026-09-22 解決）**: slnmix はルートを `.sln` の場所に固定していたため、雛形（`dotnet/MyApp.sln`）では `web/` `contract/` `e2e/` と `webview2-bridge.gen.json` がルート外になっていた。slnmix 0.16.0 でルートを「`--root` > 入力のディレクトリから上に向かって最初に見つかる `slnmix.config.json` の場所 > 入力のディレクトリ」で決めるようにし、設定に `target` を足した（雛形の `.sln` を動かす案は新規アプリしか直らないため不採用）。雛形は `slnmix.config.json`（`target: "dotnet/MyApp.sln"`、extraRoots `web` / `contract` / `e2e`（kind test））を同梱し、アプリのルートで `npx slnmix` と打つだけで物理パスが `dotnet/MyApp.Impl/X.vb` の形（petari のルートと一致）になる。このリポジトリ自身にも同じ形の `slnmix.config.json` を置いた

**雛形に `.gitattributes` を追加、`allowBuilds` に oracledb を明示（2026-10-06、0.5.1）**
- 背景: `pnpm create webview2-bridge` で作った新規アプリ（SBOM、`ishibashi0112/s-b`）に `.gitattributes` が無かった。本体は `* text=auto eol=lf` で生成物を LF に固定し、Windows の `core.autocrlf=true` による CRLF 化と `pnpm gen:check` の誤検知を防いでいる（2026-09-06 の Windows 確認で実際に改行差分が出た。§14）が、雛形から作ったアプリにはこの保護が無かった。s-b では手で本体と同じ `.gitattributes` を足して回避した
- `templates/myapp/.gitattributes` を追加した。規則は本体直下の `.gitattributes` と同じ（`* text=auto eol=lf` + バイナリ指定）で、コメントだけ雛形向けにした。本体の規則を変えたら雛形も揃える
- **同梱は改名しない**: `.gitattributes` は npm pack / pnpm pack とも tgz に入り、npm / pnpm の install でも消えないことを確認した（2026-10-06、npm 10.9 / pnpm 11.18）。`.gitignore` / `.npmrc` と違って `_gitattributes` にする必要が無いので、そのまま同梱・コピーする（`BUNDLED_RENAMES` / `BUNDLED_RESTORE` は変えない）。pack で落ちるようになったらそこに足す
- テスト: `init.test.ts` の scaffold テストで `.gitattributes` が出力され `* text=auto eol=lf` を含むことを検証する（既存の同期テストは dotfile も対象なので `.gitattributes` の同期も検証される。同梱コピーから消すと両方落ちることを確認）
- 検証: `pnpm pack:npm` の tgz から create → scaffold したアプリに `.gitattributes` が出力され、`core.autocrlf=true` の git で commit → checkout しても生成物が LF のまま（`.gitattributes` が無いと CRLF になる）。同じアプリで install → gen:check（11 files）→ web typecheck → screen 4 件が通った
- 版: 雛形を変えたので gen を 0.5.1 にした。RELEASING 手順 1 に従い npm 4 つと `WebView2BridgeVersion` を 0.5.1 に揃え、雛形の gen / client / test の版を `^0.5.1` に、`pnpm gen:template` でランタイムのヘッダを 0.5.1 にした。**公開はユーザーが行う**（RELEASING.md）
- **雛形の `allowBuilds` に `oracledb: false` を追加（同じ 0.5.1）**: 検証中に、雛形から作ったばかりのアプリの `pnpm install` が `ERR_PNPM_IGNORED_BUILDS: oracledb@7.0.1` で終了コード 1 になることが分かった（pnpm 11.18。許可も拒否もしていないビルドスクリプトがあると失敗する。公開版 `create-webview2-bridge@0.5.0` で作ったアプリでも再現）。oracledb の install スクリプトは Node の版と Thick モード用バイナリの有無を確かめてメッセージを出すだけで、何も書き換えない（バイナリは tgz に同梱済み）。雛形は Thin モード（Instant Client 不要）で使うので `false`（拒否）にした。`true` にしても動くが、何もしないスクリプトを許可する理由が無い。Thick モードが要るときも Oracle Client を入れれば動く。検証: tgz から scaffold したアプリで手を加えずに install（終了コード 0）→ gen:check → web typecheck → build:web → screen 4 件、knex 経由で oracledb が Thin モードで読み込めることを確認。雛形 README の注意も「ビルドスクリプトを持つ依存を足したら `allowBuilds` に `true` / `false` を書く」に直した。0.5.0 以前で作ったアプリ（s-b 等）で install が落ちる場合は、同じ 1 行を `pnpm-workspace.yaml` に足す
- 0.5.0 以前で作ったアプリには、本体か雛形の `.gitattributes` を手でコピーしてコミットする。コミットだけでは既存の作業ツリーは CRLF のまま残るので、Windows では変更をすべてコミットしてから `git rm -r --cached . && git reset --hard` で LF に書き直す（Linux の `core.autocrlf=true` で再現して確認）

**契約の書式は zod のまま。Effect Schema は採用しない（2026-10-07）**
- 背景: Effect（Effect-TS/effect）が 2026-10-01 に 4.0 安定版（LTS）になり、zod から乗り換えるべきか検討した。Effect 4.0.1 で現行の `contract/contract.ts` を Effect Schema に書き直し、作業用ディレクトリで zod 4.6.5 と比べた（リポジトリは変更していない）
- できること: 契約の記述、JSON Schema 出力（`Schema.toJsonSchemaDocument`）、共有型の名前（`.annotate({ identifier })` → `#/$defs/<id>`）、実行時検証（Standard Schema 対応）はすべてできる
- 違い: Effect の JSON Schema は書いたスキーマではなく「JSON codec（`toCodecJson`）の encoded 側」を表すので、素直に書くと zod と形が変わる。`Schema.Number` は `number | "Infinity" | "-Infinity" | "NaN"` の union になる（emit-vb は union をエラーにする。`Schema.Finite` なら `number`）。`Schema.optional(T)` は `T | null` になるが、通常の decoder は null を拒否するので client の検証と食い違い、optional = キーごと省く（`NullValueHandling.Ignore`）の前提とも合わない（`Schema.optionalKey` なら今と同じ）。出力は `$defs` ではなく `definitions` を持つ文書で、`additionalProperties` は既定で true（`onExcessProperty: "error"` で false）
- サイズ: 同じ検証を Vite 8 でビルドすると zod 110 KB（gzip 26 KB）/ Effect 93 KB（gzip 25.5 KB）/ `zod/mini` 23 KB（gzip 6.6 KB）でほぼ同等。WebView2 はローカル配信なので判断材料にならない
- 判断: 採用しない。Effect の強み（型付きエラー、DI、構造化並行性、`effect/rpc` / `effect/http-api`）はサーバーも TS であることが前提で、サーバーが VB の本基盤では生きない。`effect/rpc` / `effect/http-api` は本基盤と役割が重なる（入れるなら基盤ごと置き換えになる）。§2 の「薄い基盤」「既製フレームワークは採用しない」にも反する（契約を書く人に `Finite` / `optionalKey` の作法を求める）。移行は gen / client / test の peerDependency、雛形、既存アプリの契約を書き換える破壊的変更になるのに得るものが無い。資産は JSON Schema 側にあるので、契約の書式を替えたくなっても変わるのは gen の入口だけで済む
- client を Standard Schema 経由にして zod 以外の検証ライブラリを受け付ける案も見送った。JSON Schema の出し方がライブラリごとに違い（上の Effect の例）、gen の前提（`z.toJSONSchema` と `.meta({ id })`）が崩れるため
- 見直す時期: (1) 画面側の非同期処理（並列・リトライ・キャンセル）が複雑になったら、画面のコードだけで Effect を使うのは可（`client.<ns>.<method>()` を `Effect.tryPromise` で包む。契約と基盤は変えない）。(2) 「HTTP / OpenAPI」の段階 ③ でサーバーを TS で書くなら、そのとき `effect/http-api` と `openapi.json` を突き合わせて検討する

**SBOM 移行の改善提案 P1 の 3 件（2026-10-08、0.5.2）**
- 背景: [docs/handoff/改善提案_SBOM移行から.md](docs/handoff/改善提案_SBOM移行から.md) の P1（A-1 enum の空文字 / B-1 雛形の Release で F12・F5 / A-2 Object のメンバー名）。すべて破壊的変更なし（既定の動きは変えず、今までコンパイルできなかった入力だけが変わる。既存のスナップショットは不変）
- **A-1 enum の空文字・記号だけの値**: `naming.ts` の `toIdentifier` が `_` 単独（VB では行継続文字で識別子にならない）を返さないようにした。空文字は `Empty`、英数字を含まない値は文字ごとの名前をつなぐ（`-` → `Hyphen`、`*` → `Asterisk`、`<=` → `LessThanEqual`、`" "` → `Space`、`_` → `Underscore`。ASCII の記号・空白 33 種の表を `naming.ts` に持つ）、ASCII に無い文字はコードポイント（`★` → `U2605`）。位置依存の `Value1`, `Value2` … は値を足すと名前がずれて VB 側の参照が壊れるので採用しなかった。どの文字列からも決定的に名前を作れるので「名前を作れない値の GenerateError」は不要になった。`toIdentifier` 共通なのでプロパティ名にも同じ規則が効く
- 同じ enum クラスの `Values` 配列と値 `"values"` の `Public Const Values` が二重定義になっていたので、重複回避の `used` に `values` を先に入れて `Values_` にする（大文字小文字だけ違う値の `_` 付けと同じ規則）
- TS 側（`z.input` / `z.output` で契約から型を引く）と OpenAPI（enum の値をそのまま写す）、client の zod 検証は変更不要と確認した
- **A-2 Object のメンバー名**: メソッド名・プロパティ名（無名の入れ子 object も含む）・イベント名の PascalCase が `Equals / Finalize / GetHashCode / GetType / MemberwiseClone / ReferenceEquals / ToString`（大文字小文字を区別しない）と同じなら `GenerateError`（契約内のパス付き。契約側で名前を変えるよう案内）。自動改名はしない（VB の実装者が契約と突き合わせられなくなる）。`GetType` は予約語なので今まで `[GetType]` と囲んで通していたが、Object.GetType とぶつかるのは同じなので止める。enum の定数名（`z.enum(["equals"])` → `Public Const Equals`）は Shadows の警告で済み今もビルドできるので、互換性のため変えない。DTO のクラス名は Object のメンバーとぶつからないので対象外
- **B-1 雛形の Release で F12 / F5**: `MainForm` に `Public Shared ReadOnly Property DevMode As Boolean` を足した。Debug ビルドは常に True、Release は環境変数 **`WEBVIEW2_BRIDGE_DEV=1`** のときだけ True（本番で調べるとき用。`WEBVIEW2_BRIDGE_DEV_URL` と名前を揃えた）。`AreDevToolsEnabled` と `AreBrowserAcceleratorKeysEnabled` を DevMode に連動させる（本番では F12 / F5 / Ctrl+R に加えて Ctrl+F / Ctrl+P / Ctrl+± のズームも効かなくなる。画面の JavaScript の keydown は影響を受けないので、要るショートカットは画面で実装する）。`WEBVIEW2_BRIDGE_DEV_URL`（dev サーバー接続）は従来どおり Debug のみ（配布した exe を環境変数で別の URL に向けられる必要は無い）
- `NewWindowRequested` は **http(s) なら既定のブラウザで開き、それ以外は止める**（`e.Handled = True`）。既定のままだとブリッジの無い素の WebView2 窓が開き、この基盤では役に立たないため。SBOM のように止めるだけだと `target="_blank"` のリンクが黙って効かなくなるので、ブラウザに渡す形にした。`app.local` のような仮想ホストの URL はブラウザでは表示されないので、外部リンクだけに使う
- 本体の `dotnet/WebView2Bridge.Host/MainForm.vb` も同じ形にした（雛形と振る舞いを揃える。§14 の Windows 確認手順「F12 で DevTools」は Debug 実行なので従来どおり）。環境変数名は CLAUDE.md「名前」にも足した
- 版: 雛形を変えたので gen を 0.5.2 にした。RELEASING 手順 1 に従い npm 4 つと `WebView2BridgeVersion` を 0.5.2、雛形の gen / client / test を `^0.5.2`、`pnpm gen:template` でランタイムのヘッダを 0.5.2 にした。**公開はユーザーが行う**（RELEASING.md）
- 検証: Linux（Claude Code on the web）で gen 47 件（A-1 / A-2 のテスト 2 件を追加）、client 31、test 45、create 4、web screen 6、`pnpm -r typecheck`、`pnpm gen:check`、`pnpm build`。VB のビルドは当初この環境では未確認だった（.NET SDK のダウンロードがプロキシで遮断される）が、環境 `webview2-bridge (.NET)` を作り（§14 既知の注意点）、2026-10-09 に Linux で `dotnet build dotnet/WebView2Bridge.sln`（`MainForm.vb` の `DevMode` / `NewWindowRequested` を含む 6 プロジェクト）が 0 警告で通った。残りは Windows 実機で雛形から作ったアプリを Release でビルドして F12 / F5 が効かないこと、Debug では効くこと、`WEBVIEW2_BRIDGE_DEV=1` なら Release でも効くことを確認する（B-1 の完了条件）

**SBOM 移行の改善提案 P2 の 4 件（2026-10-09、0.6.0）**
- 背景: 改善提案の P2（A-3 登録漏れ / B-2 index.html のキャッシュ / B-3 業務エラー / B-4 配布の形）。すべて破壊的変更なし。ランタイム・client・生成物に機能が増えるので **0.6.0（マイナー）** にし、未公開だった 0.5.2（P1）はここに統合した（0.5.2 は公開しない）
- **A-3 登録漏れ**: 生成 `DispatcherExtensions` に `MissingMethods(dispatcher) As String()`（`MethodNames` のうち `RegisteredMethods` に無いもの）を足した（提案の案 1。案 2 の `RegisterAll` は名前空間を足すと既存の呼び出しが壊れるので不採用）。雛形と本体の `MainForm` は **DevMode のとき**（Debug、または Release で `WEBVIEW2_BRIDGE_DEV=1`）に起動時に確かめ、漏れがあれば MessageBox で知らせる。本番では確かめない。生成 Dispatcher の `Imports` に `System.Collections.Generic` / `System.Linq` が増えた（スナップショット更新。既存アプリは `pnpm gen` で生成し直すだけ）。`Contract.Tests` に `MissingMethods_Lists_Contract_Methods_Not_Registered` を追加
- **B-2 キャッシュ**: `MainForm.StartUrl(wwwroot)` が index.html の更新日時（UTC Ticks）を `?v=` に付けて `Navigate` する（SBOM と同じ。dev サーバー接続時は付けない）。雛形と本体
- **B-3 業務エラー**: 決めたこと: **コードは -32010 = Business**。**-32010〜-32019 を「利用者向け」の範囲**にし、ファイル書き込み失敗のような「利用者向けだが業務エラーではない」ものはアプリが -32011 以降に置く（SBOM の `FileWriteFailed = -32011` はそのまま範囲に入る）。範囲にしたのは、画面の出し分け（`isUserFacingError` なら message をそのまま見せる）を基盤側で 1 つの関数にするため。VB ランタイム: `JsonRpcErrorCodes.Business / UserFacingMin / UserFacingMax / IsUserFacing(code)`、`BusinessErrorData`（`field`。Nothing ならキーごと省く）、`JsonRpcException.Business(message, Optional field)`。client: `isBusinessError` / `isUserFacingError` / `errorField` / `businessError(message, { field?, method? })`（`packages/client/src/errors.ts`）、`JsonRpcErrorCodes.Business / UserFacingMin / UserFacingMax`。`MemoryTransport` はハンドラが投げた `BridgeError` に method が無ければ付ける（実 transport と同じ。モックは method を知らずに `businessError()` を投げてよい）。`field` は要求の JSON 名（camelCase）。生成器で要求の項目名を定数に出す案は見送り（TS は型、VB は DTO のプロパティ名で足りる）。見本として雛形の `customers.list` と本体の `parts.search` は keyword に `%` があると Business（field = keyword）を返し、雛形の `main.tsx` は入力欄の横に、本体の `App.tsx` は `business -32010` として出す。screen / api のテストを足した。§5 に決まりを書いた
- **B-4 配布の形**: 雛形の `MyApp.Host.vbproj` に **opt-in の `<AppFilesDir>`**（空 = 今の形が既定、`MyApp\` = 直下は exe と exe.config だけで残りは `MyApp\` に入る）。実行時は配置を自動で判定するので、ビルド設定を VB に伝える仕組みは要らない: `MainForm.FilesDirName = "MyApp"`、`FilesRoot`、`WwwRoot`（`MyApp\wwwroot` があればそちら、無ければ exe 隣）、`ConfigureWebView2Loader()`（`Program.Main` の最初。`MyApp\WebView2Loader.dll` があれば `CoreWebView2Environment.SetLoaderDllFolderPath`）。`App.config` の `<probing privatePath="MyApp" />` は常に入れる（まとめていないときは何もしない。SDK が exe.config に bindingRedirect と一緒に出す）。vbproj は SBOM の形（`WebView2NeverCopyLoaderDllToOutputDirectory`、`GeneratePathProperty` で `runtimes\win-$(PlatformTarget)\native\WebView2Loader.dll` を `None` + `Link`、`PlaceReferencesInAppFilesDir` が `_CopyFilesMarkedCopyLocal` の前に `ReferenceCopyLocalPaths` の `DestinationSubDirectory` を付け替えて WPF 版と runtimes 配下のローダーを除く、`RemoveOldLayout` が直下の `*.dll` / `*.pdb`（exe 自身の pdb は除く）と `wwwroot` / `runtimes` を消す、`CopyWebDist` は `$(OutDir)$(AppFilesDir)wwwroot`）。`Directory.Build.props` に `DebugType=embedded`（配布ファイルを減らす。行番号は出る）。`init` の質問には足さない。SBOM 固有のローカル設定（`appSettings file`）と `*.map` の除外は雛形に入れない。フォルダ名は `MyApp`（アプリ名）固定で、空か `MyApp\` かだけを選ぶ。**Windows 実機では未確認**（SBOM が同じ形で 2026-10-08 に確認済み。雛形での確認は次の Windows 作業で）。2026-10-10 に Linux で机上確認（§14 の手順 7 のうち起動以外）: `pnpm gen init` で作った CheckApp を `AppFilesDir=CheckApp\` で Release ビルドすると直下は exe と exe.config だけになり、`CheckApp\` に Contract / Impl / WebView2 Core・WinForms / Newtonsoft.Json / WebView2Loader.dll（x64）/ wwwroot が入る（Wpf 版と `runtimes\` は無し。`RemoveOldLayout` が前の形の DLL・wwwroot・runtimes を消す）。**見つかった問題と対応**: 空に戻して再ビルドすると `CheckApp\` の DLL と WebView2Loader.dll は MSBuild の増分クリーンが消すが、`CheckApp\wwwroot` は Copy タスクの出力なので残り、`MainForm.WwwRoot` がそちらを優先して古い画面が出る。雛形に `RemoveAppFilesDirLayout` ターゲット（`AppFilesDir` が空のとき `$(OutDir)MyApp\` を消す）を足した（0.6.0 は未公開なので版は上げない）。戻した後の直下は以前の形（DLL・`runtimes\`・wwwroot）に戻り `CheckApp\` は消える
- 本体の `dotnet/WebView2Bridge.Host` には B-4 を入れない（WinForms を ProjectReference で持つ開発用で、配布の形を試す場所ではない）。A-3 / B-2 / B-3 は本体にも入れた
- 版: npm 4 つと `WebView2BridgeVersion` を 0.6.0、雛形の依存を `^0.6.0`、同梱ランタイムのヘッダを 0.6.0 にした。**公開はユーザーが行う**。手順の注意: `pnpm gen:template` は `pnpm --filter @ishibashi0112/webview2-bridge-gen sync:vb-runtime` の**後**に走らせる（雛形の `Runtime/` は gen 同梱のコピーから書かれるため。先に走らせると古いランタイムが雛形に入り `init.test.ts` が落ちる。`pnpm build` は順序を含めて面倒を見る）
- 検証: Linux で gen 48 件（A-3 のテスト 1 件追加、Dispatcher のスナップショット更新）、client 35（業務エラーのテスト 4 件追加）、test 45、create 4、web screen 7（業務エラー 1 件追加）、`pnpm -r typecheck`、`pnpm gen:check`、`pnpm build`。雛形の web は `pnpm pack` した client 0.6.0 を雛形の node_modules に一時的に差し替えて typecheck と screen 5 件（業務エラー 1 件を含む）を確認した（公開後に雛形から作るアプリと同じ状態）。VB のビルドと `dotnet test` は 2026-10-09 に Linux（Claude Code on the web、§14 既知の注意点の環境）で確認した: `dotnet build dotnet/WebView2Bridge.sln` 0 警告、`dotnet test dotnet/WebView2Bridge.Contract.Tests` 19 件通過（追加 3 件を含む）、`pnpm gen init` で作ったアプリの Debug / Release ビルド 0 警告、B-4 の配置は上の B-4 のとおり机上確認済み。**Windows 実機は未確認**。次に Windows で (1) 雛形から作ったアプリの Debug 起動で登録漏れの MessageBox（Register を 1 行消して試す）、(2) `AppFilesDir` を `MyApp\` にした Release exe が起動する、(3) wwwroot を入れ替えて古い画面が出ない、(4) keyword `%` で業務エラーが入力欄の横に出る、を確認する

**SBOM 移行の改善提案 P3 の 5 件（2026-10-09、0.6.0）**
- 背景: 改善提案の P3（A-4 Decimal / C-1 モックの差し替え / C-2 複数ウィンドウ / B-5 配布スクリプト / D-1 文書）。すべて破壊的変更なし。P1 / P2 と同じ 0.6.0 に入れる（Windows 実機の確認はまとめて行う。§14 の一覧）
- **A-4 Decimal**: 決めたこと: meta のキーは `vbType` ではなく **JSON Schema の `format`** に乗せる: `z.number().meta({ format: "decimal" })`。zod の `.meta()` はそのまま JSON Schema に出るので `contract.schema.json` と `openapi.json` に `format: decimal` が写り（OpenAPI で BigDecimal 等に対応付ける慣例の書き方）、他言語のサーバースタブにも伝わる。`vbType` だと VB だけの都合が契約に入る。emit-vb は `number` + `format: decimal` → `Decimal`（optional / nullable は `Nullable(Of Decimal)`）。既定は Double のまま、TS は `number` のまま。JS の数値は double なので wire 上の精度はもともと double で、Decimal にする意味は VB 側の計算（Oracle NUMBER との `CDec` / `CDbl` の書き分けを無くす）にある。Newtonsoft は Decimal プロパティを `ReadAsDecimal` で読むので `FloatParseHandling` は変えない（`JsonRpc.ParseToken` は Double のまま。JToken からの変換は有効 15 桁で、JS から来る値はそれで足りる）。`integer` に `format: decimal` は効かない
- **C-1 モックの差し替え**: client の `MemoryTransport` に `override(method, 関数 | { result } | { error })`（戻り値で元に戻す）と `resetOverrides()`、`exposeMemoryTransport(transport)`（開発ビルドで `window.__webview2BridgeMock` = `override` / `reset` / `transport` を公開。雛形と本体の `bridge.ts` が `__webview2Bridge` と並べて呼ぶ。`MemoryTransport` のときだけ）。packages/test に `mockReturn(page, method, value)` / `mockThrow(page, method, { code, message, data })` / `mockBusinessError(page, method, message, field)` / `mockReset(page)`。仕組み: 同じ関数を `page.addInitScript`（以後の読み込み）と `page.evaluate`（今のページ）の両方で流し、ページ側に実物（`exposeMemoryTransport` 済み）があれば即時に `override`、無ければ `pending` に積んで `exposeMemoryTransport` が取り込む。起動時に呼ぶメソッド（SBOM の `app.getContext`）も `page.goto` の前に `mockReturn` しておけば差し替わる。**関数を渡す `mockOverride` は作らない**（テスト側の変数を閉じ込められず、関数の文字列化は変換や CSP で壊れやすい。データだけ渡す）。差し替えはページ単位（テストごとに新しい page）なので戻す必要が無い。SBOM の `?dev=0` の抜け道はこれで置き換えられる。雛形と本体の screen テストに見本（`mockThrow` で取得失敗、`mockReturn` で差し替え。reload 後も効く）
- **C-2 複数ウィンドウ**: packages/test に `listPages(context)` / `waitForPage(context, predicate, { timeout, description })` と、フィクスチャ `hostWindows()` / `waitForWindow(predicate)`（api / host は exe の BrowserContext、screen は Playwright の context）。新しい WebView2 ウィンドウは同じ BrowserContext に新しい Page として現れる（CDP では 1 ブラウザに複数ページ）。`page` フィクスチャは今のまま。`host.test.ts` で 2 つ目のページを `newPage` で開いて `waitForPage` が拾うこと、タイムアウトのメッセージに今のウィンドウ一覧が出ることを確認した。実機の複数ウィンドウは SBOM で確認する
- **B-5 配布スクリプト**: `templates/myapp/scripts/deploy.ps1`（UTF-8 BOM 付き。Windows PowerShell 5.1 で動く書き方）。提案の手順どおり（ビルド → 配布物の確認 → 使用中の確認 → y/N → 控え → 入れ替え → 記録、`-SkipBuild` / `-Yes` / `-DryRun` / `-Source` で戻す）。決めたこと: (1) 入れ替える項目 = 配布物の直下の項目だけ。配布先の直下にほかのアプリのファイルがあっても（母艦と同じ階層に置く形）触らず、使用中の確認も入れ替える項目の中の exe / DLL だけを見る、(2) フォルダ（`MyApp\` / `wwwroot\` / `runtimes\`）は `robocopy /MIR /XF <Keep>` で同期（古いハッシュ付き js を消す。`*.local.config` は配布先の物を残す）、ファイルは Copy-Item、(3) 控えは入れ替える項目だけを `artifacts\deploy-backup\<日時>\` に（`-Source` にそのまま指定して戻せる）、(4) 記録は `MyApp.deploy-info.txt`（アプリ名付き。同じ階層にほかのアプリがあっても衝突しない）、(5) `*.pdb` は配布しない（`DebugType=embedded` なので通常は無い）。雛形の `.gitignore` に `artifacts/`。**この環境には PowerShell が無く未実行**。Windows で `-SkipBuild -DryRun` から試す
- **D-1 文書**: RELEASING.md と雛形 README に `minimumReleaseAgeExclude`（公開から 24 時間以内でもその版を使う pnpm への指示。翌日以降は消してよい）の説明
- 検証: Linux で gen 49（A-4 のテスト 1 件追加）、client 40（override / exposeMemoryTransport 5 件追加）、test 48（mock 3 件追加、host.test に複数ウィンドウ）、create 4、web screen 9（mockThrow / mockReturn 2 件追加）、`pnpm -r typecheck`、`pnpm gen:check`、`pnpm build`。雛形は `pnpm pack` した client と test の 0.6.0 を node_modules に差し替えて typecheck と screen 7 件を確認した。**差し替え後は `web/node_modules/.vite` を消すこと**（Vite の依存キャッシュがパッケージの中身の変更に気づかず、`exposeMemoryTransport` が無い古い束を使って画面が出なくなった）。VB のビルドは 2026-10-09 に Linux で確認した（P2 と同じ `dotnet build` / `dotnet test`。A-4 の `Decimal` は本体の契約に無いので gen のスナップショットのみで、VB で `Decimal` を往復する確認は §14 の手順 9）。Windows 実機・`deploy.ps1` は未確認

**0.6.0 の公開前整備（2026-10-10）**
- 背景: VS Code の Problems に `templates/myapp/web/src/bridge.ts` / `main.tsx` の「`businessError` / `exposeMemoryTransport` / `errorField` / `isUserFacingError` が無い」というエラーが出ていた。原因は雛形の `node_modules` に公開済みの古い client（0.4.0）が入っていたこと（0.6.0 で足した export を知らない）。コード側の問題ではなく、リポジトリの `pnpm -r typecheck` / `pnpm -r test` / `pnpm gen:check` / `dotnet build` / `dotnet test` はすべて通る。**0.6.0 を公開したあと `templates/myapp` で `pnpm install` すれば消える**（公開当日は `minimumReleaseAge` に注意。§14 既知の注意点）。未公開の版に雛形を合わせている間はこのエラーが出るものと理解しておく
- RELEASING 手順 1 に従い、雛形の依存宣言をマイナー最新に揃えた: `@playwright/test ^1.64.0`、`tedious ^20.3.3`、`vite ^8.3.4`、`@vitejs/plugin-react ^6.1.2`（React 19.3.0 / zod 4.6.5 / @types は既に最新）。メジャー（TypeScript 7.0、oracledb 26）は上げない（oracledb 26 は雛形で未確認。TypeScript 7 は 0.3.1 の方針どおり）
- 作業ツリーの `templates/myapp/dotnet/MyApp.sln` が CRLF だった（§14 既知の注意点に書いてあった件）を `rm` → `git checkout` で LF に戻し、`sync:template` で同梱コピーも LF にした。0.6.0 の tgz からは LF になる
- 検証: `pnpm gen init <dir> --name Tpl` → `dotnet build dotnet/Tpl.sln -c Release` が 0 警告で通る。gen のテスト 49 件（init.test.ts の同期・版の一致を含む）が通る
- **公開（2026-10-10 00:44〜00:46Z）**: `pnpm publish:npm` で 4 つとも 0.6.0 を公開、`latest` も 0.6.0。npm の 2 要素認証（OTP / ブラウザ認証）を聞かれるので Claude Code の非対話シェルからは公開できず（`ERR_PNPM_OTP_NON_INTERACTIVE`）、利用者が自分のターミナルで `pnpm publish:npm` を実行する。公開後の確認: `templates/myapp` で `pnpm install --config.minimum-release-age=0` → 0.6.0 が入り、VS Code のエラーが消え、`webview2-bridge-gen --check`（11 files）と web の tsc が通る。`pnpm dlx create-webview2-bridge@0.6.0 sample` → install → gen --check → tsc + vite build → `dotnet build dotnet/Sample.sln -c Release` 0 警告、`Sample.sln` は LF。タグ v0.6.0 を作成

## 11. CLAUDE.md（リポジトリ直下に置く内容）

```markdown
# webview2-bridge
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
- `dotnet build dotnet/WebView2Bridge.Contract` （Mac でも通ること）
- `dotnet build dotnet/WebView2Bridge.sln` （Windows）
```

## 12. フェーズ計画と完了条件

### Phase 0 — 足場
- pnpm workspace、`dotnet/` の 3 プロジェクト + sln、Directory.Build.props、`.gitignore`、CLAUDE.md
- 完了条件: `pnpm install` が通り、`dotnet build dotnet/WebView2Bridge.Contract` が Mac で通る（中身は空でよい）

### Phase 1 — 契約とジェネレータ
- `defineContract`、`contract.ts`（§6 の 1 メソッド + 1 イベント）、`to-schema`、`emit-ts`、`emit-vb`
- 完了条件: `pnpm gen` で TS/VB が生成され、Vitest スナップショットが通り、生成された VB を含む `WebView2Bridge.Contract` が `Option Strict On` でビルドできる

### Phase 2 — フロント側ランタイムと Vite アプリ
- `packages/client` の Transport / createClient / MemoryTransport / WebView2Transport
- `apps/web`: 検索キーワードを入れて `parts.search` を呼び、結果を表にする最小 UI。イベント `progress` の受信表示
- 完了条件: ブラウザで `pnpm --filter web dev` を開き、MemoryTransport でモックの往復とイベント表示が動く。client の単体テストが通る

### Phase 3 — VB ランタイムとホスト（Windows で検証）
- `Dispatcher`（手書き側）、`WebView2Bridge.Impl` のスタブ実装、`WebView2Bridge.Host` の `WebViewBridge` と `MainForm`
- dist → wwwroot コピー
- 完了条件（Windows）: `WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173` でホストを起動し、WebView2 内で Phase 2 の UI が VB スタブと往復する。環境変数なしで起動すると `app.local` から `dist` が読まれて同じ動作をする。F12 で DevTools が開く

### Phase 4 — 切り出し
- `packages/gen` と `packages/client` を npm 公開できる形に整える
- `WebView2Bridge.Contract` のランタイム部分を `WebView2Bridge.Runtime`、Host の `WebViewBridge` を `WebView2Bridge.WinForms` として NuGet 化する
- 完了条件: `pnpm pack` した tgz と `dotnet pack` した nupkg だけを参照する別プロジェクトで、CLI 実行・client の呼び出し・生成 VB のビルド・WinForms ホストのビルドが通る（手順は RELEASING.md）
- 当初は「2 つ目のアプリで判断」としていたが、Mac と会社 Windows PC の間でこまめに同期できない前提のため、Windows 実機確認の直後に公開できるよう前倒しで準備した

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
| 0 足場 | 完了 | `pnpm install`、`dotnet build dotnet/WebView2Bridge.Contract`、`dotnet build dotnet/WebView2Bridge.sln`（Mac / Linux でビルドのみ） |
| 1 契約とジェネレータ | 完了 | `pnpm gen` / `pnpm gen:check`、Vitest（gen 18 件、スナップショット含む）、生成 VB を含む Contract のビルド |
| 2 フロント側ランタイムと Vite アプリ | 完了 | Vitest（client 19 件）、`pnpm typecheck`、`pnpm --filter web build`、dev サーバーをヘッドレス Chromium で開き MemoryTransport で検索結果・progress イベント・入力検証エラー・-32000 エラーの表示を確認 |
| 3 VB ランタイムとホスト | **完了（2026-09-06 Windows 実機確認済み）** | Windows 11 で `dotnet build dotnet/WebView2Bridge.sln`（6 プロジェクト）と `dotnet test` 16 件。`WEBVIEW2_BRIDGE_DEV_URL` で dev サーバー接続: バッジ `transport: webview2`、`m6` で VB スタブの 3 件と progress 0/50/100% を受信、`error` で `-32000 Simulated failure`（`System.InvalidOperationException`）、F12 で DevTools。環境変数なし: `https://app.local/index.html` から `wwwroot` が配信され同じく `webview2` で動作 |
| 4 切り出し | **完了。npm 3 つ（gen / client / create-webview2-bridge）を 0.3.0 で公開（2026-09-13。init / create コマンド、PlatformTarget x64 固定。0.3.1 は client のみ公開されていた、既知の注意点参照）。0.4.0（OpenAPI 出力、HttpTransport、雛形に http ファクトリ）も 2026-09-19 に公開済み。NuGet は保留** | レジストリの gen 0.2.0 / client 0.2.0 だけを入れた新規アプリで CLI が VB ランタイム込みの 10 ファイルを生成することを確認。tgz 版では NuGet を Newtonsoft.Json と Microsoft.Web.WebView2 のみでビルドできることも確認済み。手順は RELEASING.md |
| 5 自動テスト | **実装完了。0.5.0 として npm 4 つを公開、タグ v0.5.0 を push 済み（2026-09-22）。Windows 実機は未確認** | `packages/test` Vitest 45 件（sqlite の DB ヘルパ、ヘッドレス Chromium を代役にした CDP 起動 / 契約呼び出し）、`apps/web` の screen 6 件が Linux（Claude Code on the web）で通過。雛形は tgz から scaffold → install → gen:check → web typecheck → screen 4 件通過。api / host は会社 PC で `pnpm --filter web test:doctor` → `test:e2e` |

### 経緯
- 2026-09-05 に Mac ローカルの Claude Code で Phase 0〜3 のコードを作成（この版）。同日、別セッション（Claude Code on the web）でも HANDOFF.md だけの状態から同じ Phase 0〜3 を `wvbridge` 名で実装して main に入れたが、Mac 版のほうが完成度が高い（optional プロパティの `NullValueHandling.Ignore`、`Namespace Global.`、record / unknown 対応、VS デザイナ対応、LocalAppData のユーザーデータ等）ため **Mac 版を main に採用**した。wvbridge 版はブランチ `claude/progress-and-remaining-tasks-kv24ls` の履歴に残っている（参照用。今後は使わない）
- 名前は `webview2-bridge` / `WebView2Bridge.*` で確定（§10 参照）

### 次にやること
1. ~~Windows で Phase 3 の実機確認~~（2026-09-06 完了。見つかった問題は `pnpm gen:check` の改行差分のみで、修正済み）
2. ~~gen / client 0.2.0 を公開~~（2026-09-06 完了。npm 上の gen は 0.2.0 のみ、client は 0.1.0 と 0.2.0。NuGet は公開しない）
3. 以降、会社 PC は公開版を使う。修正はパッチ版を出して番号を上げる
4. 業務画面の 1 枚目を作る: 契約にメソッドを足す → `pnpm gen` → Impl に実装 → React で画面（ブラウザ単体はモックで開発、Windows で実機確認）
5. SBOM(`ishibashi0112/s-b`。この雛形から作った業務アプリ)の移行で分かった改善提案を [docs/handoff/改善提案_SBOM移行から.md](docs/handoff/改善提案_SBOM移行から.md) にまとめた(2026-10-08)。**P1 の 3 件(2026-10-08)、P2 の 4 件と P3 の 5 件(2026-10-09)をすべて対応し、まとめて 0.6.0 にした（§10 の 3 つの項を参照。0.5.2 は未公開のまま統合）**。~~Mac で `dotnet build dotnet/WebView2Bridge.sln && dotnet test dotnet/WebView2Bridge.Contract.Tests`（Contract.Tests は 19 件になる）~~（2026-10-09 に Linux で済み: 0 警告・19 件通過。雛形の Release ビルドと B-4 の配置も机上確認し、戻したときに `MyApp\wwwroot` が残る問題を直した。§10 P2 の B-4）。次は 0.6.0 の公開（RELEASING.md）→ 下の「Windows でまとめて確認する項目」 **0.6.0 は 2026-10-10 に npm 4 つとも公開済み（§10「0.6.0 の公開前整備」）。次は会社 PC で下の「Windows でまとめて確認する項目」**

### Windows でまとめて確認する項目（0.6.0。2026-10-10 時点で未実施。Linux で済んだ部分は取り消し線）
前提: 0.6.0 を公開済み（公開当日は版を明示: `pnpm create webview2-bridge@0.6.0 my-app --name MyApp`）。本体は `git pull` → `pnpm install` → `dotnet build dotnet/WebView2Bridge.sln`。
1. **本体の自動テスト**: `pnpm --filter web test:doctor` → `pnpm --filter web test:e2e`（api 5 件 + host 2 件。api に業務エラー `%` の 1 件が増えた）
2. **雛形から作ったアプリ**（以下はこのアプリで）: `pnpm install` → `pnpm gen:check` → `pnpm test`（screen 7 件）→ `dotnet build dotnet/MyApp.sln`（Debug）→ `pnpm test:all`（api 3 件 + host 1 件）
3. **B-1（Release で F12 / F5）**: `pnpm build:web` → `dotnet build dotnet/MyApp.sln -c Release` → `bin\Release\net48\MyApp.Host.exe` を起動し、F12 が開かず F5 / Ctrl+R で再読込されないこと。Debug（`dotnet run`）では効くこと。Release でも `set WEBVIEW2_BRIDGE_DEV=1` で効くこと
4. **A-3（登録漏れ）**: `MainForm.vb` の `dispatcher.Register(New CustomersApi(events))` を一時的にコメントアウトして Debug 起動 → 「登録されていないメソッド: customers.list」の MessageBox。戻す
5. **B-2（キャッシュ）**: Release exe で画面を開いたまま終了 → `main.tsx` の文言を変えて `pnpm build:web` → `dotnet build -c Release` → 起動して新しい文言が出る（DevTools 無しで）
6. **B-3（業務エラー）**: Release exe で keyword に `%` を入れて検索 → 入力欄の横に「キーワードに % は使えません」。api テスト（手順 2）でも -32010 と `field: keyword`
7. **B-4（配布の形）**: ~~`MyApp.Host.vbproj` の `<AppFilesDir>` を `MyApp\` にして `dotnet build -c Release` → `bin\Release\net48\` の直下が `MyApp.Host.exe` と `MyApp.Host.exe.config` だけで、`MyApp\` に DLL・`WebView2Loader.dll`・`wwwroot\` が入っていること。戻して（空にして）ビルドすると以前の形に戻ること~~（2026-10-10 に Linux で机上確認済み。§10 P2 の B-4）。Windows では `MyApp\` にした exe が起動し VB の 3 件が出ること、戻してビルドした exe も起動すること（`MyApp\` が消えていること。`RemoveAppFilesDirLayout`）
8. **B-5（配布スクリプト）**: 手順 7 の状態で `.\scripts\deploy.ps1 -Target <テスト用フォルダ> -SkipBuild -DryRun` → 一覧が出て何も変わらない → `-Yes` で配布 → 配布先の exe が起動する → 配布先の exe を起動したまま再実行すると「使っている人がいるため入れ替えられません」で止まる（何も変わらない）→ `-SkipBuild -Source artifacts\deploy-backup\<日時> -Yes` で戻る。`MyApp.deploy-info.txt` の内容を見る
9. **A-4（Decimal）**: 契約に `cost: z.number().meta({ format: "decimal" })` を足して `pnpm gen` → `Dto.vb` に `Public Property Cost As Decimal` → `dotnet build` が通り、VB から `12.3` を返して画面に `12.3` が出る（任意）
10. **C-2（複数ウィンドウ）**: 雛形は 1 ウィンドウなので対象外。SBOM の host テストで `waitForWindow((p) => p.url().includes("#/screens/..."))` を試す（0.6.0 を SBOM に入れたとき）
5. 新規アプリは `webview2-bridge-gen init` で始める（2026-09-13 実装、同日 gen / client 0.3.0 として npm 公開済み。雛形 `templates/myapp/` は Windows 実機で起動確認済み）。`create-webview2-bridge` 0.3.0 も同日公開し、Mac で公開版だけを使い `pnpm create webview2-bridge my-app --name MyInventory` → install → gen:check（10 files）→ web build → `dotnet build -c Release`（0 警告、win-x64 ローダー）が通ることを確認。~~次は Windows で同じ手順を一度通してから業務画面の 1 枚目へ~~（2026-09-19 完了: 会社の Windows 11 PC で公開版 0.4.0 だけを使い `pnpm create webview2-bridge@0.4.0`（対話入力で `test_webview2` / `TestWebview2`）→ `pnpm install` → `gen:check` → `pnpm dev`（`transport: memory`）→ `dotnet run`（`transport: webview2`、VB の 3 件と progress 100%）→ `pnpm build:web` → `dotnet build -c Release`（0 エラー）→ `bin\Release\net48\TestWebview2.Host.exe` 単体起動、まで通った）
6. HTTP / OpenAPI（2026-09-19、§10 参照）: gen の `openapi` 出力と client の `HttpTransport` を実装し、**0.4.0 として npm 3 つを公開済み、タグ v0.4.0 を push 済み（2026-09-19）**（版上げ、雛形に `openapi` 出力と `http` ファクトリ、雛形依存 zod 4.6.5、RELEASING 手順 2 の検証、`pnpm pack:npm` の tgz だけで scaffold → install → gen:check（11 files）→ web build → `dotnet build -c Release` が通ることを確認。公開後、`templates/myapp` で `pnpm install` して公開版 0.4.0 で gen:check と web の typecheck が通ることも確認）。注意: pnpm 11 は公開直後の版を `minimumReleaseAge` で拒むことがあり、その場合 `pnpm-workspace.yaml` に `minimumReleaseAgeExclude` が自動で追記される。雛形にはこの追記を残さない（install 後に `git checkout templates/myapp/pnpm-workspace.yaml`、`templates/myapp/pnpm-lock.yaml` は削除）。会社 PC で公開直後に `pnpm create webview2-bridge` を試す場合も同じ現象が起こりうる。VB の HttpListener ホスト（②）と他言語サーバー（③）は必要になったときに
7. 自動テスト（2026-09-22、§10 参照）: `packages/test` と雛形の `e2e/` を実装し、**0.5.0 として npm 4 つを公開、タグ v0.5.0 を push 済み（2026-09-22。`npm view` で 4 つとも `latest` が 0.5.0、公開版の tgz に `_npmrc` / `slnmix.config.json` / `e2e/` が入っていることを確認）**。**次は会社 PC で** `git pull` → `pnpm install` → `dotnet build dotnet/WebView2Bridge.sln`（Debug）→ `pnpm --filter web test:doctor` → `pnpm --filter web test:e2e`（api 4 件 + host 2 件）。その後、雛形から作った新規アプリ（当日は `pnpm create webview2-bridge@0.5.0 ...` と版を明示）で `pnpm test:all` まで確認する。DB ヘルパの SQL Server / Oracle 実機確認はテスト DB のある業務アプリで行う（`.env.e2e.local` と `db.allowedDatabases`）
8. 雛形に `.gitattributes` と `allowBuilds.oracledb: false`（2026-10-06、§10 参照）: **0.5.1 として npm 4 つを公開、タグ v0.5.1 を push 済み（2026-10-06。`npm view` で 4 つとも `latest` が 0.5.1）**。公開版だけで `pnpm dlx create-webview2-bridge@0.5.1` → `.gitattributes` と `oracledb: false` が出力される → `pnpm install`（`minimumReleaseAgeExclude` が自動追記される）→ gen:check（11 files）→ web typecheck → build:web → screen 4 件、`core.autocrlf=true` の git で commit → checkout しても生成物が LF のまま、を Linux（Claude Code on the web）で確認した。0.5.0 以前で作ったアプリ（s-b 等）には §10 のとおり `.gitattributes` と `oracledb: false` を手で足す

### Windows での確認手順（Phase 3 の完了条件。2026-09-06 に確認済み。再確認用に残す）
1. `git pull` 後、`pnpm install && pnpm gen:check && pnpm --filter web build`
2. `dotnet build dotnet/WebView2Bridge.sln`（WebView2 Runtime が入っていること。`dotnet/global.json` は .NET 8 以上の SDK を要求する）
3. dev 接続の確認: 別ターミナルで `pnpm --filter web dev` を起動し、`set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173`（PowerShell は `$env:WEBVIEW2_BRIDGE_DEV_URL="http://localhost:5173"`）を設定して `dotnet run --project dotnet/WebView2Bridge.Host`（または `dotnet/WebView2Bridge.Host/bin/Debug/net48/WebView2Bridge.Host.exe`）を起動。バッジが `transport: webview2` になり、検索で VB スタブ（`WebView2Bridge.Impl/PartsApi.vb`）の結果と progress が表示されること。keyword を `error` にすると -32000 が表示されること
4. 配布形態の確認: 環境変数なしで起動し、`https://app.local/index.html` から `wwwroot` の dist が読まれて同じ動作をすること
5. F12 で DevTools が開くこと
6. 問題が出たらエラーをそのまま Claude Code に貼って修正する（`MainForm.vb` / `WebViewBridge.vb` が疑わしい箇所の中心）

### 既知の注意点
- **pnpm 11 の `minimumReleaseAge`（既定 1440 分 = 24 時間）**: `pnpm create webview2-bridge` や `pnpm install` は、公開から 24 時間経っていない版を黙って避け、条件を満たす一番新しい版を使う。2026-09-19 に会社 PC と Mac で `pnpm create webview2-bridge`（版指定なし）を実行したところ、同日公開の 0.4.0 ではなく 0.3.0 が動き、対話入力が無い旧 usage が表示された（0.3.0 には対話入力が無い。Mac の pty で再現し、`pnpm create webview2-bridge@0.4.0` なら対話入力まで動くことを確認）。**公開当日に試すときは版を明示する**（`pnpm create webview2-bridge@0.4.0 my-app`）。翌日以降は版指定なしでよい。また、`pnpm install --config.minimum-release-age=0` で入れた直後でも、`pnpm gen:check` のような **`pnpm <script>` はスクリプト実行前のロックファイル検証（`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`）で落ちる**（2026-10-10、pnpm 11.18）。当日は `./node_modules/.bin/webview2-bridge-gen --check` のように bin を直接呼ぶか、`pnpm-workspace.yaml` に `minimumReleaseAgeExclude` を一時的に書く。版を明示した場合や、依存の版が新しい場合は pnpm が `pnpm-workspace.yaml` に `minimumReleaseAgeExclude` を自動追記する（雛形には残さない）
- **pnpm の「Choose which packages to build」プロンプト**: `pnpm create` / `pnpm dlx` の実行時に、依存の esbuild（gen → tsx → esbuild）のビルド許可を聞かれる。init は tsx / esbuild を使わないので、何も選ばず Enter で進めてよい（「All packages were added to allowBuilds with value false」と出るが問題ない）。作ったアプリ側の `pnpm install` は雛形の `pnpm-workspace.yaml` に `allowBuilds: { esbuild: true }` があるので聞かれない
- **npm 上の版の実態**（2026-09-19 に `npm view <pkg> versions` で確認）: gen は 0.2.0 / 0.3.0 / 0.4.0、create は 0.3.0 / 0.4.0、client は 0.1.0〜0.3.1 / 0.4.0。**gen と create の 0.3.1 は公開されていない**（0.3.1 の publish は client だけ成功していた。§10 の「0.3.1 公開済み」は client のみが正しい）。0.4.0 で 3 つとも揃ったので実害は無いが、公開後は 4 パッケージの `npm view <pkg> versions` を確認する（RELEASING.md 手順 3 に追記）。2026-09-22 の 0.5.0 は 4 つとも公開できた。ただし公開直後の `npm view <pkg> version`（= `dist-tags.latest`）は数分間古い版を返すことがある（create が 0.4.0 と表示された後、`versions` には 0.5.0 があり、少し待つと `latest` も 0.5.0 になった）。判定は `npm view <pkg> versions` で行い、`latest` は時間をおいて見直す
- **公開直後は tgz が数分間 404 になることがある**（2026-10-06）: gen 0.5.1 は公開（13:42:33Z）から約 5 分間、`npm view` では版が見えるのに tgz の取得が 404 で、`pnpm dlx create-webview2-bridge@0.5.1` が `ERR_PNPM_FETCH_404` で落ちた（client / create / test の tgz は先に取れていた）。404 で落ちたら数分おいて再実行する
- **雛形の `MyApp.sln` は公開 tgz では CRLF**（0.4.0〜0.5.1 で確認）: リポジトリの index は LF なので、公開に使った Mac の作業ツリーのファイルだけが CRLF で、それがそのまま同梱されていると推定（`dotnet` が CRLF で書いたファイルは、index が LF に正規化されても作業ツリーには CRLF のまま残る）。害は無い（新規アプリの最初の `git add` で `CRLF will be replaced by LF` の警告が出て、LF でコミットされる）。直すなら Mac で `rm templates/myapp/dotnet/MyApp.sln && git checkout -- templates/myapp/dotnet/MyApp.sln` を実行してから `pnpm build`（2026-10-10 に実施。0.6.0 以降の tgz は LF）
- `WebView2Bridge.Contract.Tests` は net8.0。VS 2022 17.8 以降なら .NET 8 SDK が同梱されている。無ければ sln から一時的に外す
- `package.json` の `packageManager` は pnpm 11 系。Corepack が有効なら初回にダウンロード確認が出る（Enter で続行）
- Linux で Host までビルドするには Microsoft ビルドの SDK（`Microsoft.NET.Sdk.WindowsDesktop` 同梱）が要る（Ubuntu ディストリ版には無い）。Mac の公式インストーラ版と Windows は不要
- **Claude Code on the web は環境 `webview2-bridge (.NET)` を使う（2026-10-09）**: 既定の環境では .NET SDK のダウンロードがプロキシで遮断されたため（§10 P1）、Custom ネットワークで `builds.dotnet.microsoft.com` 等を許可し、setup script で .NET SDK 8 を入れる環境を作った。この環境では `dotnet-sdk-8.0`（8.0.425、packages.microsoft.com の apt 版 = Microsoft ビルド）が `/usr/share/dotnet` に入り PATH も通っていて、`dotnet build dotnet/WebView2Bridge.sln`（Host.exe まで）、`dotnet test dotnet/WebView2Bridge.Contract.Tests`、NuGet 復元（api.nuget.org）が通る。雛形は `pnpm gen init <dir> --name X` → `dotnet build dotnet/X.sln -c Release` で確認できる（公開前の版では雛形側の `pnpm install` は通らないので、web は `web/dist/index.html` を置いて代用）。実行（WebView2）と `test:e2e` は引き続き Windows のみ
