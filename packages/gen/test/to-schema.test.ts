import { describe, expect, it } from "vitest";
import { contractToJsonSchema } from "../src/to-schema.js";
import { kitchenSinkContract } from "./fixtures/kitchen-sink-contract.js";
import { sampleContract } from "./fixtures/sample-contract.js";

describe("contractToJsonSchema", () => {
  it("sample contract → JSON Schema (snapshot)", async () => {
    const schema = contractToJsonSchema(sampleContract);
    await expect(JSON.stringify(schema, null, 2)).toMatchFileSnapshot("__snapshots__/sample/contract.schema.json");
  });

  it("kitchen-sink contract → JSON Schema (snapshot)", async () => {
    const schema = contractToJsonSchema(kitchenSinkContract);
    await expect(JSON.stringify(schema, null, 2)).toMatchFileSnapshot(
      "__snapshots__/kitchen-sink/contract.schema.json",
    );
  });

  it("extracts .meta({ id }) schemas into $defs and references them by $ref", () => {
    const schema = contractToJsonSchema(sampleContract);
    expect(Object.keys(schema.$defs ?? {})).toEqual(["Part"]);
    const output = schema.properties.methods.properties?.["parts"]?.properties?.["search"]?.properties?.["output"];
    expect(output?.properties?.["items"]?.items).toEqual({ $ref: "#/$defs/Part" });
  });
});
