import type { EmittedFile } from "./emitted.js";
import { pascalCase, toIdentifier, vbEscape } from "./naming.js";
import { type ContractSchema, GenerateError, type JsonSchema, refName } from "./schema.js";

export interface EmitVbOptions {
  /** 生成物を置く名前空間（`Namespace Global.<namespace>`）。RootNamespace とは独立 */
  namespace: string;
  /** 手書き側と Partial で結合する Dispatcher クラス名 */
  dispatcherClass?: string;
  /** 型付きイベント発行ヘルパのクラス名 */
  eventsClass?: string;
  /** IBridgeEmitter の名前（手書きランタイム側の Interface） */
  emitterInterface?: string;
  /**
   * ランタイム（Dispatcher / IBridgeEmitter / IValidatable）の名前空間。NuGet パッケージ WebView2Bridge.Runtime の既定は
   * `WebView2Bridge.Runtime`。生成される Dto / Dispatcher 拡張 / Events はこれを Imports する
   */
  runtimeNamespace?: string;
}

type VbKind = "string" | "number" | "boolean" | "list" | "dictionary" | "class" | "any";

type RuleKind =
  | "minLength"
  | "maxLength"
  | "minimum"
  | "maximum"
  | "exclusiveMinimum"
  | "exclusiveMaximum"
  | "minItems"
  | "maxItems";

/** 契約の規則のうち、デシリアライズ後に Validate() で検査するもの（必須と null 可否は JsonProperty の Required で検査する） */
interface Rule {
  kind: RuleKind;
  value: number;
}

interface VbType {
  /** VB の型名（`List(Of X)` 等を含む） */
  name: string;
  isValueType: boolean;
  /** `type: [X, "null"]` 等で明示的に null 許容 */
  nullable: boolean;
  /** required かつ non-null のときに付ける初期化子（List / Dictionary） */
  initializer?: string;
  /** Validate() の生成に使う分類 */
  kind: VbKind;
  /** list の要素 / dictionary の値の型 */
  element?: VbType;
  /** string enum のとき、`Values` を持つ定数クラス名 */
  enumClass?: string;
  /** この値自身に対する規則（文字数・範囲・件数） */
  rules: Rule[];
}

interface VbProp {
  jsonName: string;
  vbName: string;
  type: VbType;
  required: boolean;
  description?: string;
}

interface VbClass {
  kind: "class";
  name: string;
  description?: string;
  props: VbProp[];
  /** 生成元の位置（衝突検出用） */
  origin: string;
}

interface VbEnum {
  kind: "enum";
  name: string;
  description?: string;
  values: string[];
  origin: string;
}

type VbDecl = VbClass | VbEnum;

interface VbMethod {
  ns: string;
  name: string;
  rpcName: string;
  vbName: string;
  request: string;
  response: string;
  description?: string;
}

interface VbEvent {
  name: string;
  rpcName: string;
  vbName: string;
  payload: string;
  description?: string;
}

/**
 * contract.schema.json → VB.NET ソース（Dto.vb / Interfaces.vb / Dispatcher.Generated.vb / Events.vb）
 */
export function emitVb(schema: ContractSchema, options: EmitVbOptions): EmittedFile[] {
  const ctx = new VbContext(schema, options);
  ctx.collect();
  return [
    { path: "Dto.vb", content: ctx.renderDto() },
    { path: "Interfaces.vb", content: ctx.renderInterfaces() },
    { path: "Dispatcher.Generated.vb", content: ctx.renderDispatcher() },
    { path: "Events.vb", content: ctx.renderEvents() },
  ];
}

class VbContext {
  private readonly decls: VbDecl[] = [];
  private readonly declByName = new Map<string, VbDecl>();
  private readonly defsInProgress = new Set<string>();
  private readonly methods: VbMethod[] = [];
  private readonly events: VbEvent[] = [];
  private readonly dispatcherClass: string;
  private readonly eventsClass: string;
  private readonly emitterInterface: string;
  private readonly runtimeNamespace: string;

