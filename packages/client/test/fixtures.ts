import { z } from "zod";

// gen に依存しないよう、contract の形だけをここで再現する（defineContract は identity）
const Part = z.object({ partNo: z.string(), name: z.string(), qty: z.number().int(), updatedAt: z.string() });

export const contract = {
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
} as const;

export type Contract = typeof contract;

export const parts = [
  { partNo: "A-001", name: "Bolt M6", qty: 120, updatedAt: "2026-01-01T00:00:00Z" },
  { partNo: "A-002", name: "Nut M6", qty: 80, updatedAt: "2026-01-02T00:00:00Z" },
  { partNo: "B-100", name: "Washer", qty: 0, updatedAt: "2026-01-03T00:00:00Z" },
];
