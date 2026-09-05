import { describe, expect, it, vi } from "vitest";
import { BridgeError, JsonRpcErrorCodes, MemoryTransport, type MemoryHandlers } from "../src/index.js";
import { contract, parts, type Contract } from "./fixtures.js";

function make(overrides: Partial<MemoryHandlers<Contract>["parts"]> = {}, delay?: number) {
  const handlers: MemoryHandlers<Contract> = {
    parts: {
      search: async (input, ctx) => {
        ctx.emit("progress", { percent: 50 });
        const items = parts.filter((p) => p.name.toLowerCase().includes(input.keyword.toLowerCase()));
        return { items: items.slice(0, input.limit ?? items.length) };
      },
      ...overrides,
    },
  };
  return new MemoryTransport<Contract>(handlers, delay === undefined ? {} : { delay });
}

describe("MemoryTransport", () => {
  it("round-trips a call through the handler", async () => {
    const t = make();
    const r = (await t.call("parts.search", { keyword: "m6" })) as { items: unknown[] };
    expect(r.items).toHaveLength(2);
  });

  it("rejects unknown methods with -32601", async () => {
    const t = make();
    await expect(t.call("parts.nope", {})).rejects.toMatchObject({
      name: "BridgeError",
      code: JsonRpcErrorCodes.MethodNotFound,
    });
    await expect(t.call("nodot", {})).rejects.toBeInstanceOf(BridgeError);
  });

  it("converts handler exceptions to -32000 with the error name as data", async () => {
    const t = make({
      search: () => {
        throw new RangeError("boom");
      },
    });
    await expect(t.call("parts.search", { keyword: "x" })).rejects.toMatchObject({
      code: JsonRpcErrorCodes.ServerError,
      message: "boom",
      data: "RangeError",
    });
  });

  it("passes BridgeError thrown by handlers through unchanged", async () => {
    const t = make({
      search: () => {
        throw new BridgeError({ code: -32001, message: "custom" });
      },
    });
    await expect(t.call("parts.search", { keyword: "x" })).rejects.toMatchObject({ code: -32001, message: "custom" });
  });

  it("serializes through JSON (drops undefined, copies objects)", async () => {
    const input = { keyword: "m6", limit: undefined };
    let received: unknown;
    const t = make({
      search: (i) => {
        received = i;
        return { items: [] };
      },
    });
    await t.call("parts.search", input);
    expect(received).toEqual({ keyword: "m6" });
    expect(Object.keys(received as object)).toEqual(["keyword"]);
    expect(received).not.toBe(input);
  });

  it("dispatches emitted events to subscribers and supports unsubscribe", async () => {
    const t = make();
    const seen: unknown[] = [];
    const off = t.on("event.progress", (p) => seen.push(p));
    await t.call("parts.search", { keyword: "bolt" });
    expect(seen).toEqual([{ percent: 50 }]);
    off();
    t.emit("progress", { percent: 100 });
    expect(seen).toHaveLength(1);
  });

  it("honours delay", async () => {
    vi.useFakeTimers();
    try {
      const t = make({}, 500);
      const p = t.call("parts.search", { keyword: "bolt" });
      let done = false;
      void p.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(499);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
