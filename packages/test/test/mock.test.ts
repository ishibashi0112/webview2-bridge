import { describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { DEFAULT_MOCK_GLOBAL, mockBusinessError, mockReset, mockReturn, mockThrow } from "../src/mock.js";

/**
 * page.addInitScript / page.evaluate を Node 内で模倣する。
 * init: 以後の読み込みで走る関数(ここでは「次の navigate」で実行したことにする)。evaluate: 今のページで即時に実行
 */
function fakePage(win: Record<string, unknown>): Page & { navigate(): Promise<void>; initScripts: number } {
  const inits: (() => Promise<void>)[] = [];
  const run = async (fn: (arg: unknown) => unknown, arg: unknown): Promise<unknown> => {
    const g = globalThis as { window?: unknown };
    const saved = g.window;
    g.window = win;
    try {
      return await fn(arg);
    } finally {
      g.window = saved;
    }
  };
  const page = {
    initScripts: 0,
    addInitScript: async (fn: (arg: unknown) => unknown, arg: unknown) => {
      page.initScripts++;
      inits.push(() => run(fn, arg).then(() => undefined));
    },
    evaluate: run,
    // 新しい document: window を空にして init script を順に流す
    navigate: async () => {
      for (const k of Object.keys(win)) delete win[k];
      for (const i of inits) await i();
    },
  };
  return page as unknown as Page & { navigate(): Promise<void>; initScripts: number };
}

interface Pending {
  method: string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
interface StubGlobal {
  pending: Pending[];
  override: (m: string, s: unknown) => void;
  reset: () => void;
}

describe("mockReturn / mockThrow (screen)", () => {
  it("before exposeMemoryTransport: queues on window.__webview2BridgeMock.pending, now and after the next load", async () => {
    const win: Record<string, unknown> = {};
    const page = fakePage(win);
    await mockReturn(page, "customers.list", { items: [] });
    await mockThrow(page, "app.getContext", { code: -32000, message: "boom", data: "System.Exception" });
    await mockBusinessError(page, "orders.register", "在庫が足りません", "qty");
    await mockBusinessError(page, "orders.cancel", "取り消せません");
    const g = win[DEFAULT_MOCK_GLOBAL] as StubGlobal;
    expect(g.pending).toEqual([
      { method: "customers.list", result: { items: [] } },
      { method: "app.getContext", error: { code: -32000, message: "boom", data: "System.Exception" } },
      { method: "orders.register", error: { code: -32010, message: "在庫が足りません", data: { field: "qty" } } },
      { method: "orders.cancel", error: { code: -32010, message: "取り消せません" } },
    ]);
    expect(page.initScripts).toBe(4);
    // 次の読み込みでも同じ 4 件が積まれる(page.addInitScript)
    await page.navigate();
    expect((win[DEFAULT_MOCK_GLOBAL] as StubGlobal).pending).toHaveLength(4);
    await mockReset(page);
    expect((win[DEFAULT_MOCK_GLOBAL] as StubGlobal).pending).toHaveLength(0);
  });

  it("after exposeMemoryTransport: calls override on the real global immediately", async () => {
    const calls: unknown[] = [];
    let resets = 0;
    const win: Record<string, unknown> = {
      [DEFAULT_MOCK_GLOBAL]: { override: (m: string, s: unknown) => calls.push([m, s]), reset: () => resets++ },
    };
    const page = fakePage(win);
    await mockReturn(page, "customers.list", { items: [{ id: "9" }] });
    await mockThrow(page, "customers.list", { code: -32601, message: "nope" });
    expect(calls).toEqual([
      ["customers.list", { result: { items: [{ id: "9" }] } }],
      ["customers.list", { error: { code: -32601, message: "nope" } }],
    ]);
    await mockReset(page);
    expect(resets).toBe(1);
  });

  it("uses a custom global name", async () => {
    const win: Record<string, unknown> = {};
    const page = fakePage(win);
    await mockReturn(page, "a.b", 1, { globalName: "__custom" });
    expect((win["__custom"] as StubGlobal).pending).toEqual([{ method: "a.b", result: 1 }]);
    expect(win[DEFAULT_MOCK_GLOBAL]).toBeUndefined();
    await mockReset(page); // 無くても失敗しない
  });
});
