import { z } from "zod";
import { defineContract } from "@wvbridge/gen";

/**
 * 契約定義（唯一の正）。
 * - `.meta({ id: "Part" })` を付けた object は VB 側でその名前のクラスになる（複数箇所で共有される）
 * - 名前を付けない object は `<Namespace><Method>Request/Response` などの経路名になる
 * - 日付は ISO 8601 文字列で往復する（HANDOFF.md §10）
 */
export const Part = z
  .object({
    partNo: z.string(),
    name: z.string(),
    qty: z.number().int(),
    updatedAt: z.string(), // ISO 8601
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
