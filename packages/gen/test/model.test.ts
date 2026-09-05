import { z } from "zod";
import { describe, expect, it } from "vitest";
import { defineContract } from "../src/define.js";
import { buildContractModel, ContractModelError } from "../src/model.js";
import { contractToJsonSchema } from "../src/to-schema.js";
import { kitchenSinkContract } from "./fixtures/kitchen-sink-contract.js";
import { sampleContract } from "./fixtures/sample-contract.js";

function modelOf(contract: Parameters<typeof contractToJsonSchema>[0]) {
  return buildContractModel(contractToJsonSchema(contract));
}

describe("buildContractModel", () => {
  it("names anonymous objects from their path", () => {
    const model = modelOf(sampleContract);
    expect(model.dtos.map((d) => d.name)).toEqual(["Part", "PartsSearchRequest", "PartsSearchResponse", "ProgressEvent"]);
    expect(model.namespaces[0]?.methods[0]?.rpcMethod).toBe("parts.search");
    expect(model.events[0]?.rpcMethod).toBe("event.progress");
  });

  it("maps optional / nullable / int64 / enum / nested objects", () => {
    const model = modelOf(kitchenSinkContract);
    const names = model.dtos.map((d) => d.name);
    expect(names).toEqual([
      "Address",
      "OrdersListRequest",
      "OrdersListResponse",
      "OrdersListResponseRowsItem",
      "OrdersListResponseRowsItemLinesItem",
      "OrdersListResponseRowsItemMemo",
      "OrdersCancelRequest",
      "OrdersCancelResponse",
      "MasterDataGetAddressRequest",
      "OrderChangedEvent",
      "HeartbeatEvent",
    ]);
    expect(model.enums.map((e) => e.name)).toEqual(["OrderStatus", "OrdersListRequestKind"]);

    const req = model.dtos.find((d) => d.name === "OrdersListRequest");
    const prop = (n: string) => req?.properties.find((p) => p.jsonName === n);
    expect(prop("status")).toMatchObject({ required: false, type: { kind: "enum", className: "OrderStatus" } });
    expect(prop("page")).toMatchObject({ required: false, type: { kind: "integer", nullable: false } });
    expect(prop("minTotal")).toMatchObject({ required: true, type: { kind: "number", nullable: true } });
    expect(prop("bigId")).toMatchObject({ type: { kind: "long" } });

    // master-data → MasterData、出力が $ref そのもの → Response クラスは作らない
    const md = model.namespaces.find((n) => n.name === "master-data");
    expect(md?.pascalName).toBe("MasterData");
    expect(md?.methods[0]?.output).toEqual({ kind: "object", className: "Address", nullable: false });
  });

  it("rejects unions other than X | null", () => {
    const c = defineContract({
      methods: { a: { b: { input: z.object({ u: z.union([z.string(), z.number()]) }), output: z.object({}) } } },
      events: {},
    });
    expect(() => modelOf(c)).toThrow(ContractModelError);
    expect(() => modelOf(c)).toThrow(/union types are not supported/);
  });

  it("rejects unknown / any", () => {
    const c = defineContract({
      methods: { a: { b: { input: z.object({ x: z.unknown() }), output: z.object({}) } } },
      events: {},
    });
    expect(() => modelOf(c)).toThrow(/unsupported schema type/);
  });

  it("rejects property names that collide case-insensitively (VB)", () => {
    const c = defineContract({
      methods: { a: { b: { input: z.object({ partNo: z.string(), PartNo: z.string() }), output: z.object({}) } } },
      events: {},
    });
    expect(() => modelOf(c)).toThrow(/collide/);
  });

  it("rejects a property named like its class", () => {
    const c = defineContract({
      methods: {},
      events: { progress: z.object({ progressEvent: z.string() }) },
    });
    expect(() => modelOf(c)).toThrow(/same name as its class/);
  });
});
