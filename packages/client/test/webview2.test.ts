import { afterEach, describe, expect, it, vi } from "vitest";
import { BridgeError, BridgeTimeoutError } from "../src/errors.js";
import type { JsonRpcRequest } from "../src/transport.js";
import { hasWebView2, WebView2Transport, type WebView2Like } from "../src/webview2.js";

/** window.chrome.webview の偽物。postMessage を記録し、receive() で Host からのメッセージを届ける */
class FakeWebView implements WebView2Like {
  readonly posted: JsonRpcRequest[] = [];
  private readonly listeners = new Set<(e: { data: unknown }) => void>();
  postMessage(message: unknown): void {
    this.posted.push(message as JsonRpcRequest);
  }
  addEventListener(_type: "message", listener: (e: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: "message", listener: (e: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
  receive(data: unknown): void {
    for (const l of this.listeners) l({ data });
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

describe("WebView2Transport", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when window.chrome.webview is missing", () => {
    expect(hasWebView2()).toBe(false);
    expect(() => new WebView2Transport()).toThrow(/WebView2 is not available/);
  });

  it("posts a JSON-RPC request and resolves with the matching result", async () => {
    const wv = new FakeWebView();
    const t = new WebView2Transport({ webview: wv, idPrefix: "t" });
    const p = t.call("parts.search", { keyword: "x" });
    expect(wv.posted).toEqual([{ jsonrpc: "2.0", id: "t-1", method: "parts.search", params: { keyword: "x" } }]);
    wv.receive({ jsonrpc: "2.0", id: "other", result: "ignored" }); // 無関係な id
    wv.receive({ jsonrpc: "2.0", id: "t-1", result: { items: [] } });
    await expect(p).resolves.toEqual({ items: [] });
    expect(t.pendingCount).toBe(0);
  });

  it("rejects with BridgeError on an error response (also when data arrives as a JSON string)", async () => {
    const wv = new FakeWebView();
    const t = new WebView2Transport({ webview: wv, idPrefix: "t" });
    const p = t.call("parts.search", {});
    wv.receive(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "t-1",
        error: { code: -32000, message: "db down", data: "System.Data.SqlClient.SqlException" },
      }),
    );
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BridgeError);
    expect(err).toMatchObject({
      code: -32000,
      message: "db down",
      data: "System.Data.SqlClient.SqlException",
      method: "parts.search",
    });
  });

  it("dispatches event.* notifications to subscribers", () => {
    const wv = new FakeWebView();
    const t = new WebView2Transport({ webview: wv });
    const seen: unknown[] = [];
    const off = t.on("progress", (p) => seen.push(p));
    wv.receive({ jsonrpc: "2.0", method: "event.progress", params: { percent: 10 } });
    wv.receive({ jsonrpc: "2.0", method: "event.other", params: {} });
    wv.receive("not json at all");
    expect(seen).toEqual([{ percent: 10 }]);
    off();
    wv.receive({ jsonrpc: "2.0", method: "event.progress", params: { percent: 20 } });
    expect(seen).toHaveLength(1);
  });

  it("times out pending calls", async () => {
    vi.useFakeTimers();
    const wv = new FakeWebView();
    const t = new WebView2Transport({ webview: wv, timeoutMs: 1000 });
    const p = t.call("parts.search", {});
    const settled = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = await settled;
    expect(err).toBeInstanceOf(BridgeTimeoutError);
    expect(err).toMatchObject({ method: "parts.search", timeoutMs: 1000 });
    expect(t.pendingCount).toBe(0);
  });

  it("dispose() removes the listener and rejects pending calls", async () => {
    const wv = new FakeWebView();
    const t = new WebView2Transport({ webview: wv });
    const p = t.call("parts.search", {});
    expect(wv.listenerCount).toBe(1);
    t.dispose();
    expect(wv.listenerCount).toBe(0);
    await expect(p).rejects.toThrow(/disposed/);
    await expect(t.call("x.y", {})).rejects.toThrow(/disposed/);
  });
});
