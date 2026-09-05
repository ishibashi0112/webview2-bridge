import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GenerateError, defineContract, toSchema } from "../src/index.js";
import { kitchenSinkContract, sampleContract } from "./fixtures.js";

describe("toSchema", () => {
  it("sample contract", () => {
    expect(toSchema(sampleContract)).toMatchSnapshot();
  });

  it("kitchen sink contract", () => {
    expect(toSchema(kitchenSinkContract)).toMatchSnapshot();
  });

  it("hoists .meta({ id }) schemas into a single $defs and refs them", () => {
    const s = toSchema(sampleContract);
    expect(Object.keys(s.$defs)).toEqual(["Part"]);
    expect(s.methods["parts"]!["search"]!.output.properties!["items"]!.items).toEqual({ $ref: "#/$defs/Part" });
  });

  it("rejects invalid names", () => {
    const bad = defineContract({
      methods: { "my-ns": { x: { input: z.object({}), output: z.object({}) } } },
      events: {},
    });
    expect(() => toSchema(bad)).toThrow(GenerateError);
    const reserved = defineContract({
      methods: { event: { x: { input: z.object({}), output: z.object({}) } } },
      events: {},
    });
    expect(() => toSchema(reserved)).toThrow(/reserved/);
  });

  it("rejects unrepresentable types (z.date)", () => {
    const bad = defineContract({
      methods: { a: { b: { input: z.object({ d: z.date() }), output: z.object({}) } } },
      events: {},
    });
    expect(() => toSchema(bad)).toThrow();
  });
});
