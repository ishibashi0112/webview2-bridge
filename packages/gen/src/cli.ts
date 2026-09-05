#!/usr/bin/env -S npx tsx
import { readFile } from "node:fs/promises";
import path from "node:path";
import { generate, type GenerateConfig } from "./generate.js";
import { GenerateError } from "./schema.js";

const DEFAULT_CONFIG = "webview2-bridge.gen.json";

function usage(): never {
  console.error(`Usage: webview2-bridge-gen [--config <file>] [--cwd <dir>] [--check]

  --config  設定ファイル（既定: ./${DEFAULT_CONFIG}）
  --cwd     設定ファイル内の相対パスの基準（既定: 設定ファイルのあるディレクトリ）
  --check   書き込まず、生成物が最新かだけを確認する（差分があれば exit 1）`);
  process.exit(2);
}

async function main(argv: string[]): Promise<number> {
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
  const absConfig = path.resolve(configPath);
  const config = JSON.parse(await readFile(absConfig, "utf8")) as GenerateConfig;
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

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof GenerateError) {
      console.error(`webview2-bridge-gen: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  },
);
