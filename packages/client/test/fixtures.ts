import { defineContract } from "@wvbridge/gen";
import { z } from "zod";

export const Part = z.object({ partNo: z.string(), name: z.string(), qty: z.number().int(), updatedAt: z.string() });

export const testContract = defineContract({
  methods: {
    parts: {
      search: {
        input: z.object({ keyword: z.string().min(1), limit: z.number().int().optional() }),
        output: z.object({ items: z.array(Part) }),
      },
      fail: {
        input: z.object({}),
        output: z.object({ ok: z.boolean() }),
      },
    },
  },
  events: {
    progress: z.object({ percent: z.number(), message: z.string().optional() }),
  },
});

export const samplePart = { partNo: "P-001", name: "Bolt", qty: 10, updatedAt: "2026-01-01T00:00:00Z" };