  constructor(
    private readonly schema: ContractSchema,
    private readonly options: EmitVbOptions,
  ) {
    this.dispatcherClass = options.dispatcherClass ?? "Dispatcher";
    this.eventsClass = options.eventsClass ?? "BridgeEvents";
    this.emitterInterface = options.emitterInterface ?? "IBridgeEmitter";
    this.runtimeNamespace = options.runtimeNamespace ?? "WebView2Bridge.Runtime";
  }

  collect(): void {
    // $defs（.meta({ id }) 付き）を先に、契約に現れた順で
    for (const id of Object.keys(this.schema.$defs)) {
      this.ensureDef(id);
    }
    for (const [ns, methods] of Object.entries(this.schema.methods)) {
      for (const [name, m] of Object.entries(methods)) {
        const base = `${pascalCase(ns)}${pascalCase(name)}`;
        const path = `methods.${ns}.${name}`;
        const request = this.resolveNamed(m.input, `${base}Request`, `${path}.input`);
        const response = this.resolveNamed(m.output, `${base}Response`, `${path}.output`);
        this.methods.push({
          ns,
          name,
          rpcName: `${ns}.${name}`,
          vbName: pascalCase(name),
          request,
          response,
          ...(m.input.description !== undefined && { description: m.input.description }),
        });
      }
    }
    for (const [name, e] of Object.entries(this.schema.events)) {
      const payload = this.resolveNamed(e, `${pascalCase(name)}Event`, `events.${name}`);
      this.events.push({
        name,
        rpcName: `event.${name}`,
        vbName: pascalCase(name),
        payload,
        ...(e.description !== undefined && { description: e.description }),
      });
    }
  }

  /** method の input/output・event の payload は「クラスであること」を要求する（$ref 可） */
  private resolveNamed(s: JsonSchema, name: string, path: string): string {
    if (s.$ref) return this.ensureDef(refName(s.$ref));
    if (!isObjectSchema(s)) {
      throw new GenerateError(
        "Method input/output and event payload must be z.object() (or a .meta({ id }) object)",
        path,
      );
    }
    this.addClass(name, s, path);
    return name;
  }

  private ensureDef(id: string): string {
    if (toIdentifier(id) !== id) {
      throw new GenerateError(`meta id "${id}" is not a valid identifier (PascalCase, [A-Za-z0-9_])`, `$defs.${id}`);
    }
    const existing = this.declByName.get(id);
    if (existing) return id;
    if (this.defsInProgress.has(id)) return id; // 再帰参照（自己参照クラス）
    const def = this.schema.$defs[id];
    if (!def) throw new GenerateError(`Unknown $ref target "${id}"`, `$defs.${id}`);
    this.defsInProgress.add(id);
    try {
      const path = `$defs.${id}`;
      if (isStringEnum(def)) {
        this.addEnum(id, def, path);
      } else if (isObjectSchema(def)) {
        this.addClass(id, def, path);
      } else {
        throw new GenerateError(`meta id "${id}" must be attached to z.object() or z.enum()`, path);
      }
    } finally {
      this.defsInProgress.delete(id);
    }
    return id;
  }

  private register(decl: VbDecl): void {
    const prev = this.declByName.get(decl.name);
    if (prev) {
      throw new GenerateError(
        `Generated type name "${decl.name}" collides (${prev.origin} vs ${decl.origin}). Use .meta({ id }) to name one of them`,
        decl.origin,
      );
    }
    this.declByName.set(decl.name, decl);
    this.decls.push(decl);
  }

