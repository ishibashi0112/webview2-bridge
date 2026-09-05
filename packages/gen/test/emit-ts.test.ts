import { describe, expect, it } from "vitest";
import { emitTs, toSchema } from "../src/index.js";
import { kitchenSinkContract, sampleContract } from "./fixtures.js";

const opts = { contractImport: "@webview2-bridge/contract" };

describe("emitTs", () => {
  it("sample contract", () => {
    const files = emitTs(toSchema(sampleContract), opts);
    expect(files.map((f) => f.path)).toEqual(["contract-types.ts"]);
    expect(files[0]!.content).toMatchSnapshot();
  });

  it("kitchen sink contract", () => {
    const files = emitTs(toSchema(kitchenSinkContract), opts);
    expect(files[0]!.content).toMatchSnapshot();
  });

  it("derives named types through optional/nullable with NonNullable", () => {
    const src = emitTs(toSchema(kitchenSinkContract), opts)[0]!.content;
    expect(src).toContain('export type Customer = CustomersListOutput["items"][number];');
    expect(src).toContain('export type Status = Customer["status"];');
    expect(src).toContain('export type Address = NonNullable<Customer["address"]>;');
  });
});
