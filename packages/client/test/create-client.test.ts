import { describe, expect, it, vi } from "vitest";
import { createClient } from "../src/create-client.js";
import { BridgeError, BridgeValidationError } from "../src/errors.js";
import { MemoryTransport, type MemoryHandlers } from "../src/memory.js";
import type { Transport } from "../src/transport.js";
import { samplePart, testContract } from "./fixtures.js";

const handlers: MemoryHandlers<typeof testContract> = {
  parts: {
    search: async (input, ctx) => {
      ctx.emit("progress", { percent: 100 });
      return { items: input.keyword === "none" ? [] : [samplePart] };
    },
    fail: async () => {
      throw new Error("boom");
    },
  },
};

describe("createClient", () => {
  it("exposes client.<namespace>.<method>() and returns validated output", async () => {
    const client = createClient(testContract, new MemoryTransport(handlers));
    const res = await client.parts.search({ keyword: "bolt" });
    expect(res.items[0]?.partNo).toBe("P-001");
    // 型: res.items は Part[]（コンパイル時チェック）
    const qty: number = res.items[0]?.qty ?? 0;
    expect(qty).toBe(10);
  });

  it("rejects invalid input before sending (BridgeValidationError input)", async () => {
    const transport = new MemoryTransport(handlers);
    const spy = vi.spyOn(transport, "call");
    const client = createClient(testContract, transport);
    const err = await client.parts.search({ keyword: "" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeValidationError);
    expect(err).toMatchObject({ direction: "input", target: "parts.search" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the parsed input (not the raw object) to the transport", async () => {
    const calls: unknown[] = [];
    const transport: Transport = {
      call: async (method, params) => {
        calls.push([method, params]);
        return { items: [] };
      },
      on: () => () => {},
    };
    const client = createClient(testContract, transport);
    await client.parts.search({ keyword: "x" });
    expect(calls).toEqual([["parts.search", { keyword: "x" }]]);
  });

  it("rejects output that does not match the contract (BridgeValidationError output)", async () => {
    const transport: Transport = {
      call: async () => ({ items: [{ partNo: 1 }] }),
      on: () => () => {},
    };
    const client = createClient(testContract, transport);
    const err = await client.parts.search({ keyword: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeValidationError);
    expect(err).toMatchObject({ direction: "output", target: "parts.search" });
  });

  it("passes BridgeError from the transport through", async () => {
    const client = createClient(testContract, new MemoryTransport(handlers));
    await expect(client.parts.fail({})).rejects.toBeInstanceOf(BridgeError);
  });

  it("delivers validated events and reports invalid payloads via onEventValidationError", async () => {
    const transport = new MemoryTransport(handlers);
    const invalid: BridgeValidationError[] = [];
    const client = createClient(testContract, transport, { onEventValidationError: (e) => invalid.push(e) });
    const seen: number[] = [];
    const off = client.events.on("progress", (p) => seen.push(p.percent));
    await client.parts.search({ keyword: "x" });
    transport.emit("progress", { percent: "bad" as unknown as number });
    expect(seen).toEqual([100]);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]).toMatchObject({ direction: "event", target: "progress" });
    off();
    transport.emit("progress", { percent: 1 });
    expect(seen).toEqual([100]);
  });

  it("throws on unknown event names and reserved namespaces", () => {
    const client = createClient(testContract, new MemoryTransport(handlers));
    expect(() => client.events.on("nope" as never, () => {})).toThrow(/unknown event/);
    expect(() =>
      createClient({ methods: { events: {} }, events: {} }, new MemoryTransport({ events: {} })),
    ).toThrow(/reserved/);
  });
});
