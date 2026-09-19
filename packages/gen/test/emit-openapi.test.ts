import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContract, emitOpenApi, toSchema } from "../src/index.js";
import { kitchenSinkContract, sampleContract } from "./fixtures.js";

type Doc = {
  openapi: string;
  paths: Record<string, Record<string, { operationId: string; requestBody?: unknown; responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, unknown>; responses: Record<string, unknown> };
};

function emit(contract: Parameters<typeof toSchema>[0], opts?: Parameters<typeof emitOpenApi>[1]): Doc {
  const files = emitOpenApi(toSchema(contract), opts);
  expect(files.map((f) => f.path)).toEqual(["openapi.json"]);
  return JSON.parse(files[0]!.content) as Doc;
}

/** 文書内のすべての $ref が components/schemas か components/responses に解決できること */
function collectRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => collectRefs(n, out));
  else if (typeof node === "object" && node !== null) {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") out.push(v);
      else collectRefs(v, out);
    }
  }
  return out;
}

function expectRefsResolve(doc: Doc): void {
  for (const ref of collectRefs(doc)) {
    expect(ref.startsWith("#/components/")).toBe(true);
    const [, , kind, name] = ref.split("/");
    const table = kind === "schemas" ? doc.components.schemas : kind === "responses" ? doc.components.responses : {};
    expect(table, ref).toHaveProperty(name!);
  }
  expect(JSON.stringify(doc)).not.toContain("#/$defs/");
}

describe("emitOpenApi", () => {
  it("sample contract", () => {
    expect(emitOpenApi(toSchema(sampleContract))[0]!.content).toMatchSnapshot();
  });

  it("kitchen sink contract", () => {
    expect(emitOpenApi(toSchema(kitchenSinkContract), { title: "Kitchen", version: "2.0.0" })[0]!.content).toMatchSnapshot();
  });

  it("maps each method to POST /<ns>/<name> with DTO-named components", () => {
    const doc = emit(sampleContract);
    expect(doc.openapi).toBe("3.1.0");
    const op = doc.paths["/parts/search"]!["post"]!;
    expect(op.operationId).toBe("partsSearch");
    expect(op.requestBody).toEqual({
      required: true,
      content: { "application/json": { schema: { $ref: "#/components/schemas/PartsSearchRequest" } } },
    });
    expect(Object.keys(op.responses).sort()).toEqual(["200", "400", "404", "500"]);
    expect(Object.keys(doc.components.schemas).sort()).toEqual(
      ["JsonRpcError", "Part", "PartsSearchRequest", "PartsSearchResponse", "ProgressEvent"].sort(),
    );
    // $defs の参照は components に書き換わる
    expect(doc.components.schemas["PartsSearchResponse"]).toMatchObject({
      properties: { items: { type: "array", items: { $ref: "#/components/schemas/Part" } } },
    });
    expectRefsResolve(doc);
  });

  it("describes events as an SSE endpoint carrying JSON-RPC notifications", () => {
    const doc = emit(kitchenSinkContract);
    const get = doc.paths["/events"]!["get"]!;
    const content = (get.responses["200"] as { content: Record<string, { schema: { oneOf: unknown[] } }> }).content;
    expect(Object.keys(content)).toEqual(["text/event-stream"]);
    expect(content["text/event-stream"]!.schema.oneOf).toHaveLength(2);
    expect(content["text/event-stream"]!.schema.oneOf[0]).toMatchObject({
      properties: { method: { const: "event.customerChanged" }, params: { $ref: "#/components/schemas/CustomerChangedEvent" } },
    });
    expectRefsResolve(doc);
  });

  it("honours basePath and eventsPath, and omits the events path when disabled", () => {
    const doc = emit(sampleContract, { basePath: "api/", eventsPath: "stream" });
    expect(Object.keys(doc.paths).sort()).toEqual(["/api/parts/search", "/api/stream"]);
    const noEvents = emit(sampleContract, { eventsPath: false });
    expect(Object.keys(noEvents.paths)).toEqual(["/parts/search"]);
    // イベントの型は仕様書に残す（クライアント側は購読しうる）
    expect(noEvents.components.schemas).toHaveProperty("ProgressEvent");
  });

  it("aliases a named schema used directly as input/output instead of duplicating it", () => {
    const Query = z.object({ q: z.string() }).meta({ id: "Query" });
    const contract = defineContract({
      methods: { items: { find: { input: Query, output: z.object({ n: z.number().int() }) } } },
      events: {},
    });
    const doc = emit(contract);
    expect(doc.components.schemas["ItemsFindRequest"]).toMatchObject({ $ref: "#/components/schemas/Query" });
    expect(doc.paths).not.toHaveProperty("/events");
    expectRefsResolve(doc);
  });

  it("rejects component name collisions", () => {
    const Bad = z.object({ x: z.string() }).meta({ id: "ItemsFindResponse" });
    const contract = defineContract({
      methods: { items: { find: { input: z.object({}), output: z.object({ bad: Bad }) } } },
      events: {},
    });
    expect(() => emit(contract)).toThrow(/collision.*ItemsFindResponse/);
  });
});
