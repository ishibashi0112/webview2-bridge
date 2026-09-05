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

  it("emits one Register overload per namespace", () => {
    const d = emitAll(kitchenSinkContract)["Dispatcher.Generated.vb"]!;
    expect(d).toContain("Public Sub Register(api As ICustomersApi)");
    expect(d).toContain("Public Sub Register(api As ISystemApi)");
    expect(d).toContain('RegisterHandler(Of CustomersSaveRequest, CustomersSaveResponse)("customers.save", AddressOf api.Save)');
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