  private addClass(name: string, s: JsonSchema, path: string): void {
    const cls: VbClass = {
      kind: "class",
      name,
      props: [],
      origin: path,
      ...(s.description !== undefined && { description: s.description }),
    };
    this.register(cls);
    const required = new Set(s.required ?? []);
    for (const [jsonName, ps] of Object.entries(s.properties ?? {})) {
      const propPath = `${path}.${jsonName}`;
      const vbName = toIdentifier(jsonName);
      if (vbName === name) {
        throw new GenerateError(`Property "${jsonName}" would have the same name as its class "${name}"`, propPath);
      }
      const type = this.resolveType(ps, name, jsonName, propPath);
      cls.props.push({
        jsonName,
        vbName,
        type,
        required: required.has(jsonName),
        ...(ps.description !== undefined && { description: ps.description }),
      });
    }
    const seen = new Set<string>();
    for (const p of cls.props) {
      const key = p.vbName.toLowerCase();
      if (seen.has(key)) {
        throw new GenerateError(`Properties collide in VB (case-insensitive): "${p.vbName}"`, `${path}.${p.jsonName}`);
      }
      seen.add(key);
    }
  }

  private addEnum(name: string, s: JsonSchema, path: string): void {
    const values = (s.enum ?? []).filter((v): v is string => typeof v === "string");
    this.register({
      kind: "enum",
      name,
      values,
      origin: path,
      ...(s.description !== undefined && { description: s.description }),
    });
  }

  /** プロパティ・配列要素・record 値の型を解決する。無名 object / enum はここで名前を与えて登録する */
  private resolveType(s: JsonSchema, owner: string, prop: string, path: string): VbType {
    if (s.$ref) {
      const id = this.ensureDef(refName(s.$ref));
      // 名前付き enum（z.enum().meta({ id })）は Const クラスを生成しつつ、型は String のまま
      const decl = this.declByName.get(id);
      if (decl?.kind === "enum") {
        return { name: "String", isValueType: false, nullable: false, kind: "string", enumClass: id, rules: [] };
      }
      return { name: id, isValueType: false, nullable: false, kind: "class", rules: [] };
    }

    const { types, nullable, inner } = unwrapNullable(s, path);
    if (inner) {
      const t = this.resolveType(inner, owner, prop, path);
      // null 許容になったので初期化子は付けない（Nothing のまま送れるように）
      const { initializer: _dropped, ...rest } = t;
      return { ...rest, nullable: t.nullable || nullable };
    }

    if (types.length === 0) {
      if (s.enum) {
        return this.enumType(s, owner, prop, path, nullable);
      }
      if (isAnySchema(s)) {
        return { name: "JToken", isValueType: false, nullable, kind: "any", rules: [] };
      }
      throw new GenerateError(`Unsupported schema ${describe(s)}`, path);
    }
    if (types.length > 1) {
      throw new GenerateError(`Union types are not supported: [${types.join(", ")}]`, path);
    }
    const type = types[0]!;
    switch (type) {
      case "string":
        if (s.enum) return this.enumType(s, owner, prop, path, nullable);
        return {
          name: "String",
          isValueType: false,
          nullable,
          kind: "string",
          rules: rulesOf(s, ["minLength", "maxLength"]),
        };
      case "number":
        return { name: "Double", isValueType: true, nullable, kind: "number", rules: numberRules(s) };
      case "integer":
        return {
          name: s.format === "int64" ? "Long" : "Integer",
          isValueType: true,
          nullable,
          kind: "number",
          rules: numberRules(s),
        };
      case "boolean":
        return { name: "Boolean", isValueType: true, nullable, kind: "boolean", rules: [] };
      case "array": {
        const itemName = singularize(prop);
        const item = this.resolveType(s.items ?? {}, owner, itemName, `${path}[]`);
        const name = `List(Of ${item.name})`;
        return {
          name,
          isValueType: false,
          nullable,
          initializer: `New ${name}()`,
          kind: "list",
          element: item,
          rules: rulesOf(s, ["minItems", "maxItems"]),
        };
      }
      case "object": {
        if (s.properties && Object.keys(s.properties).length > 0) {
          const name = `${owner}${toIdentifier(prop)}`;
          this.addClass(name, s, path);
          return { name, isValueType: false, nullable, kind: "class", rules: [] };
        }
        if (typeof s.additionalProperties === "object") {
          const value = this.resolveType(s.additionalProperties, owner, `${prop}Value`, `${path}.*`);
          const name = `Dictionary(Of String, ${value.name})`;
          return {
            name,
            isValueType: false,
            nullable,
            initializer: `New ${name}()`,
            kind: "dictionary",
            element: value,
            rules: [],
          };
        }
        if (s.properties && Object.keys(s.properties).length === 0 && s.additionalProperties === false) {
          const name = `${owner}${toIdentifier(prop)}`;
          this.addClass(name, s, path);
          return { name, isValueType: false, nullable, kind: "class", rules: [] };
        }
        return { name: "JObject", isValueType: false, nullable, kind: "any", rules: [] };
      }
      case "null":
        throw new GenerateError("z.null() alone is not supported", path);
      default:
        throw new GenerateError(`Unsupported JSON Schema type "${type}"`, path);
    }
  }

