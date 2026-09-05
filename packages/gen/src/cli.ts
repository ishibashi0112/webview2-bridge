#!/usr/bin/env tsx
/**
 * `pnpm gen`:
 *   contract/contract.ts → contract/contract.schema.json → TS（apps/web/src/generated）/ VB（dotnet/.../Generated）
 *
 * 使い方:
 *   tsx packages/gen/src/cli.ts --contract contract/contract.ts --schema-out contract/contract.schema.json \
 *       --ts-out apps/web/src/generated --vb-out dotnet/Wvbridge.Contract/Generated \
 *       [--ts-contract-import @wvbridge/contract] [--check]
 *
 * --check: 書き込まず、既存ファイルと差分があれば exit 1（CI 用）
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ContractShape } from "./define.js";
import { emitTs } from "./emit-ts.js";
import { emitVb } from "./emit-vb.js";
import { GENERATED_MARKER } from "./header.js";
import { buildContractModel } from "./model.js";
import { contractToJsonSchema } from "./to-schema.js";

interface CliArgs {
  contract: string;
  schemaOut: string;
  tsOut: string;
  vbOut: string;
  tsContractImport: string;
  check: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { tsContractImport: "@wvbridge/contract", check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--contract":
        args.contract = next();
        break;
      case "--schema-out":
        args.schemaOut = next();
        break;
      case "--ts-out":
        args.tsOut = next();
        break;
      case "--vb-out":
        args.vbOut = next();
        break;
      case "--ts-contract-import":
        args.tsContractImport = next();
        break;
      case "--check":
        args.check = true;
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  for (const k of ["contract", "schemaOut", "tsOut", "vbOut"] as const) {
    if (!args[k]) throw new Error(`--${k.replace(/([A-Z])/g, "-$1").toLowerCase()} is required`);
  }
  return args as CliArgs;
}

async function loadContract(path: string): Promise<ContractShape> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as Record<string, unknown>;
  const c = (mod["contract"] ?? mod["default"]) as ContractShape | undefined;
  if (!c || typeof c !== "object" || !("methods" in c) || !("events" in c)) {
    throw new Error(`${path} must export \`contract\` (or default) created by defineContract()`);
  }
  return c;
}

/** 生成マーカーを持つ古いファイルを削除する（手書きファイルには触らない） */
function removeStaleGenerated(dir: string, keep: Set<string>): string[] {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return removed;
  }
  for (const name of entries) {
    if (keep.has(name)) continue;
    const full = join(dir, name);
    if (!statSync(full).isFile()) continue;
    const head = readFileSync(full, "utf8").slice(0, 200);
    if (head.includes(GENERATED_MARKER)) {
      rmSync(full);
      removed.push(full);
    }
  }
  return removed;
}

function writeIfChanged(path: string, content: string, check: boolean): "unchanged" | "written" | "differs" {
  let current: string | undefined;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = undefined;
  }
  if (current === content) return "unchanged";
  if (check) return "differs";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return "written";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const contract = await loadContract(args.contract);

  const schema = contractToJsonSchema(contract);
  const model = buildContractModel(schema);
  const tsFiles = emitTs(model, { contractImport: args.tsContractImport });
  const vbFiles = emitVb(model);

  const outputs: Array<[string, string]> = [
    [args.schemaOut, `${JSON.stringify(schema, null, 2)}\n`],
    ...Object.entries(tsFiles).map(([n, c]): [string, string] => [join(args.tsOut, n), c]),
    ...Object.entries(vbFiles).map(([n, c]): [string, string] => [join(args.vbOut, n), c]),
  ];

  let differs = 0;
  for (const [path, content] of outputs) {
    const r = writeIfChanged(path, content, args.check);
    if (r === "differs") differs++;
    console.log(`${r.padEnd(9)} ${path}`);
  }
  if (!args.check) {
    for (const f of [
      ...removeStaleGenerated(args.tsOut, new Set(Object.keys(tsFiles))),
      ...removeStaleGenerated(args.vbOut, new Set(Object.keys(vbFiles))),
    ]) {
      console.log(`removed   ${f}`);
    }
  }
  const methods = model.namespaces.reduce((n, ns) => n + ns.methods.length, 0);
  console.log(
    `contract: ${model.namespaces.length} namespace(s), ${methods} method(s), ${model.events.length} event(s), ${model.dtos.length} DTO(s), ${model.enums.length} enum(s)`,
  );
  if (differs > 0) {
    console.error(`--check: ${differs} file(s) out of date. Run \`pnpm gen\`.`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
