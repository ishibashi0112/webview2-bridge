import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContract, emitVb, GenerateError, toSchema } from "../src/index.js";
import { kitchenSinkContract, sampleContract } from "./fixtures.js";

const opts = { namespace: "WebView2Bridge.Contract" };

function emitAll(contract: Parameters<typeof toSchema>[0]): Record<string, string> {
  return Object.fromEntries(emitVb(toSchema(contract), opts).map((f) => [f.path, f.content]));
}

describe("emitVb", () => {
  it("sample contract", () => {
    const files = emitAll(sampleContract);
    expect(Object.keys(files)).toEqual(["Dto.vb", "Interfaces.vb", "Dispatcher.Generated.vb", "Events.vb"]);
    for (const [path, content] of Object.entries(files)) {
      expect(content).toMatchSnapshot(path);
    }
  });

  it("kitchen sink contract", () => {
    const files = emitAll(kitchenSinkContract);
    for (const [path, content] of Object.entries(files)) {
      expect(content).toMatchSnapshot(path);
    }
  });

  it("maps optional/nullable value types to Nullable(Of T) and ignores null for optional props", () => {
    const dto = emitAll(kitchenSinkContract)["Dto.vb"]!;
    expect(dto).toContain(
      '<JsonProperty("page", NullValueHandling:=NullValueHandling.Ignore, Required:=Required.DisallowNull)>\n        Public Property Page As Nullable(Of Integer)',
    );
    expect(dto).toContain(
      '<JsonProperty("nullableInt", Required:=Required.AllowNull)>\n        Public Property NullableInt As Nullable(Of Integer)',
    );
    expect(dto).toContain(
      '<JsonProperty("optionalNullableInt", NullValueHandling:=NullValueHandling.Ignore)>\n        Public Property OptionalNullableInt As Nullable(Of Integer)',
    );
    expect(dto).toContain('<JsonProperty("zip", Required:=Required.AllowNull)>\n        Public Property Zip As String');
  });

  it("escapes VB keywords and converts snake_case", () => {
    const dto = emitAll(kitchenSinkContract)["Dto.vb"]!;
    expect(dto).toContain("Public Property [Date] As String");
    expect(dto).toContain("Public Property [End] As Nullable(Of Boolean)");
    expect(dto).toContain(
      '<JsonProperty("snake_case_name", Required:=Required.Always)>\n        Public Property SnakeCaseName As String',
    );
  });

  it("emits string enums as Const classes, named by meta id or by owner+property", () => {
    const dto = emitAll(kitchenSinkContract)["Dto.vb"]!;
    expect(dto).toContain("Public NotInheritable Class Status");
    expect(dto).toContain('Public Const InProgress As String = "in-progress"');
    expect(dto).toContain('Public Const _2nd As String = "2nd"');
    expect(dto).toContain("Public NotInheritable Class CustomerKind");
    expect(dto).toContain("Public NotInheritable Class LogEventLevel");
    expect(dto).toContain("Public Property Status As String");
  });

  it("names nested anonymous objects and array items after their owner", () => {
    const dto = emitAll(kitchenSinkContract)["Dto.vb"]!;
    expect(dto).toContain("Public Class CustomerChild");
    expect(dto).toContain("Public Property Children As List(Of CustomerChild) = New List(Of CustomerChild)()");
    expect(dto).toContain("Public Class CustomerMeta");
    expect(dto).toContain(
      "Public Property Attributes As Dictionary(Of String, String) = New Dictionary(Of String, String)()",
    );
    expect(dto).toContain("Public Property Extra As JToken");
  });

  it("emits one Register extension method per namespace (Dispatcher lives in another assembly)", () => {
    const d = emitAll(kitchenSinkContract)["Dispatcher.Generated.vb"]!;
    expect(d).toContain("Imports System.Runtime.CompilerServices");
    expect(d).toContain("Imports WebView2Bridge.Runtime");
    expect(d).toContain("Public Module DispatcherExtensions");
    expect(d).toContain("<Extension>\n        Public Sub Register(dispatcher As Dispatcher, api As ICustomersApi)");
    expect(d).toContain("<Extension>\n        Public Sub Register(dispatcher As Dispatcher, api As ISystemApi)");
    expect(d).toContain(
      'dispatcher.RegisterHandler(Of CustomersSaveRequest, CustomersSaveResponse)("customers.save", AddressOf api.Save)',
    );
    expect(d).not.toContain("Partial Public Class");
  });

  it("lets the runtime namespace be overridden", () => {
    const files = emitVb(toSchema(sampleContract), { ...opts, runtimeNamespace: "My.Runtime" });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    expect(byPath["Dispatcher.Generated.vb"]).toContain("Imports My.Runtime");
    expect(byPath["Events.vb"]).toContain("Imports My.Runtime");
    expect(byPath["Dto.vb"]).toContain("Imports My.Runtime"); // IValidatable のため
  });

  it("mirrors zod's required / optional / nullable as JsonProperty Required", () => {
    const dto = emitAll(kitchenSinkContract)["Dto.vb"]!;
    expect(dto).toContain('<JsonProperty("name", Required:=Required.Always)>');
    expect(dto).toContain('<JsonProperty("zip", Required:=Required.AllowNull)>');
    expect(dto).toContain(
      '<JsonProperty("page", NullValueHandling:=NullValueHandling.Ignore, Required:=Required.DisallowNull)>',
    );
    expect(dto).toContain('<JsonProperty("optionalNullableInt", NullValueHandling:=NullValueHandling.Ignore)>\n');
    // z.unknown() は zod が実行時に欠落を許すので Required を付けない
    expect(dto).toContain('<JsonProperty("extra")>\n        Public Property Extra As JToken');
  });

  it("generates Validate() for string length, numeric range, enum membership, item count and nesting", () => {
    const Order = z
      .object({
        no: z.string().min(1).max(20),
        qty: z.number().int().min(1).max(999),
        ratio: z.number().gt(0).lt(1).optional(),
        status: z.enum(["open", "closed"]),
        tags: z.array(z.string().min(1)).min(1),
        lines: z.array(z.object({ partNo: z.string().min(1), qty: z.number().int().min(1) })),
        notes: z.record(z.string(), z.string().max(10)),
        flag: z.boolean(),
      })
      .meta({ id: "Order" });
    const contract = defineContract({
      methods: { orders: { save: { input: z.object({ order: Order }), output: z.object({ ok: z.boolean() }) } } },
      events: {},
    });
    const dto = emitAll(contract)["Dto.vb"]!;
    expect(dto).toContain("Imports WebView2Bridge.Runtime");
    expect(dto).toContain("    Public Class Order\n        Implements IValidatable");
    expect(dto).toContain(
      "Public Sub Validate(path As String, issues As IList(Of String)) Implements IValidatable.Validate",
    );
    expect(dto).toContain('Dim prefix As String = If(String.IsNullOrEmpty(path), String.Empty, path & ".")');
    expect(dto).toContain(
      'If No IsNot Nothing Then\n                If No.Length < 1 Then issues.Add(prefix & "no" & ": " & "1 文字以上")',
    );
    expect(dto).toContain('If No.Length > 20 Then issues.Add(prefix & "no" & ": " & "20 文字以下")');
    expect(dto).toContain('If Qty < 1 Then issues.Add(prefix & "qty" & ": " & "1 以上")');
    expect(dto).toContain('If Qty > 999 Then issues.Add(prefix & "qty" & ": " & "999 以下")');
    expect(dto).toContain("If Ratio.HasValue Then\n                If Ratio.Value <= 0 Then issues.Add(");
    expect(dto).toContain('If Ratio.Value >= 1 Then issues.Add(prefix & "ratio" & ": " & "1 未満")');
    expect(dto).toContain(
      'If Array.IndexOf(OrderStatus.Values, Status) < 0 Then issues.Add(prefix & "status" & ": " & "次のいずれか: " & String.Join(" / ", OrderStatus.Values))',
    );
    expect(dto).toContain('If Tags.Count < 1 Then issues.Add(prefix & "tags" & ": " & "1 件以上")');
    expect(dto).toContain("For i0 As Integer = 0 To Tags.Count - 1");
    expect(dto).toContain(
      'If Tags(i0).Length < 1 Then issues.Add(prefix & "tags" & "[" & i0.ToString() & "]" & ": " & "1 文字以上")',
    );
    expect(dto).toContain('Lines(i0).Validate(prefix & "lines" & "[" & i0.ToString() & "]", issues)');
    expect(dto).toContain("For Each kv0 In Notes");
    expect(dto).toContain(
      'If kv0.Value.Length > 10 Then issues.Add(prefix & "notes" & "." & kv0.Key & ": " & "10 文字以下")',
    );
    // 入れ子クラスにも Validate が生成され、ルートの Request からも呼ばれる
    expect(dto).toContain("Public Class OrderLine\n        Implements IValidatable");
    expect(dto).toContain('If Order IsNot Nothing Then\n                Order.Validate(prefix & "order", issues)');
    // 規則の無いクラスは空の Validate（prefix を宣言しない）
    expect(dto).toContain("Public Class OrdersSaveResponse\n        Implements IValidatable");
    expect(dto).toMatch(
      /OrdersSaveResponse[\s\S]*?Public Sub Validate\(path As String, issues As IList\(Of String\)\) Implements IValidatable.Validate\n {8}End Sub/,
    );
  });

  it("rejects unions", () => {
    const bad = defineContract({
      methods: { a: { b: { input: z.object({ v: z.union([z.string(), z.number()]) }), output: z.object({}) } } },
      events: {},
    });
    expect(() => emitVb(toSchema(bad), opts)).toThrow(GenerateError);
    expect(() => emitVb(toSchema(bad), opts)).toThrow(/Union/);
  });

  it("rejects non-object method input", () => {
    const bad = defineContract({
      methods: { a: { b: { input: z.string(), output: z.object({}) } } },
      events: {},
    });
    expect(() => emitVb(toSchema(bad), opts)).toThrow(/z\.object/);
  });

  it("rejects colliding generated names", () => {
    // .meta({ id }) の名前が、メソッドから導出される Request 名とぶつかる
    const collide = defineContract({
      methods: {
        parts: {
          search: {
            input: z.object({ x: z.object({ v: z.string() }).meta({ id: "PartsSearchRequest" }) }),
            output: z.object({}),
          },
        },
      },
      events: {},
    });
    expect(() => emitVb(toSchema(collide), opts)).toThrow(/collides/);
  });
});
