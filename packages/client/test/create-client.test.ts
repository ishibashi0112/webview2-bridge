import { describe, expect, it, vi } from "vitest";
import { BridgeValidationError, MemoryTransport, createClient, type MemoryHandlers, type Transport } from "../src/index.js";
import { contract, parts, type Contract } from "./fixtures.js";

const handlers: MemoryHandlers<Contract> = {
  parts: {
    search: (input) => ({ items: parts.filter((p) => p.name.includes(input.keyword)) }),
  },
};

describe("createClient", () => {
  it("exposes namespace.method functions with typed results", async () => {
    const client = createClient(contract, new MemoryTransport<Contract>(handlers));
    const r = await client.parts.search({ keyword: "M6" });
    expect(r.items.map((i) => i.partNo)).toEqual(["A-001", "A-002"]);
    // 型チェック: r.items[0].qty は number
    const qty: number | undefined = r.items[0]?.qty;
    expect(qty).toBe(120);
  });

  it("validates input before sending", async () => {
    const call = vi.fn();
    const transport: Transport = { call, on: () => () => {} };
    const client = createClient(contract, transport);
    await expect(client.parts.search({ keyword: "" })).rejects.toMatchObject({
      name: "BridgeValidationError",
      direction: "input",
      method: "parts.search",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("validates output after receiving", async () => {
    const transport: Transport = { call: async () => ({ items: [{ partNo: 1 }] }), on: () => () => {} };
    const client = createClient(contract, transport);
    const err = await client.parts.search({ keyword: "x" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeValidationError);
    expect((err as BridgeValidationError).direction).toBe("output");
    expect((err as BridgeValidationError).issues.length).toBeGreaterThan(0);
  });

  it("subscribes to events with validation and unsubscribe", () => {
    const t = new MemoryTransport<Contract>(handlers);
    const onEventValidationError = vi.fn();
    const client = createClient(contract, t, { onEventValidationError });
    const seen: unknown[] = [];
    const off = client.events.on("progress", (p) => seen.push(p));
    t.emit("progress", { percent: 10, message: "a" });
    // 不正なペイロード（型を無視して流す）
    t.emit("progress", { percent: "bad" } as never);
    expect(seen).toEqual([{ percent: 10, message: "a" }]);
    expect(onEventValidationError).toHaveBeenCalledTimes(1);
    expect(onEventValidationError.mock.calls[0]![0]).toMatchObject({ direction: "event", method: "event.progress" });
    off();
    t.emit("progress", { percent: 20 });
    expect(seen).toHaveLength(1);
  });

  it("rejects reserved namespace names", () => {
    const bad = { methods: { events: {} }, events: {} };
    expect(() => createClient(bad, new MemoryTransport(handlers as never))).toThrow(/reserved/);
  });
});
