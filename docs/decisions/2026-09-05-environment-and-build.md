# 環境・ビルド

- 日付: 2026-09-05
- 状態: 採用
- 出自: HANDOFF.md 旧 §10（2026-10-07 に 1 判断 1 ファイルへ分割。本文は当時のまま）

- Mac の .NET SDK は `dotnet-install.sh --channel 8.0` で `~/.dotnet` に導入した（sudo 不要・削除可）。`dotnet/global.json` は 8.0.100 以上を `rollForward: latestMajor` で許容するので、Windows は VS 2022 同梱の SDK でそのまま通る
- `Directory.Build.props` で Mac 上は `EnableWindowsTargeting=true` にした。結果、Contract だけでなく Impl / Host（WinForms + WebView2）も Mac で **ビルド** は通る（実行は Windows のみ）
- `dotnet/WebView2Bridge.Contract.Tests`（xUnit, **net8.0**）を追加。製品コードは netstandard2.0 / net48 のままで、テストだけ Mac で `dotnet test` するための例外
- pnpm は 11 系。`pnpm-workspace.yaml` の `allowBuilds` で esbuild のみ postinstall を許可