  private enumType(s: JsonSchema, owner: string, prop: string, path: string, nullable: boolean): VbType {
    const values = s.enum ?? [];
    const hasNull = values.includes(null);
    const strings = values.filter((v) => v !== null);
    if (!strings.every((v) => typeof v === "string")) {
      throw new GenerateError("Only string enums are supported (z.enum([...]))", path);
    }
    const name = `${owner}${toIdentifier(prop)}`;
    this.addEnum(name, { ...s, enum: strings }, path);
    return {
      name: "String",
      isValueType: false,
      nullable: nullable || hasNull,
      kind: "string",
      enumClass: name,
      rules: [],
    };
  }

  // ---------------------------------------------------------------- render

  private header(...imports: string[]): string {
    return [
      "' <auto-generated>",
      "'     This code was generated by @ishibashi0112/webview2-bridge-gen from contract.schema.json.",
      "'     DO NOT EDIT. Changes will be lost when `pnpm gen` runs.",
      "' </auto-generated>",
      "Option Strict On",
      "Option Explicit On",
      "Option Infer On",
      "",
      "Imports System",
      ...imports.map((i) => `Imports ${i}`),
    ].join("\n");
  }

  renderDto(): string {
    const out: string[] = [];
    out.push(this.header());
    out.push("Imports System.Collections.Generic");
    out.push("Imports Newtonsoft.Json");
    out.push("Imports Newtonsoft.Json.Linq");
    out.push(`Imports ${this.runtimeNamespace}`);
    out.push("");
    out.push(`Namespace Global.${this.options.namespace}`);
    out.push("");
    for (const decl of this.decls) {
      out.push(decl.kind === "class" ? this.renderClass(decl) : this.renderEnum(decl));
      out.push("");
    }
    out.push("End Namespace");
    return `${out.join("\n")}\n`;
  }

  private renderClass(cls: VbClass): string {
    const lines: string[] = [];
    lines.push(...xmlDoc(cls.description, 4));
    lines.push(`    Public Class ${cls.name}`);
    lines.push("        Implements IValidatable");
    for (const p of cls.props) {
      lines.push("");
      lines.push(...xmlDoc(p.description, 8));
      const attrArgs = [vbString(p.jsonName)];
      // optional（required でない）プロパティは Nothing のとき JSON から省く。
      // Web 側の zod `.optional()` は null を受け付けないため。
      if (!p.required) attrArgs.push("NullValueHandling:=NullValueHandling.Ignore");
      // 必須と null 可否は Newtonsoft の Required で、デシリアライズ時に検査する（違反は -32602）。
      // 直列化時に必須の参照型が Nothing だと JsonSerializationException になる（契約に合わない応答を出さない）
      const required = requiredMode(p);
      if (required) attrArgs.push(`Required:=Required.${required}`);
      lines.push(`        <JsonProperty(${attrArgs.join(", ")})>`);
      const typeName = isNullableValue(p) ? `Nullable(Of ${p.type.name})` : p.type.name;
      const init = p.required && !p.type.nullable && p.type.initializer ? ` = ${p.type.initializer}` : "";
      lines.push(`        Public Property ${vbEscape(p.vbName)} As ${typeName}${init}`);
    }
    lines.push(...this.renderValidate(cls));
    lines.push("    End Class");
    return lines.join("\n");
  }

