/**
 * contract.schema.json の形（ジェネレータの中間表現）。
 * zod からここまで落とした後、エミッタは JSON Schema だけを読む。
 */

/** JSON Schema（draft 2020-12）のうち、ジェネレータが解釈する部分 */
export interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  propertyNames?: JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  format?: string;
  description?: string;
  title?: string;
  default?: unknown;
  [keyword: string]: unknown;
}

export interface MethodSchema {
  input: JsonSchema;
  output: JsonSchema;
}

export interface ContractSchema {
  $schema: string;
  /** ジェネレータの中間表現バージョン。互換性が壊れたら上げる */
  contractVersion: 1;
  /** zod の `.meta({ id })` が付いたスキーマ。`$ref: "#/$defs/<id>"` で参照される */
  $defs: Record<string, JsonSchema>;
  methods: Record<string, Record<string, MethodSchema>>;
  events: Record<string, JsonSchema>;
}

export const DEFS_PREFIX = "#/$defs/";

export function refName(ref: string): string {
  if (!ref.startsWith(DEFS_PREFIX)) {
    throw new GenerateError(`Unsupported $ref "${ref}" (only "${DEFS_PREFIX}<id>" is supported)`);
  }
  return ref.slice(DEFS_PREFIX.length);
}

/** ジェネレータが対応していない契約に出会ったときのエラー。`path` は契約内の位置 */
export class GenerateError extends Error {
  constructor(message: string, readonly path?: string) {
    super(path ? `${message} (at ${path})` : message);
    this.name = "GenerateError";
  }
}
