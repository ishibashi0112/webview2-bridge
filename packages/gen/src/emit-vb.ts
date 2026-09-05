import { vbHeader } from "./header.js";
import { isValueType, type ContractModel, type TypeRef } from "./model.js";
import { escapeVbIdentifier, toPascalCase } from "./naming.js";

/**
 * JSON Schema → VB.NET の型マッピング（HANDOFF.md §7.2）。
 * optional / nullable な値型は Nullable(Of T)。参照型はそのまま。
 */
export function vbTypeName(ref: TypeRef, required = true): string {
  const base = vbBaseTypeName(ref);
  if (isValueType(ref) && (ref.nullable || !required)) return `Nullable(Of ${base})`;
  return base;
}

function vbBaseTypeName(ref: TypeRef): string {
  switch (ref.kind) {
    case "string":
    case "enum":
      return "String";
    case "integer":
      return "Integer";
    case "long":
      return "Long";
    case "number":
      return "Double";
    case "boolean":
      return "Boolean";
    case "array":
      if (!ref.items) throw new Error("array TypeRef without items");
      return `List(Of ${vbTypeName(ref.items)})`;
    case "object":
      if (!ref.className) throw new Error("object TypeRef without className");
      return ref.className;
  }
}

export interface EmitVbOptions {
  /** Dispatcher / Events の生成先クラス名。既定は Dispatcher / BridgeEvents */
  dispatcherClass?: string;
  eventsClass?: string;
}

/**
 * VB 側の生成物（4 ファイル）。Namespace ブロックは書かず、プロジェクトの RootNamespace
 * （Wvbridge.Contract）に入れる。
 */
export function emitVb(model: ContractModel, options: EmitVbOptions = {}): Record<string, string> {
  const dispatcherClass = options.dispatcherClass ?? "Dispatcher";
  const eventsClass = options.eventsClass ?? "BridgeEvents";
  return {
    "Dto.vb": emitDto(model),
    "Interfaces.vb": emitInterfaces(model),
    "Dispatcher.Generated.vb": emitDispatcher(model, dispatcherClass),
    "Events.vb": emitEvents(model, eventsClass),
  };
}

function emitDto(model: ContractModel): string {
  const out: string[] = [vbHeader()];
  out.push("Imports System.Collections.Generic");
  out.push("Imports Newtonsoft.Json");
  out.push("");

  for (const dto of model.dtos) {
    out.push(`''' <summary>${dto.named ? "契約で名前付けされた" : "経路から名付けられた"} DTO。</summary>`);
    out.push(`Public Class ${dto.name}`);
    for (const p of dto.properties) {
      out.push(`    <JsonProperty(${vbString(p.jsonName)})>`);
      out.push(`    Public Property ${escapeVbIdentifier(p.pascalName)} As ${vbTypeName(p.type, p.required)}`);
      out.push("");
    }
    if (dto.properties.length > 0) out.pop();
    out.push("End Class");
    out.push("");
  }

  for (const e of model.enums) {
    out.push("''' <summary>string enum の値。VB では String のまま往復し、この定数で比較する。</summary>");
    out.push(`Public NotInheritable Class ${e.name}`);
    out.push("    Private Sub New()");
    out.push("    End Sub");
    const seen = new Set<string>();
    for (const v of e.values) {
      let constName = toPascalCase(v);
      if (constName.length === 0) constName = "Empty";
      if (seen.has(constName.toLowerCase())) {
        throw new Error(`enum "${e.name}": values collide as constant "${constName}"`);
      }
      seen.add(constName.toLowerCase());
      out.push(`    Public Const ${escapeVbIdentifier(constName)} As String = ${vbString(v)}`);
    }
    out.push(`    Public Shared ReadOnly All As String() = {${e.values.map(vbString).join(", ")}}`);
    out.push("End Class");
    out.push("");
  }
  return out.join("\n");
}

function emitInterfaces(model: ContractModel): string {
  const out: string[] = [vbHeader()];
  out.push("Imports System.Collections.Generic");
  out.push("Imports System.Threading.Tasks");
  out.push("");
  for (const ns of model.namespaces) {
    out.push(`''' <summary>\`${ns.name}.*\` の実装が Implements する Interface。</summary>`);
    out.push(`Public Interface ${interfaceName(ns.pascalName)}`);
    for (const m of ns.methods) {
      out.push(`    ''' <summary>JSON-RPC method \`${m.rpcMethod}\`</summary>`);
      out.push(
        `    Function ${escapeVbIdentifier(m.pascalName)}(request As ${vbTypeName(m.input)}) As Task(Of ${vbTypeName(m.output)})`,
      );
    }
    out.push("End Interface");
    out.push("");
  }
  return out.join("\n");
}

function emitDispatcher(model: ContractModel, dispatcherClass: string): string {
  const out: string[] = [vbHeader()];
  out.push("Imports System.Threading.Tasks");
  out.push("Imports Newtonsoft.Json.Linq");
  out.push("");
  out.push(`Partial Public Class ${dispatcherClass}`);
  for (const ns of model.namespaces) {
    const field = fieldName(ns.pascalName);
    const iface = interfaceName(ns.pascalName);
    out.push(`    Private ${field} As ${iface}`);
    out.push("");
    out.push(`    ''' <summary>\`${ns.name}.*\` の実装を登録する。</summary>`);
    out.push(`    Public Sub Register(api As ${iface})`);
    out.push(`        If api Is Nothing Then Throw New ArgumentNullException(NameOf(api))`);
    out.push(`        ${field} = api`);
    for (const m of ns.methods) {
      out.push(`        RegisterHandler(${vbString(m.rpcMethod)},`);
      out.push(`            Async Function(params As JToken) As Task(Of Object)`);
      out.push(`                Dim request = DeserializeParams(Of ${vbTypeName(m.input)})(params)`);
      out.push(`                Return Await ${field}.${escapeVbIdentifier(m.pascalName)}(request)`);
      out.push(`            End Function)`);
    }
    out.push("    End Sub");
    out.push("");
  }
  if (model.namespaces.length > 0) out.pop();
  out.push("End Class");
  out.push("");
  return out.join("\n");
}

function emitEvents(model: ContractModel, eventsClass: string): string {
  const out: string[] = [vbHeader()];
  out.push("''' <summary>Host → Web の型付きイベント発行ヘルパ。内部で IEventSink.Emit を呼ぶ。</summary>");
  out.push(`Public Class ${eventsClass}`);
  out.push("    Private ReadOnly _sink As IEventSink");
  out.push("");
  out.push("    Public Sub New(sink As IEventSink)");
  out.push("        If sink Is Nothing Then Throw New ArgumentNullException(NameOf(sink))");
  out.push("        _sink = sink");
  out.push("    End Sub");
  for (const e of model.events) {
    out.push("");
    out.push(`    ''' <summary>JSON-RPC notification \`${e.rpcMethod}\`</summary>`);
    out.push(`    Public Sub ${escapeVbIdentifier(e.pascalName)}(payload As ${vbTypeName(e.payload)})`);
    out.push(`        _sink.Emit(${vbString(e.rpcMethod)}, payload)`);
    out.push("    End Sub");
  }
  out.push("End Class");
  out.push("");
  return out.join("\n");
}

function interfaceName(pascalNamespace: string): string {
  return `I${pascalNamespace}Api`;
}

function fieldName(pascalNamespace: string): string {
  return `_${pascalNamespace.charAt(0).toLowerCase()}${pascalNamespace.slice(1)}Api`;
}

function vbString(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
