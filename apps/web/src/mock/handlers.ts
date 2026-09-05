/**
 * MemoryTransport 用のモックハンドラ。ブラウザ単体で UI を動かすときの「VB 側」。
 * 契約から型付けされるので、契約を変えるとここもコンパイルエラーで追従を促される。
 */
import type { MemoryHandlers } from "@wvbridge/client";
import type { Contract } from "@wvbridge/contract";
import type { PartsSearchOutput } from "../generated/contract-types";

type Part = PartsSearchOutput["items"][number];

const PARTS: Part[] = [
  { partNo: "P-0001", name: "六角ボルト M6x20", qty: 1200, updatedAt: "2026-08-30T09:12:00+09:00" },
  { partNo: "P-0002", name: "六角ナット M6", qty: 3400, updatedAt: "2026-08-30T09:12:00+09:00" },
  { partNo: "P-0003", name: "平ワッシャー M6", qty: 5000, updatedAt: "2026-08-28T15:40:00+09:00" },
  { partNo: "P-0010", name: "ベアリング 6203ZZ", qty: 86, updatedAt: "2026-09-01T11:05:00+09:00" },
  { partNo: "P-0011", name: "ベアリング 6204ZZ", qty: 42, updatedAt: "2026-09-01T11:05:00+09:00" },
  { partNo: "P-0020", name: "Oリング P10", qty: 900, updatedAt: "2026-07-14T08:00:00+09:00" },
  { partNo: "P-0021", name: "Oリング P14", qty: 650, updatedAt: "2026-07-14T08:00:00+09:00" },
  { partNo: "P-0030", name: "ステッピングモーター 42mm", qty: 12, updatedAt: "2026-09-03T17:30:00+09:00" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockHandlers(): MemoryHandlers<Contract> {
  return {
    parts: {
      search: async (input, ctx) => {
        // 進捗イベントを数回に分けて発火して、UI 側の受信表示を確認できるようにする
        const steps = [10, 45, 80, 100];
        for (const percent of steps) {
          await sleep(120);
          ctx.emit("progress", { percent, message: percent < 100 ? `検索中 ${input.keyword}` : "完了" });
        }
        if (input.keyword.toLowerCase() === "error") {
          throw new Error("モック: 意図的なサーバーエラー");
        }
        const kw = input.keyword.toLowerCase();
        const items = PARTS.filter((p) => p.partNo.toLowerCase().includes(kw) || p.name.toLowerCase().includes(kw));
        return { items: items.slice(0, input.limit ?? items.length) };
      },
    },
  };
}
