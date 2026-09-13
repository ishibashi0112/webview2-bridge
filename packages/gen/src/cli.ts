#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CONFIG = "webview2-bridge.gen.json";

function usage(): never {
  console.error(`Usage:
  webview2-bridge-gen [--config <file>] [--cwd <dir>] [--check]
  webview2-bridge-gen init <dir> [--name <AppName>] [--force]

generate（既定）:
  --config  設定ファイル（既定: ./${DEFAULT_CONFIG}）
  --cwd     設定ファイル内の相対パスの基準（既定: 設定ファイルのあるディレクトリ）
  --check   書き込まず、生成物が最新かだけを確認する（差分があれば exit 1）

init: 新規アプリの骨組み（contract / web / dotnet の 3 プロジェクト）を <dir> に書き出す
  --name    アプリ名（PascalCase。VB の名前空間・プロジェクト名になる。既定: <dir> の名前から生成）
  --force   <dir> にファイルがあっても書き込む`);
  process.exit(2);
}

async function runGenerate(argv: string[]): Promise<number> {
  let configPath = DEFAULT_CONFIG;
  let cwd: string | undefined;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--config") configPath = argv[++i] ?? usage();
    else if (a === "--cwd") cwd = argv[++i] ?? usage();
    else if (a === "--check") check = true;
    else if (a === "-h" || a === "--help") usage();
    else {
      console.error(`Unknown argument: ${a}`);
      usage();
    }
  }
  // generate は tsx / zod を読み込むので、init だけのときは読み込まない
  const { generate } = await import("./generate.js");
  const absConfig = path.resolve(configPath);
  const config = JSON.parse(await readFile(absConfig, "utf8")) as import("./generate.js").GenerateConfig;
  const base = cwd ? path.resolve(cwd) : path.dirname(absConfig);

  const result = await generate(config, { cwd: base, check });
  const rel = (p: string): string => path.relative(base, p);
  if (check) {
    if (result.stale.length > 0) {
      console.error("Generated files are out of date:\n" + result.stale.map((f) => `  ${rel(f)}`).join("\n"));
      console.error("Run `pnpm gen`.");
      return 1;
    }
    console.log(`Up to date (${result.files.length} files).`);
    return 0;
  }
  console.log(result.files.map((f) => `wrote ${rel(f)}`).join("\n"));
  return 0;
}

async function runInit(argv: string[]): Promise<number> {
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

  const { scaffold, defaultAppName } = await import("./init.js");
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

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "init") return runInit(argv.slice(1));
  return runGenerate(argv);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  async (err: unknown) => {
    const { GenerateError } = await import("./schema.js");
    if (err instanceof GenerateError) {
      console.error(`webview2-bridge-gen: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  },
);
