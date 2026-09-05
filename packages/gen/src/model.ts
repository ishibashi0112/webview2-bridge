/**
 * JSON Schema（contract.schema.json）を、エミッタが扱いやすい中間モデルに変換する。
 * 名前付け規則（DTO クラス名の導出）はすべてここに集約する。
 *
 * 名前付け規則:
 * - `$defs` のキー（zod の `.meta({ id })`）はそのままクラス名
 * - メソッドの input / output が無名 object なら `<Namespace><Method>Request` / `<Namespace><Method>Response`
 * - イベントの payload が無名 object なら `<Event>Event`
 * - 無名 object のプロパティが object なら `<親クラス><Prop>`、配列要素の object なら `<親クラス><Prop>Item`
 * - string enum は VB では String のまま往復し、定数クラスを同じ規則の名前で生成する
 */
import { toPascalCase } from "./naming.js";
import type { ContractSchemaDocument, JsonSchema } from "./schema-types.js";

export type TypeKind = "string" | "integer" | "long" | "number" | "boolean" | "array" | "object" | "enum";

export interface TypeRef {
  kind: TypeKind;
  /** JSON で null を許すか（zod の .nullable()） */
  nullable: boolean;
  /** kind === "array" のとき要素型 */
  items?: TypeRef;
  /** kind === "object" | "enum" のときクラス名 */
  className?: string;
}

export interface PropertyModel {
  jsonName: string;
  pascalName: string;
  type: TypeRef;
  /** JSON Schema の required に含まれるか（zod の .optional() で false になる） */
  required: boolean;
}

export interface DtoClassModel {
  name: string;
  properties: PropertyModel[];
  /** `$defs` 由来（名前付き）か、経路から名付けた無名 object か */
  named: boolean;
}

export interface EnumClassModel {
  name: string;
  values: string[];
  named: boolean;
}

export interface MethodModel {
  namespace: string;
  name: string;
  /** ワイヤ上の method 名: `<namespace>.<name>` */
  rpcMethod: string;
  pascalNamespace: string;
  pascalName: string;
  input: TypeRef;
  output: TypeRef;
}

export interface NamespaceModel {
  name: string;
  pascalName: string;
  methods: MethodModel[];
}

export interface EventModel {
  name: string;
  /** ワイヤ上の method 名: `event.<name>` */
  rpcMethod: string;
  pascalName: string;
  payload: TypeRef;
}

export interface ContractModel {
  namespaces: NamespaceModel[];
  events: EventModel[];
  dtos: DtoClassModel[];
  enums: EnumClassModel[];
}

export const EVENT_METHOD_PREFIX = "event.";

