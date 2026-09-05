/**
 * エミッタが読む JSON Schema の最小限の型。
 * to-schema.ts が zod から作った contract.schema.json はこの形をしている。
 * エミッタは zod の内部構造には一切依存せず、この JSON だけを読む。
 */
export interface JsonSchema {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  format?: string;
  description?: string;
  title?: string;
  additionalProperties?: unknown;
  [key: string]: unknown;
}

/**
 * contract.schema.json のルート。
 * `properties.methods.properties.<namespace>.properties.<method>.properties.{input,output}`
 * `properties.events.properties.<event>`
 * `$defs.<Name>`（`.meta({ id: "Name" })` を付けた zod スキーマ）
 */
export interface ContractSchemaDocument extends JsonSchema {
  $schema?: string;
  title?: string;
  properties: {
    methods: JsonSchema;
    events: JsonSchema;
  };
}
