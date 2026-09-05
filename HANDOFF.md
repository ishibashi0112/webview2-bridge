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
  contract/                    # private workspace package "@webview2-bridge/contract"
    contract.ts                # zod による契約定義（唯一の正）
    contract.schema.json       # 生成: JSON Schema 中間表現（コミットする）
  packages/
    gen/                       # ジェネレータ CLI（TS）
      src/
        define.ts              # defineContract()
        to-schema.ts           # zod → contract.schema.json
        emit-ts.ts             # → apps/web/src/generated/
        emit-vb.ts             # → dotnet/WebView2Bridge.Contract/Generated/
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
    WebView2Bridge.sln
    WebView2Bridge.slnf              # 旧プロジェクトを除外したフィルタ（将来用）
    WebView2Bridge.Contract/         # netstandard2.0 / VB / 生成 DTO・Interface・Dispatcher + ランタイム
    WebView2Bridge.Impl/             # net48 / VB / 人間が書く実装（DB・サーバー）
    WebView2Bridge.Host/             # net48 / VB / WinForms exe + WebView2
    WebView2Bridge.Contract.Tests/   # net8.0 / VB / xUnit（Dispatcher の単体テスト。Mac で dotnet test 可）
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
- `Directory.Build.props` で Mac 上は `EnableWindowsTargeting=true` にした。結果、Contract だけでなく Impl / Host（WinForms + WebView2）も Mac で **ビルド** は通る（実行は Windows のみ）
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

### Phase 4 — 切り出し（後回し）
- `packages/gen` と `packages/client` を npm 公開できる形に整える
- `WebView2Bridge.Contract` のランタイム部分を NuGet にするかは 2 つ目のアプリで判断

Mac で Claude Code を回す場合、Phase 0〜2 と Phase 3 のコード作成までは Mac で完結し、Phase 3 の実行確認だけ Windows で行う。Windows での確認結果（ビルドエラー、実行時エラー）はそのまま Claude Code に貼って修正させる。

## 13. Claude Code への最初のプロンプト（例）

```
HANDOFF.md と CLAUDE.md を読んでから始めてください。
まず Phase 0 を完了させ、完了条件を実際にコマンドで確認してから Phase 1 に進んでください。
各 Phase の終わりで、完了条件をどう確認したかを短く報告してください。
設計上の判断が必要になったら HANDOFF.md §2 の狙いに照らして決め、決めた内容を HANDOFF.md §10 に追記してください。
```