  /** 契約の規則（文字数・範囲・列挙・件数・入れ子）を検査する Validate()。必須と null 可否は Required で済んでいる */
  private renderValidate(cls: VbClass): string[] {
    const body: string[] = [];
    for (const p of cls.props) {
      body.push(
        ...this.checks(vbEscape(p.vbName), `prefix & ${vbString(p.jsonName)}`, p.type, isNullableValue(p), 12, 0),
      );
    }
    const lines = [
      "",
      "        ''' <summary>契約の規則（文字数・範囲・列挙・件数・入れ子）を検査し、違反を issues に積む。必須と null 可否は JsonProperty の Required で検査済み</summary>",
      "        Public Sub Validate(path As String, issues As IList(Of String)) Implements IValidatable.Validate",
    ];
    if (body.length > 0) {
      lines.push('            Dim prefix As String = If(String.IsNullOrEmpty(path), String.Empty, path & ".")');
      lines.push(...body);
    }
    lines.push("        End Sub");
    return lines;
  }

  /**
   * 1 つの値に対する検査コード。`expr` は値の VB 式、`pathExpr` は違反メッセージに付ける位置の VB 式。
   * 参照型は `IsNot Nothing`、Nullable の値型は `.HasValue` の中で検査する
   */
  private checks(
    expr: string,
    pathExpr: string,
    t: VbType,
    nullableValue: boolean,
    indent: number,
    depth: number,
  ): string[] {
    const pad = " ".repeat(indent);
    const add = (cond: string, message: string): string =>
      `${pad}    If ${cond} Then issues.Add(${pathExpr} & ": " & ${message})`;
    const inner: string[] = [];
    const v = t.isValueType && nullableValue ? `${expr}.Value` : expr;
    switch (t.kind) {
      case "string":
        for (const r of t.rules) {
          if (r.kind === "minLength") inner.push(add(`${v}.Length < ${r.value}`, vbString(`${r.value} 文字以上`)));
          if (r.kind === "maxLength") inner.push(add(`${v}.Length > ${r.value}`, vbString(`${r.value} 文字以下`)));
        }
        if (t.enumClass) {
          inner.push(
            add(
              `Array.IndexOf(${t.enumClass}.Values, ${v}) < 0`,
              `"次のいずれか: " & String.Join(" / ", ${t.enumClass}.Values)`,
            ),
          );
        }
        break;
      case "number":
        for (const r of t.rules) {
          if (r.kind === "minimum") inner.push(add(`${v} < ${vbNumber(r.value)}`, vbString(`${r.value} 以上`)));
          if (r.kind === "exclusiveMinimum")
            inner.push(add(`${v} <= ${vbNumber(r.value)}`, vbString(`${r.value} より大きい`)));
          if (r.kind === "maximum") inner.push(add(`${v} > ${vbNumber(r.value)}`, vbString(`${r.value} 以下`)));
          if (r.kind === "exclusiveMaximum")
            inner.push(add(`${v} >= ${vbNumber(r.value)}`, vbString(`${r.value} 未満`)));
        }
        break;
      case "list": {
        for (const r of t.rules) {
          if (r.kind === "minItems") inner.push(add(`${v}.Count < ${r.value}`, vbString(`${r.value} 件以上`)));
          if (r.kind === "maxItems") inner.push(add(`${v}.Count > ${r.value}`, vbString(`${r.value} 件以下`)));
        }
        const i = `i${depth}`;
        const elementChecks = t.element
          ? this.checks(
              `${v}(${i})`,
              `${pathExpr} & "[" & ${i}.ToString() & "]"`,
              t.element,
              false,
              indent + 8,
              depth + 1,
            )
          : [];
        if (elementChecks.length > 0) {
          inner.push(`${pad}    For ${i} As Integer = 0 To ${v}.Count - 1`, ...elementChecks, `${pad}    Next`);
        }
        break;
      }
      case "dictionary": {
        const kv = `kv${depth}`;
        const valueChecks = t.element
          ? this.checks(`${kv}.Value`, `${pathExpr} & "." & ${kv}.Key`, t.element, false, indent + 8, depth + 1)
          : [];
        if (valueChecks.length > 0) {
          inner.push(`${pad}    For Each ${kv} In ${v}`, ...valueChecks, `${pad}    Next`);
        }
        break;
      }
      case "class":
        inner.push(`${pad}    ${v}.Validate(${pathExpr}, issues)`);
        break;
      default:
        break;
    }
    if (inner.length === 0) return [];
    const guard = t.isValueType ? (nullableValue ? `${expr}.HasValue` : undefined) : `${expr} IsNot Nothing`;
    if (guard === undefined) return inner.map((l) => l.slice(4));
    return [`${pad}If ${guard} Then`, ...inner, `${pad}End If`];
  }

