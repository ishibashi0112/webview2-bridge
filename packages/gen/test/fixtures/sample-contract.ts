// HANDOFF.md §6 の契約（contract/contract.ts と同じ内容）
import { z } from "zod";
import { defineContract } from "../../src/define.js";

export const Part = z
  .object({
    partNo: z.string(),
    name: z.string(),
    qty: z.number().int(),
    updatedAt: z.string(),
  })
  .meta({ id: "Part" });

export const sampleContract = defineContract({
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
