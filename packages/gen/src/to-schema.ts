import { z } from "zod";
import type { ContractDef } from "./define.js";
import { GenerateError, type ContractSchema, type JsonSchema } from "./schema.js";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * zod 契約 → contract.schema.json。
 * 契約全体を 1 つの zod object に包んでから `z.toJSONSchema()` を 1 回だけ呼ぶ。
 * こうすると `.meta({ id })` の付いたスキーマがルートの `$defs` に 1 回だけ集約され、
 * 各所からは `#/$defs/<id>` で参照される。
 */
export function toSchema(contract: ContractDef): ContractSchema {
  validateNames(contract);

  const methodsShape: Record<string, z.ZodObject> = {};
  for (const [ns, methods] of Object.entries(contract.methods)) {
    const nsShape: Record<string, z.ZodObject> = {};
    for (const [name, def] of Object.entries(methods)) {
      nsShape[name] = z.object({ input: def.input, output: def.output });
    }
    methodsShape[ns] = z.object(nsShape);
  }
  const root = z.object({
    methods: z.object(methodsShape),
    events: z.object(contract.events),
  });

  const raw = z.toJSONSchema(root, {
    target: "draft-2020-12",
    io: "output",
    unrepresentable: "throw",
  }) as JsonSchema;

  const rootProps = raw.properties ?? {};
  const methodsNode = rootProps["methods"]?.properties ?? {};
  const eventsNode = rootProps["events"]?.properties ?? {};

  const methods: ContractSchema["methods"] = {};
  for (const ns of Object.keys(contract.methods)) {
    const nsNode = methodsNode[ns]?.properties ?? {};
    methods[ns] = {};
    for (const name of Object.keys(contract.methods[ns]!)) {
      const m = nsNode[name]?.properties;
      if (!m?.["input"] || !m["output"]) {
        throw new GenerateError("Failed to extract method schema", `methods.${ns}.${name}`);
      }
      methods[ns]![name] = { input: m["input"], output: m["output"] };
    }
  }
  const events: ContractSchema["events"] = {};
  for (const name of Object.keys(contract.events)) {
    const e = eventsNode[name];
    if (!e) throw new GenerateError("Failed to extract event schema", `events.${name}`);
    events[name] = e;
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    contractVersion: 1,
    $defs: (raw["$defs"] as Record<string, JsonSchema> | undefined) ?? {},
    methods,
    events,
  };
}

function validateNames(contract: ContractDef): void {
  for (const [ns, methods] of Object.entries(contract.methods)) {
    if (!IDENT.test(ns)) throw new GenerateError(`Invalid namespace name "${ns}"`, `methods.${ns}`);
    if (ns === "event") throw new GenerateError(`Namespace "event" is reserved for events`, `methods.${ns}`);
    for (const name of Object.keys(methods)) {
      if (!IDENT.test(name)) throw new GenerateError(`Invalid method name "${name}"`, `methods.${ns}.${name}`);
    }
  }
  for (const name of Object.keys(contract.events)) {
    if (!IDENT.test(name)) throw new GenerateError(`Invalid event name "${name}"`, `events.${name}`);
  }
}
