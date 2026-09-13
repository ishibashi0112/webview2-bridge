#!/usr/bin/env node
/**
 * `pnpm create webview2-bridge <dir> [--name <AppName>] [--force]`
 *   = `webview2-bridge-gen init <dir> ...` の短い入口。
 * npm / pnpm の `create` は `create-<name>` パッケージを実行する規約なので、この薄いパッケージを別名で公開している。
 * 中身は @ishibashi0112/webview2-bridge-gen の scaffold を呼ぶだけ。
 */
import path from "node:path";
import { scaffold, defaultAppName } from "@ishibashi0112/webview2-bridge-gen/generate";

function usage(): never {
  console.error(`Usage: pnpm create webview2-bridge <dir> [--name <AppName>] [--force]
       npm  create webview2-bridge <dir> [--name <AppName>] [--force]

  <dir>     新規アプリを書き出すディレクトリ
  --name    アプリ名（PascalCase。VB の名前空間・プロジェクト名になる。既定: <dir> の名前から生成）
  --force   <dir> にファイルがあっても書き込む`);
  process.exit(2);
}

export async function main(argv: string[]): Promise<number> {
  let dir: string | undefined;
  let name: string | undefined;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--name") name = argv[++i] ?? usage();
    else if (a === "--force") force = true;
    else if (a === "-h" || a === "--help") usage();
    else if (a.startsWith("-")) {
      console.error(`Unknown argument: ${a}`);
      usage();
    } else if (dir === undefined) dir = a;
    else {
      console.error(`Unexpected argument: ${a}`);
      usage();
    }
  }
  if (dir === undefined) usage();

  const targetDir = path.resolve(dir);
  const appName = name ?? defaultAppName(path.basename(targetDir));
  const result = await scaffold({ targetDir, name: appName, force });
  console.log(result.files.map((f) => `wrote ${f}`).join("\n"));
  console.log(`
Created ${appName} in ${targetDir} (${result.files.length} files).

Next:
  cd ${dir}
  pnpm install        # esbuild の postinstall 許可は pnpm-workspace.yaml に設定済み
  pnpm gen:check      # 生成物が同梱版と一致することを確認（契約を変えたら pnpm gen）
  pnpm dev            # http://localhost:5173 をブラウザで開く（MemoryTransport のモック）
  # Windows: set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173 && dotnet run --project dotnet/${appName}.Host

See README.md in the new directory for the full walkthrough.`);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    // gen の GenerateError（名前不正・ディレクトリ非空）はメッセージだけ出す
    if (err instanceof Error && err.name === "GenerateError") console.error(`create-webview2-bridge: ${err.message}`);
    else console.error(err);
    process.exit(1);
  },
);
