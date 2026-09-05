import { z } from "zod";
import type { ContractShape } from "./define.js";
import type { ContractSchemaDocument } from "./schema-types.js";

export const CONTRACT_SCHEMA_TITLE = "wvbridge contract";

/**
 * zod の契約を 1 つの JSON Schema ドキュメントに変換する。
 *
 * 契約全体を 1 つの object スキーマに包んで `z.toJSONSchema()` に渡すので、
 * `.meta({ id: "Part" })` を付けたスキーマは `$defs` に一度だけ抽出され、
 * 各所から `$ref` で参照される（= VB では 1 つのクラスになる）。
 */
export function contractToJsonSchema(contract: ContractShape): ContractSchemaDocument {
  const methodShape: Record<string, z.ZodType> = {};
  for (const [ns, methods] of Object.entries(contract.methods)) {
    const nsShape: Record<string, z.ZodType> = {};
    for (const [name, def] of Object.entries(methods)) {
      nsShape[name] = z.object({ input: def.input, output: def.output });
    }
    methodShape[ns] = z.object(nsShape);
  }
  const root = z.object({
    methods: z.object(methodShape),
    events: z.object(contract.events),
  });

  const schema = z.toJSONSchema(root, {
    target: "draft-2020-12",
    unrepresentable: "throw",
    reused: "inline",
  }) as unknown as ContractSchemaDocument;

  // キー順を安定させる（スナップショットと git diff のため）: $schema, title, それ以外
  const { $schema, ...rest } = schema;
  return {
    ...($schema !== undefined ? { $schema } : {}),
    title: CONTRACT_SCHEMA_TITLE,
    ...rest,
  };
}