export class ContractModelError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${message} (at ${path})`);
    this.name = "ContractModelError";
  }
}

const VALUE_KINDS: ReadonlySet<TypeKind> = new Set(["integer", "long", "number", "boolean"]);

export function isValueType(ref: TypeRef): boolean {
  return VALUE_KINDS.has(ref.kind);
}

interface BuildContext {
  defs: Record<string, JsonSchema>;
  dtos: Map<string, DtoClassModel>;
  enums: Map<string, EnumClassModel>;
  /** 処理中の $defs（循環参照検出用） */
  inProgress: Set<string>;
}

export function buildContractModel(doc: ContractSchemaDocument): ContractModel {
  const ctx: BuildContext = {
    defs: doc.$defs ?? {},
    dtos: new Map(),
    enums: new Map(),
    inProgress: new Set(),
  };

  // 名前付き型（$defs）を先に、キー順で処理する → 出力順が安定する
  for (const name of Object.keys(ctx.defs).sort()) {
    resolveDef(ctx, name, `$defs/${name}`);
  }

  const namespaces: NamespaceModel[] = [];
  const methodsSchema = doc.properties?.methods;
  for (const [ns, nsSchema] of Object.entries(methodsSchema?.properties ?? {})) {
    const pascalNs = toPascalCase(ns);
    const methods: MethodModel[] = [];
    for (const [name, mSchema] of Object.entries(nsSchema.properties ?? {})) {
      const pascalName = toPascalCase(name);
      const base = `methods/${ns}/${name}`;
      const inputSchema = mSchema.properties?.input;
      const outputSchema = mSchema.properties?.output;
      if (!inputSchema || !outputSchema) {
        throw new ContractModelError("method must have input and output", base);
      }
      methods.push({
        namespace: ns,
        name,
        rpcMethod: `${ns}.${name}`,
        pascalNamespace: pascalNs,
        pascalName,
        input: resolveType(ctx, inputSchema, `${pascalNs}${pascalName}Request`, `${base}/input`),
        output: resolveType(ctx, outputSchema, `${pascalNs}${pascalName}Response`, `${base}/output`),
      });
    }
    namespaces.push({ name: ns, pascalName: pascalNs, methods });
  }

  const events: EventModel[] = [];
  const eventsSchema = doc.properties?.events;
  for (const [name, eSchema] of Object.entries(eventsSchema?.properties ?? {})) {
    const pascalName = toPascalCase(name);
    events.push({
      name,
      rpcMethod: `${EVENT_METHOD_PREFIX}${name}`,
      pascalName,
      payload: resolveType(ctx, eSchema, `${pascalName}Event`, `events/${name}`),
    });
  }

  return {
    namespaces,
    events,
    dtos: [...ctx.dtos.values()],
    enums: [...ctx.enums.values()],
  };
}

function resolveDef(ctx: BuildContext, name: string, path: string): TypeRef {
  if (ctx.dtos.has(name)) return { kind: "object", className: name, nullable: false };
  if (ctx.enums.has(name)) return { kind: "enum", className: name, nullable: false };
  const schema = ctx.defs[name];
  if (!schema) throw new ContractModelError(`unknown $ref target "${name}"`, path);
  if (ctx.inProgress.has(name)) {
    throw new ContractModelError(`recursive type "${name}" is not supported`, path);
  }
  ctx.inProgress.add(name);
  try {
    const ref = resolveType(ctx, schema, name, path, /* named */ true);
    if (ref.kind !== "object" && ref.kind !== "enum") {
      throw new ContractModelError(
        `named schema "${name}" must be an object or a string enum (got ${ref.kind})`,
        path,
      );
    }
    return ref;
  } finally {
    ctx.inProgress.delete(name);
  }
}

function resolveType(ctx: BuildContext, schema: JsonSchema, nameHint: string, path: string, named = false): TypeRef {
  if (schema.$ref !== undefined) {
    const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    if (!m || m[1] === undefined) throw new ContractModelError(`unsupported $ref "${schema.$ref}"`, path);
    return resolveDef(ctx, m[1], path);
  }

  // nullable: anyOf/oneOf [X, { type: "null" }]
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) {
    const nonNull = variants.filter((v) => v.type !== "null");
    if (nonNull.length === 1 && nonNull.length < variants.length && nonNull[0]) {
      return { ...resolveType(ctx, nonNull[0], nameHint, path, named), nullable: true };
    }
    throw new ContractModelError("union types are not supported (only X | null)", path);
  }

  // nullable: type: ["string", "null"]
  let nullable = false;
  let type = schema.type;
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    nullable = nonNull.length < type.length;
    if (nonNull.length !== 1) {
      throw new ContractModelError(
        `union types are not supported (only X | null); got types ${JSON.stringify(type)}`,
        path,
      );
    }
    type = nonNull[0];
  }

  switch (type) {
    case "string": {
      if (schema.enum) {
        const values = schema.enum;
        if (!values.every((v): v is string => typeof v === "string")) {
          throw new ContractModelError("enum values must all be strings", path);
        }
        registerEnum(ctx, nameHint, values, named, path);
        return { kind: "enum", className: nameHint, nullable };
      }
      return { kind: "string", nullable };
    }
    case "integer":
      return { kind: schema.format === "int64" ? "long" : "integer", nullable };
    case "number":
      return { kind: "number", nullable };
    case "boolean":
      return { kind: "boolean", nullable };
    case "array": {
      if (!schema.items) throw new ContractModelError("array must have items", path);
      const items = resolveType(ctx, schema.items, `${nameHint}Item`, `${path}/items`);
      return { kind: "array", items, nullable };
    }
    case "object": {
      registerDto(ctx, nameHint, schema, named, path);
      return { kind: "object", className: nameHint, nullable };
    }
    default:
      throw new ContractModelError(
        `unsupported schema type ${JSON.stringify(schema.type ?? schema)} (union / unknown / record etc. are out of scope)`,
        path,
      );
  }
}

function registerEnum(ctx: BuildContext, name: string, values: string[], named: boolean, path: string): void {
  assertNameFree(ctx, name, path);
  ctx.enums.set(name, { name, values, named });
}

function registerDto(ctx: BuildContext, name: string, schema: JsonSchema, named: boolean, path: string): void {
  assertNameFree(ctx, name, path);
  // 先に登録してから中身を解決する（プロパティ名の衝突チェックのため）
  const dto: DtoClassModel = { name, properties: [], named };
  ctx.dtos.set(name, dto);

  const required = new Set(schema.required ?? []);
  const seen = new Map<string, string>();
  for (const [jsonName, propSchema] of Object.entries(schema.properties ?? {})) {
    const pascalName = toPascalCase(jsonName);
    const propPath = `${path}/${jsonName}`;
    const lower = pascalName.toLowerCase();
    const dup = seen.get(lower);
    if (dup !== undefined) {
      throw new ContractModelError(
        `properties "${dup}" and "${jsonName}" collide as "${pascalName}" (VB is case-insensitive)`,
        propPath,
      );
    }
    seen.set(lower, jsonName);
    if (lower === name.toLowerCase()) {
      throw new ContractModelError(
        `property "${jsonName}" has the same name as its class "${name}" (not allowed in VB); rename it or give the object an id`,
        propPath,
      );
    }
    dto.properties.push({
      jsonName,
      pascalName,
      type: resolveType(ctx, propSchema, `${name}${pascalName}`, propPath),
      required: required.has(jsonName),
    });
  }
}

function assertNameFree(ctx: BuildContext, name: string, path: string): void {
  if (ctx.dtos.has(name) || ctx.enums.has(name)) {
    throw new ContractModelError(
      `type name "${name}" is already used; give one of them an explicit id via .meta({ id: "..." })`,
      path,
    );
  }
}
