import { afterEach, describe, expect, it } from "vitest";
import {
  BridgeError,
  MOCK_GLOBAL,
  MemoryTransport,
  businessError,
  createClient,
  exposeMemoryTransport,
  type MemoryHandlers,
  type MemoryMockGlobal,
  type MemoryOverridePending,
} from "../src/index.js";
import { contract, parts, type Contract } from "./fixtures.js";

const handlers: MemoryHandlers<Contract> = {
  parts: { search: (input) => ({ items: parts.filter((p) => p.name.includes(input.keyword)) }) },
};

describe("MemoryTransport.override", () => {
  it("replaces one method's response with a fixed result and can be undone", async () => {
    const t = new MemoryTransport<Contract>(handlers);
    const client = createClient(contract, t);
    const undo = t.override("parts.search", { result: { items: [{ partNo: "Z-1", name: "差し替え", qty: 1, updatedAt: "2026-01-01T00:00:00Z" }] } });
    expect((await client.parts.search({ keyword: "M6" })).items.map((i) => i.partNo)).toEqual(["Z-1"]);
    undo();
    expect((await client.parts.search({ keyword: "M6" })).items).toHaveLength(2);
  });

  it("replaces with a fixed error (BridgeError with the method attached) and with a handler", async () => {
    const t = new MemoryTransport<Contract>(handlers);
    t.override("parts.search", { error: { code: -32000, message: "DB に接続できません", data: "System.Data.SqlClient.SqlException" } });
    await expect(t.call("parts.search", { keyword: "x" })).rejects.toMatchObject({
      name: "BridgeError",
      code: -32000,
      message: "DB に接続できません",
      data: "System.Data.SqlClient.SqlException",
      method: "parts.search",
    });
    t.override("parts.search", (input, { emit }) => {
      emit("progress", { percent: 100 });
      if (input.keyword === "%") throw businessError("% は使えません", { field: "keyword" });
      return { items: [] };
    });
    const seen: unknown[] = [];
    t.on("event.progress", (p) => seen.push(p));
    expect(await t.call("parts.search", { keyword: "a" })).toEqual({ items: [] });
    expect(seen).toEqual([{ percent: 100 }]);
    const err = await t.call("parts.search", { keyword: "%" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect((err as BridgeError).code).toBe(-32010);
    expect((err as BridgeError).method).toBe("parts.search");
    t.resetOverrides();
    expect((await t.call("parts.search", { keyword: "M6" })) as { items: unknown[] }).toMatchObject({ items: [{}, {}] });
  });

  it("undo only removes its own override", () => {
    const t = new MemoryTransport<Contract>(handlers);
    const undo1 = t.override("parts.search", { result: { items: [] } });
    t.override("parts.search", { error: { code: -32001, message: "second" } });
    undo1(); // 2 つ目が生きている
    return expect(t.call("parts.search", { keyword: "x" })).rejects.toMatchObject({ code: -32001 });
  });
});

describe("exposeMemoryTransport", () => {
  const g = globalThis as Record<string, unknown>;
  afterEach(() => {
    delete g[MOCK_GLOBAL];
    delete g["__custom"];
  });

  it("publishes override / reset on window and applies overrides queued before it (page.addInitScript)", async () => {
    // テストが読み込み前に積む形（packages/test の mockReturn / mockThrow と同じ）
    const pending: MemoryOverridePending[] = [
      { method: "parts.search", result: { items: [{ partNo: "Q-1", name: "queued", qty: 0, updatedAt: "2026-01-01T00:00:00Z" }] } },
    ];
    g[MOCK_GLOBAL] = { pending, override: () => {}, reset: () => {} };
    const t = new MemoryTransport<Contract>(handlers);
    const mock = exposeMemoryTransport(t);
    expect(g[MOCK_GLOBAL]).toBe(mock);
    expect(mock.transport).toBe(t);
    expect(((await t.call("parts.search", { keyword: "M6" })) as { items: { partNo: string }[] }).items[0]?.partNo).toBe("Q-1");

    // 公開後は window の口から直接差し替えられる（queued は上書きされる）
    (g[MOCK_GLOBAL] as MemoryMockGlobal).override("parts.search", { error: { code: -32010, message: "業務エラー", data: { field: "keyword" } } });
    await expect(t.call("parts.search", { keyword: "M6" })).rejects.toMatchObject({ code: -32010, data: { field: "keyword" } });
    (g[MOCK_GLOBAL] as MemoryMockGlobal).reset();
    expect(((await t.call("parts.search", { keyword: "M6" })) as { items: unknown[] }).items).toHaveLength(2);
  });

  it("accepts a queued handler function and a custom global name", async () => {
    g["__custom"] = { pending: [{ method: "parts.search", handler: () => ({ items: [] }) }] };
    const t = new MemoryTransport<Contract>(handlers);
    exposeMemoryTransport(t, "__custom");
    expect(await t.call("parts.search", { keyword: "M6" })).toEqual({ items: [] });
    expect(g[MOCK_GLOBAL]).toBeUndefined();
  });
});