  private renderEnum(e: VbEnum): string {
    const lines: string[] = [];
    lines.push(...xmlDoc(e.description, 4));
    lines.push("    ''' <remarks>string enum. 値は文字列のまま往復する（VB の Enum にはしない）</remarks>");
    lines.push(`    Public NotInheritable Class ${e.name}`);
    lines.push("        Private Sub New()");
    lines.push("        End Sub");
    lines.push("");
    const used = new Set<string>();
    for (const v of e.values) {
      let id = toIdentifier(v);
      while (used.has(id.toLowerCase())) id = `${id}_`;
      used.add(id.toLowerCase());
      lines.push(`        Public Const ${vbEscape(id)} As String = ${vbString(v)}`);
    }
    lines.push("");
    lines.push(`        Public Shared ReadOnly Values As String() = {${e.values.map(vbString).join(", ")}}`);
    lines.push("    End Class");
    return lines.join("\n");
  }

  renderInterfaces(): string {
    const out: string[] = [];
    out.push(this.header());
    out.push("Imports System.Threading.Tasks");
    out.push("");
    out.push(`Namespace Global.${this.options.namespace}`);
    out.push("");
    for (const ns of this.namespaces()) {
      out.push(
        `    ''' <summary>"${ns}.*" メソッドの実装。人間が Implements して WebView2Bridge.Impl に置く</summary>`,
      );
      out.push(`    Public Interface ${interfaceName(ns)}`);
      const ms = this.methods.filter((m) => m.ns === ns);
      ms.forEach((m, i) => {
        if (i > 0) out.push("");
        out.push(...xmlDoc(m.description ?? `JSON-RPC method "${m.rpcName}"`, 8));
        out.push(`        Function ${vbEscape(m.vbName)}(req As ${m.request}) As Task(Of ${m.response})`);
      });
      out.push("    End Interface");
      out.push("");
    }
    out.push("End Namespace");
    return `${out.join("\n")}\n`;
  }

