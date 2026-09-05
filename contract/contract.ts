import { z } from "zod";
import { defineContract } from "@ishibashi0112/webview2-bridge-gen";

// 共有 DTO は .meta({ id }) で名前を付ける。ジェネレータはこの id を VB クラス名 / TS 型名に使う
const Part = z
  .object({
    partNo: z.string(),
    name: z.string(),
    qty: z.number().int(),
    updatedAt: z.string().describe("ISO 8601。日付は初期は文字列で往復する（HANDOFF.md §10）"),
  })
  .meta({ id: "Part" });

export const contract = defineContract({
  methods: {
    parts: {
      search: {
        input: z.object({ keyword: z.string().min(1), limit: z.number().int().optional() }),
        output: z.object({ items: z.array(Part) }),
      },
    },
  },
  events: {
    progress: z.object({ percent: z.number(), message: z.string().optional() }),
  },
});

export type Contract = typeof contract;
