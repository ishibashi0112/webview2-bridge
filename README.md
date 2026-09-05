# webview2-bridge (wvbridge)

WinForms（VB.NET / .NET Framework 4.8）に WebView2 を載せ、UI を Vite + React + TypeScript で書くための薄い基盤。
設計・判断・進捗は [HANDOFF.md](./HANDOFF.md) を参照（Claude Code への引き継ぎ資料でもある）。

```
contract/                 zod による契約定義（唯一の正）と生成した contract.schema.json
packages/gen/             契約 → JSON Schema → TS 型 / VB DTO・Interface・Dispatcher を生成する CLI
packages/client/          フロント側ランタイム（Transport, WebView2Transport, MemoryTransport, createClient）
apps/web/                 Vite + React の UI（src/generated/ は生成物）
dotnet/Wvbridge.Contract  netstandard2.0 / VB / 生成コード + JSON-RPC ランタイム（WebView2 非依存）
dotnet/Wvbridge.Impl      net48 / VB / 人間が書く実装（今はスタブ）
dotnet/Wvbridge.Host      net48 / VB / WinForms + WebView2 ホスト
dotnet/Wvbridge.Contract.Tests  MSTest（net8.0）
```

## コマンド

```sh
pnpm install
pnpm gen              # contract.ts → schema → TS / VB を再生成（--check で差分検査）
pnpm test             # Vitest（gen, client）
pnpm typecheck
pnpm dev:web          # http://localhost:5173（ブラウザ単体は MemoryTransport のモックで動く）
pnpm build:web        # apps/web/dist → Host ビルド時に wwwroot へコピーされる

dotnet build dotnet/Wvbridge.Contract        # Mac / Linux でも通る
dotnet test  dotnet/Wvbridge.Contract.Tests  # Mac / Linux でも通る
dotnet build dotnet/Wvbridge.sln             # Windows（Microsoft ビルドの SDK があれば Mac / Linux でもビルドのみ可）
```

## ホストの起動（Windows）

- 開発中: `pnpm dev:web` を起動し、環境変数 `WVBRIDGE_DEV_URL=http://localhost:5173` を設定して `Wvbridge.Host.exe` を起動（Debug ビルドのみ）
- 配布形態: 環境変数なしで起動すると exe 隣の `wwwroot` が `https://app.local/` にマップされる
- F12 で DevTools