  renderDispatcher(): string {
    const out: string[] = [];
    // Dispatcher は WebView2Bridge.Runtime（別アセンブリ）にあるので Partial Class では拡張できない。
    // 拡張メソッド `dispatcher.Register(api)` として生成する
    out.push(this.header("System.Runtime.CompilerServices", this.runtimeNamespace));
    out.push("");
    out.push(`Namespace Global.${this.options.namespace}`);
    out.push("");
    out.push(
      `    ''' <summary>契約の実装を ${this.dispatcherClass} に登録する拡張メソッド。dispatcher.Register(api) と書ける</summary>`,
    );
    out.push(`    Public Module ${this.dispatcherClass}Extensions`);
    out.push("");
    out.push("        ''' <summary>契約に含まれる全メソッド名</summary>");
    out.push(
      `        Public ReadOnly MethodNames As String() = {${this.methods.map((m) => vbString(m.rpcName)).join(", ")}}`,
    );
    for (const ns of this.namespaces()) {
      out.push("");
      out.push(`        ''' <summary>"${ns}.*" の実装を登録する</summary>`);
      out.push("        <Extension>");
      out.push(`        Public Sub Register(dispatcher As ${this.dispatcherClass}, api As ${interfaceName(ns)})`);
      out.push("            If dispatcher Is Nothing Then Throw New ArgumentNullException(NameOf(dispatcher))");
      out.push("            If api Is Nothing Then Throw New ArgumentNullException(NameOf(api))");
      for (const m of this.methods.filter((x) => x.ns === ns)) {
        out.push(
          `            dispatcher.RegisterHandler(Of ${m.request}, ${m.response})(${vbString(m.rpcName)}, AddressOf api.${vbEscape(m.vbName)})`,
        );
      }
      out.push("        End Sub");
    }
    out.push("    End Module");
    out.push("");
    out.push("End Namespace");
    return `${out.join("\n")}\n`;
  }

  renderEvents(): string {
    const out: string[] = [];
    out.push(this.header(this.runtimeNamespace));
    out.push("");
    out.push(`Namespace Global.${this.options.namespace}`);
    out.push("");
    out.push(
      `    ''' <summary>Host → Web の型付きイベント発行ヘルパ。内部で ${this.emitterInterface}.Emit("event.&lt;name&gt;", payload) を呼ぶ</summary>`,
    );
    out.push(`    Public Class ${this.eventsClass}`);
    out.push(`        Private ReadOnly _emitter As ${this.emitterInterface}`);
    out.push("");
    out.push(`        Public Sub New(emitter As ${this.emitterInterface})`);
    out.push("            If emitter Is Nothing Then Throw New ArgumentNullException(NameOf(emitter))");
    out.push("            _emitter = emitter");
    out.push("        End Sub");
    out.push("");
    out.push("        ''' <summary>契約に含まれる全イベント名</summary>");
    out.push(
      `        Public Shared ReadOnly EventNames As String() = {${this.events.map((e) => vbString(e.rpcName)).join(", ")}}`,
    );
    for (const e of this.events) {
      out.push("");
      out.push(...xmlDoc(e.description ?? `JSON-RPC notification "${e.rpcName}"`, 8));
      out.push(`        Public Sub ${vbEscape(e.vbName)}(payload As ${e.payload})`);
      out.push(`            _emitter.Emit(${vbString(e.rpcName)}, payload)`);
      out.push("        End Sub");
    }
    out.push("    End Class");
    out.push("");
    out.push("End Namespace");
    return `${out.join("\n")}\n`;
  }

  private namespaces(): string[] {
    return [...new Set(this.methods.map((m) => m.ns))];
  }
}

// ------------------------------------------------------------------ helpers

function interfaceName(ns: string): string {
  return `I${pascalCase(ns)}Api`;
}

/** 値型のプロパティを `Nullable(Of T)` にするか（optional または null 許容） */
function isNullableValue(p: VbProp): boolean {
  return p.type.isValueType && (!p.required || p.type.nullable);
}

/**
 * JsonProperty の Required。zod の規則をデシリアライズ時に写す:
 * 必須 → Always（無いか null なら -32602）、必須で null 可 → AllowNull、任意 → DisallowNull（`.optional()` は null を拒む）、
 * 任意で null 可 → 既定。`z.unknown()`（JToken）は zod が実行時に欠落を許すので付けない
 */
