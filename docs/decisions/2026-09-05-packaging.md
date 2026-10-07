# パッケージ化（Phase 4、2026-09-05）

- 日付: 2026-09-05
- 状態: 採用（NuGet の公開は翌日の判断で保留に）
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- 公開は 4 つ: npm `@ishibashi0112/webview2-bridge-gen` / `-client`、NuGet `WebView2Bridge.Runtime`（netstandard2.0）/ `WebView2Bridge.WinForms`（net48）。いずれも公開パッケージ（MIT）。手順は RELEASING.md。Mac から公開でき、会社 PC は公開版を restore するだけ
- npm は pnpm の `publishConfig` で公開時だけ `exports` / `bin` を `dist/` に向ける。workspace 内の開発では従来どおり `src/*.ts` を直接参照する（ビルド不要）。`dist/` は `tsc -p tsconfig.build.json`（NodeNext）で生成
- gen の CLI は `#!/usr/bin/env node` で動く。TypeScript の契約ファイルは `tsx/esm/api` の `tsImport` で読み込む（tsx は gen の dependency。利用側アプリに tsx を要求しない）
- **生成 Dispatcher は Partial Class をやめ、`Public Module DispatcherExtensions` の拡張メソッドにした**。`Dispatcher` が別アセンブリ（Runtime パッケージ）に移ったため Partial では結合できない。呼び出し側の書き方 `dispatcher.Register(api)` は変わらない。`MethodNames` は `DispatcherExtensions.MethodNames`
- ランタイムの名前空間は `WebView2Bridge.Runtime`（旧 `WebView2Bridge.Contract`）。生成される `Dispatcher.Generated.vb` と `Events.vb` は `Imports WebView2Bridge.Runtime` を持つ。名前空間は gen の `vb.runtimeNamespace` で変更可
- `WebViewBridge` は `WebView2Bridge.WinForms` 名前空間に移動。Host は `Imports WebView2Bridge.Runtime` と `Imports WebView2Bridge.WinForms` を追加
- NuGet のメタデータとバージョン（`WebView2BridgeVersion`）は `dotnet/Directory.Build.props` に集約。`IsPackable` は既定 false、Runtime / WinForms のみ true。XML ドキュメントを同梱
- バージョンは npm 2 つと NuGet 2 つで同じ番号を使う（0.x 系）。生成コードとランタイムの互換性は「同じマイナー版なら互換」を目安にする
- 別アプリで使うときの流れ: gen / client を npm から、Runtime を契約プロジェクトに、WinForms をホストに PackageReference。`vb.namespace` を自分の名前空間にする。この流れは tgz / nupkg のみを参照する一時プロジェクトで実際にビルド・実行して確認した
