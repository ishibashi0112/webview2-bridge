import { BridgeError, JsonRpcErrorCodes, type MemoryHandlers } from "@ishibashi0112/webview2-bridge-client";
import type { Contract } from "@webview2-bridge/contract";
import type { Part } from "../generated/contract-types";

const parts: Part[] = [
  { partNo: "A-001", name: "Bolt M6x20", qty: 120, updatedAt: "2026-01-05T09:00:00Z" },
  { partNo: "A-002", name: "Nut M6", qty: 80, updatedAt: "2026-01-06T09:00:00Z" },
  { partNo: "A-003", name: "Washer M6", qty: 0, updatedAt: "2026-01-07T09:00:00Z" },
  { partNo: "B-100", name: "Bearing 6201", qty: 12, updatedAt: "2026-02-01T09:00:00Z" },
  { partNo: "B-101", name: "Bearing 6202", qty: 7, updatedAt: "2026-02-02T09:00:00Z" },
  { partNo: "C-500", name: "Gasket 50mm", qty: 300, updatedAt: "2026-03-01T09:00:00Z" },
  { partNo: "C-501", name: "Gasket 60mm", qty: 250, updatedAt: "2026-03-02T09:00:00Z" },
  { partNo: "D-900", name: "Motor 200W", qty: 3, updatedAt: "2026-04-01T09:00:00Z" },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * MemoryTransport 用のモック実装。ブラウザ単体（pnpm --filter web dev）で UI を動かすためのもの。
 * VB 側の PartsApi と同じ振る舞いになるよう保つ。
 */
export const handlers: MemoryHandlers<Contract> = {
  parts: {
    search: async (input, { emit }) => {
      // "error" で検索すると VB 側の例外相当（-32000）を返す
      if (input.keyword.toLowerCase() === "error") {
        throw new BridgeError({ code: JsonRpcErrorCodes.ServerError, message: "Simulated failure", data: "System.InvalidOperationException" });
      }
      emit("progress", { percent: 0, message: "検索開始" });
      await sleep(150);
      emit("progress", { percent: 50, message: `"${input.keyword}" を検索中` });
      await sleep(150);
      const kw = input.keyword.toLowerCase();
      const hit = parts.filter((p) => p.partNo.toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw));
      emit("progress", { percent: 100, message: `${hit.length} 件` });
      return { items: hit.slice(0, input.limit ?? hit.length) };
    },
  },
};
