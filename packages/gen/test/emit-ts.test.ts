import { describe, expect, it } from "vitest";
import { emitTs } from "../src/emit-ts.js";
import { buildContractModel } from "../src/model.js";
import { contractToJsonSchema } from "../src/to-schema.js";
import { kitchenSinkContract } from "./fixtures/kitchen-sink-contract.js";
import { sampleContract } from "./fixtures/sample-contract.js";

describe("emitTs", () => {
  it("sample contract (snapshot)", async () => {
    const files = emitTs(buildContractModel(contractToJsonSchema(sampleContract)));
    expect(Object.keys(files)).toEqual(["contract-types.ts"]);
    await expect(files["contract-types.ts"]).toMatchFileSnapshot("__snapshots__/sample/contract-types.ts");
  });

  it("kitchen-sink contract (snapshot)", async () => {
    const files = emitTs(buildContractModel(contractToJsonSchema(kitchenSinkContract)), {
      contractImport: "./kitchen-sink-contract",
      contractExport: "kitchenSinkContract",
    });
    await expect(files["contract-types.ts"]).toMatchFileSnapshot("__snapshots__/kitchen-sink/contract-types.ts");
  });
});
