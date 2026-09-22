import { describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { BridgeCallError, createBridge } from "../src/bridge.js";

/** page.evaluate を Node 内で模倣する(関数を window 相当のグローバルに対して実行) */
function fakePage(win: Record<string, unknown>): Page {
  return {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => {
      const g = globalThis as { window?: unknown };
      const saved = g.window;
      g.window = win;
      try {
        return await fn(arg);
      } finally {
        g.window = saved;
      }
    },
  } as unknown as Page;
}

describe("createBridge", () => {
  const client = {
    parts: {
      search: async (input: { keyword: string }) => ({ items: [{ partNo: "A-001", name: input.keyword }] }),
      fail: async () => {
        const e = new Error("Simulated failure") as Error & { code: number; data: unknown };
        e.name = "BridgeError";
        e.code = -32000;
        e.data = "System.InvalidOperationException";
        throw e;
      },
    },
  };

  it("契約メソッドを ns.name で呼び、戻り値をそのまま返す", async () => {
    const bridge = createBridge(fakePage({ __webview2Bridge: client }));
    expect(await bridge.isAvailable()).toBe(true);
    expect(await bridge.call("parts.search", { keyword: "m6" })).toEqual({ items: [{ partNo: "A-001", name: "m6" }] });
  });

  it("ページ内の失敗は BridgeCallError(code / data 付き)", async () => {
    const bridge = createBridge(fakePage({ __webview2Bridge: client }));
    const e = await bridge.expectError("parts.fail");
    expect(e).toBeInstanceOf(BridgeCallError);
    expect(e.code).toBe(-32000);
    expect(e.data).toBe("System.InvalidOperationException");
    expect(e.message).toBe("parts.fail: BridgeError -32000: Simulated failure");
    await expect(bridge.call("parts.fail")).rejects.toBeInstanceOf(BridgeCallError);
  });

  it("未公開 / 未知のメソッドは分かる名前のエラー", async () => {
    const none = createBridge(fakePage({}));
    expect(await none.isAvailable()).toBe(false);
    const e1 = await none.expectError("parts.search", {});
    expect(e1.remoteName).toBe("BridgeNotExposed");
    const e2 = await createBridge(fakePage({ __webview2Bridge: client })).expectError("parts.nope");
    expect(e2.remoteName).toBe("MethodNotFound");
    await expect(createBridge(fakePage({ __webview2Bridge: client })).expectError("parts.search", { keyword: "x" })).rejects.toThrow(/成功しました/);
  });

  it("グローバル名を変えられる", async () => {
    const bridge = createBridge(fakePage({ myBridge: client }), "myBridge");
    expect(await bridge.isAvailable()).toBe(true);
  });
});