function requiredMode(p: VbProp): "Always" | "AllowNull" | "DisallowNull" | undefined {
  if (p.type.kind === "any") return undefined;
  if (p.required) return p.type.nullable ? "AllowNull" : "Always";
  return p.type.nullable ? undefined : "DisallowNull";
}

function rulesOf(s: JsonSchema, kinds: RuleKind[]): Rule[] {
  const out: Rule[] = [];
  for (const kind of kinds) {
    const value = s[kind];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    // zod 4 の .int() は minimum / maximum に ±Number.MAX_SAFE_INTEGER を書く。契約の意図ではないので検査しない
    if ((kind === "minimum" || kind === "maximum") && Math.abs(value) === Number.MAX_SAFE_INTEGER) continue;
    out.push({ kind, value });
  }
  return out;
}

function numberRules(s: JsonSchema): Rule[] {
  return rulesOf(s, ["minimum", "exclusiveMinimum", "maximum", "exclusiveMaximum"]);
}

/** VB の数値リテラル。整数はそのまま、小数は Double リテラル（Option Strict でも Integer / Double との比較は widening） */
function vbNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return `${n}R`;
}

function isObjectSchema(s: JsonSchema): boolean {
  const t = Array.isArray(s.type) ? s.type.filter((x) => x !== "null") : s.type ? [s.type] : [];
  return t.length === 1 && t[0] === "object" && typeof s.additionalProperties !== "object";
}

function isStringEnum(s: JsonSchema): boolean {
  return Array.isArray(s.enum) && s.enum.every((v) => typeof v === "string");
}

const NON_TYPE_KEYWORDS = new Set(["description", "title", "$schema", "$id", "$comment", "default", "examples"]);

function isAnySchema(s: JsonSchema): boolean {
  return Object.keys(s).every((k) => NON_TYPE_KEYWORDS.has(k));
}

/**
 * `type: [X, "null"]` と `anyOf: [X, {type:"null"}]` を「null 許容の X」に正規化する。
 * `inner` が返ったら、それを再帰的に解決する。
 */
function unwrapNullable(s: JsonSchema, path: string): { types: string[]; nullable: boolean; inner?: JsonSchema } {
  const union = s.anyOf ?? s.oneOf;
  if (union) {
    const nonNull = union.filter((u) => u.type !== "null");
    if (nonNull.length === union.length) {
      throw new GenerateError("Union types (z.union / discriminatedUnion) are not supported", path);
    }
    if (nonNull.length !== 1) {
      throw new GenerateError("Union types (z.union / discriminatedUnion) are not supported", path);
    }
    return { types: [], nullable: true, inner: nonNull[0]! };
  }
  if (s.allOf) throw new GenerateError("z.intersection / allOf is not supported", path);
  const raw = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
  const nullable = raw.includes("null");
  return { types: raw.filter((t) => t !== "null"), nullable };
}

/** items → Item のような単純な単数化。それ以外は "Item" を付ける */
function singularize(prop: string): string {
  const p = toIdentifier(prop);
  if (/children$/i.test(p)) return p.replace(/children$/i, "Child");
  if (/ies$/i.test(p)) return p.replace(/ies$/i, "y");
  if (/[^s]s$/i.test(p)) return p.slice(0, -1);
  return `${p}Item`;
}

function vbString(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function xmlDoc(text: string | undefined, indent: number): string[] {
  if (!text) return [];
  const pad = " ".repeat(indent);
  const lines = text.split(/\r?\n/);
  if (lines.length === 1) return [`${pad}''' <summary>${escapeXml(lines[0]!)}</summary>`];
  return [`${pad}''' <summary>`, ...lines.map((l) => `${pad}''' ${escapeXml(l)}`), `${pad}''' </summary>`];
}

function describe(s: JsonSchema): string {
  return JSON.stringify(s).slice(0, 120);
}
