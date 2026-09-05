import { describe, expect, it, vi } from "vitest";
import { BridgeError } from "../src/errors.js";
import { MemoryTransport, type MemoryHandlers } from "../src/memory.js";
import { samplePart, testContract } from "./fixtures.js";

function makeHandlers(): MemoryHandlers<typeof testContract> {
  return {
    parts: {
      search: async (input, ctx) => {
        ctx.emit("progress", { percent: 50, message: `searching ${input.keyword}` });
        return { items: [samplePart].slice(0, input.limit ?? 10) };
      },
      fail: async () => {
        throw new Error("boom");
      },
    },
  };
}

describe("MemoryTransport", () => {
  it("calls the handler for <namespace>.<name>", async () => {
    const t = new MemoryTransport(makeHandlers());
    await expect(t.call("parts.search", { keyword: "bolt" })).resolves.toEqual({ items: [samplePart] });
  });

  it("rejects unknown methods with -32601", async () => {
    const t = new MemoryTransport(makeHandlers());
    const err = await t.call("parts.nope", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe(-32601);
    await expect(t.call("noDot", {})).rejects.toMatchObject({ code: -32601 });
  });

  it("converts handler exceptions to -32000 like the VB side", async () => {
    const t = new MemoryTransport(makeHandlers());
    const err = await t.call("parts.fail", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err).toMatchObject({ code: -32000, message: "boom", data: "Error", method: "parts.fail" });
  });

  it("dispatches events emitted from handlers and via emit(), and unsubscribes", async () => {
    const t = new MemoryTransport(makeHandlers());
    const seen: unknown[] = [];
    const off = t.on("progress", (p) => seen.push(p));
    await t.call("parts.search", { keyword: "x" });
    t.emit("progress", { percent: 100 });
    expect(seen).toEqual([{ percent: 50, message: "searching x" }, { percent: 100 }]);
    off();
    t.emit("progress", { percent: 0 });
    expect(seen).toHaveLength(2);
  });

  it("applies the configured delay", async () => {
    vi.useFakeTimers();
    try {
      const t = new MemoryTransport(makeHandlers(), { delay: 500 });
      const p = t.call("parts.search", { keyword: "x" });
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
