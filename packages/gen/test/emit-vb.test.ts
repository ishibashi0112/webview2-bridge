import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GenerateError, defineContract, emitVb, toSchema } from "../src/index.js";
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
    expect(dto).toContain('<JsonProperty("page", NullValueHandling:=NullValueHandling.Ignore)>\n        Public Property Page As Nullable(Of Integer)');
    expect(dto).toContain('<JsonProperty("nullableInt")>\n        Public Property NullableInt As Nullable(Of Integer)');
    expect(dto).toContain('<JsonProperty("optionalNullableInt", NullValueHandling:=NullValueHandling.Ignore)>\n        Public Property OptionalNullableInt As Nullable(Of Integer)');
    expect(dto).toContain('<JsonProperty("zip")>\n        Public Property Zip As String');
  });

  it("escapes VB keywords and converts snake_case", () => {
    const dto = emitAll(kitchenSinkContract)["Dto.vb"]!;
    expect(dto).toContain("Public Property [Date] As String");
    expect(dto).toContain("Public Property [End] As Nullable(Of Boolean)");
    expect(dto).toContain('<JsonProperty("snake_case_name")>\n        Public Property SnakeCaseName As String');
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
    expect(dto).toContain("Public Property Attributes As Dictionary(Of String, String) = New Dictionary(Of String, String)()");
    expect(dto).toContain("Public Property Extra As JToken");
  });

  it("emits one Register extension method per namespace (Dispatcher lives in another assembly)", () => {
    const d = emitAll(kitchenSinkContract)["Dispatcher.Generated.vb"]!;
    expect(d).toContain("Imports System.Runtime.CompilerServices");
    expect(d).toContain("Imports WebView2Bridge.Runtime");
    expect(d).toContain("Public Module DispatcherExtensions");
    expect(d).toContain("<Extension>\n        Public Sub Register(dispatcher As Dispatcher, api As ICustomersApi)");
    expect(d).toContain("<Extension>\n        Public Sub Register(dispatcher As Dispatcher, api As ISystemApi)");
    expect(d).toContain('dispatcher.RegisterHandler(Of CustomersSaveRequest, CustomersSaveResponse)("customers.save", AddressOf api.Save)');
    expect(d).not.toContain("Partial Public Class");
  });

  it("emits MissingMethods so the host can detect unregistered implementations at startup (A-3)", () => {
    const d = emitAll(kitchenSinkContract)["Dispatcher.Generated.vb"]!;
    expect(d).toContain("Imports System.Collections.Generic");
    expect(d).toContain("Imports System.Linq");
    expect(d).toContain("<Extension>\n        Public Function MissingMethods(dispatcher As Dispatcher) As String()");
    expect(d).toContain("Dim registered As New HashSet(Of String)(dispatcher.RegisteredMethods, StringComparer.Ordinal)");
    expect(d).toContain("Return MethodNames.Where(Function(m) Not registered.Contains(m)).ToArray()");
  });

  it("lets the runtime namespace be overridden", () => {
    const files = emitVb(toSchema(sampleContract), { ...opts, runtimeNamespace: "My.Runtime" });
    const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
    expect(byPath["Dispatcher.Generated.vb"]).toContain("Imports My.Runtime");
    expect(byPath["Events.vb"]).toContain("Imports My.Runtime");
    expect(byPath["Dto.vb"]).not.toContain("Imports My.Runtime");
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

  it("names empty and symbol-only enum values so the Const compiles (A-1)", () => {
    // 空文字は `_` 単独（VB では行継続文字）になってコンパイルできなかった。記号だけの値も同様
    const c = defineContract({
      methods: {
        plan: {
          list: {
            input: z.object({}),
            output: z.object({
              priceWarn: z.enum(["", "N1", "N2", "N3"]),
              op: z.enum(["-", "*", "<=", " ", "_", "★", "values", "Values"]),
            }),
          },
        },
      },
      events: {},
    });
    const dto = emitAll(c)["Dto.vb"]!;
    expect(dto).toContain('Public Const Empty As String = ""');
    expect(dto).toContain('Public Const N1 As String = "N1"');
    expect(dto).toContain('Public Const Hyphen As String = "-"');
    expect(dto).toContain('Public Const Asterisk As String = "*"');
    expect(dto).toContain('Public Const LessThanEqual As String = "<="');
    expect(dto).toContain('Public Const Space As String = " "');
    expect(dto).toContain('Public Const Underscore As String = "_"');
    expect(dto).toContain('Public Const U2605 As String = "★"');
    // 同じクラスの `Values` 配列とぶつかる値、大文字小文字だけ違う値は `_` を足す
    expect(dto).toContain('Public Const Values_ As String = "values"');
    expect(dto).toContain('Public Const Values__ As String = "Values"');
    expect(dto).toContain('Public Shared ReadOnly Values As String() = {"-", "*", "<=", " ", "_", "★", "values", "Values"}');
    expect(dto).not.toMatch(/Public Const _+ As/);
  });

  it("rejects method / property / event names that are members of System.Object (A-2)", () => {
    const method = defineContract({
      methods: { modules: { finalize: { input: z.object({ id: z.string() }), output: z.object({}) } } },
      events: {},
    });
    expect(() => emitVb(toSchema(method), opts)).toThrow(GenerateError);
    expect(() => emitVb(toSchema(method), opts)).toThrow(
      /Method "finalize" would be generated as "Finalize", which is a member of System\.Object.*Rename it in the contract.*\(at methods\.modules\.finalize\)/,
    );

    const property = defineContract({
      methods: { a: { b: { input: z.object({ toString: z.string() }), output: z.object({}) } } },
      events: {},
    });
    expect(() => emitVb(toSchema(property), opts)).toThrow(
      /Property "toString" would be generated as "ToString".*\(at methods\.a\.b\.input\.toString\)/,
    );

    // GetType は VB の予約語でもあるが、[GetType] と囲んでも Object.GetType とはぶつかるので同じく止める
    const nested = defineContract({
      methods: { a: { b: { input: z.object({}), output: z.object({ item: z.object({ getType: z.string() }) }) } } },
      events: {},
    });
    expect(() => emitVb(toSchema(nested), opts)).toThrow(/Property "getType" would be generated as "GetType"/);

    const event = defineContract({
      methods: { a: { b: { input: z.object({}), output: z.object({}) } } },
      events: { getHashCode: z.object({ v: z.number() }) },
    });
    expect(() => emitVb(toSchema(event), opts)).toThrow(/Event "getHashCode" would be generated as "GetHashCode".*\(at events\.getHashCode\)/);

    // 似た名前（toStringValue / equalsCount）は通る
    const ok = defineContract({
      methods: { a: { finalizeVersion: { input: z.object({ toStringValue: z.string() }), output: z.object({ equalsCount: z.number() }) } } },
      events: { finalized: z.object({}) },
    });
    expect(() => emitVb(toSchema(ok), opts)).not.toThrow();
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
