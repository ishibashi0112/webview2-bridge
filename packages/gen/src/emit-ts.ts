import { tsHeader } from "./header.js";
import type { ContractModel } from "./model.js";
import { tsPropertyKey } from "./naming.js";

export interface EmitTsOptions {
  /** 契約モジュールの import 指定子。既定は `@wvbridge/contract` */
  contractImport?: string;
  /** 契約モジュールの export 名。既定は `contract` */
  contractExport?: string;
}

/**
 * TS 側の生成物。型は zod から `z.input` / `z.output` で直接取れるので、
 * ここでは「名前の一覧」と「メソッド名 → 型」の対応表だけを生成する。
 */
export function emitTs(model: ContractModel, options: EmitTsOptions = {}): Record<string, string> {
  const contractImport = options.contractImport ?? "@wvbridge/contract";
  const contractExport = options.contractExport ?? "contract";
  const out: string[] = [tsHeader()];
  out.push(`import type { z } from "zod";`);
  out.push(`import type { ${contractExport} } from ${JSON.stringify(contractImport)};`);
  out.push("");
  out.push(`type C = typeof ${contractExport};`);
  out.push("");

  const methods = model.namespaces.flatMap((ns) => ns.methods);

  out.push("// ---- methods ----");
  for (const m of methods) {
    const acc = `C["methods"][${JSON.stringify(m.namespace)}][${JSON.stringify(m.name)}]`;
    out.push(`export type ${m.pascalNamespace}${m.pascalName}Input = z.input<${acc}["input"]>;`);
    out.push(`export type ${m.pascalNamespace}${m.pascalName}Output = z.output<${acc}["output"]>;`);
  }
  out.push("");
  out.push("export interface MethodMap {");
  for (const m of methods) {
    const t = `${m.pascalNamespace}${m.pascalName}`;
    out.push(`  ${JSON.stringify(m.rpcMethod)}: { input: ${t}Input; output: ${t}Output };`);
  }
  out.push("}");
  out.push("export type MethodName = keyof MethodMap;");
  out.push(
    `export const methodNames = [${methods.map((m) => JSON.stringify(m.rpcMethod)).join(", ")}] as const satisfies readonly MethodName[];`,
  );
  out.push("");

  out.push("// ---- events ----");
  for (const e of model.events) {
    out.push(`export type ${e.pascalName}Event = z.output<C["events"][${JSON.stringify(e.name)}]>;`);
  }
  out.push("");
  out.push("export interface EventMap {");
  for (const e of model.events) {
    out.push(`  ${tsPropertyKey(e.name)}: ${e.pascalName}Event;`);
  }
  out.push("}");
  out.push("export type EventName = keyof EventMap;");
  out.push(
    `export const eventNames = [${model.events.map((e) => JSON.stringify(e.name)).join(", ")}] as const satisfies readonly EventName[];`,
  );
  out.push("");

  return { "contract-types.ts": out.join("\n") };
}
