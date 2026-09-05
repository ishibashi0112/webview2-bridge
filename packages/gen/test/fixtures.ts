import { z } from "zod";
import { defineContract } from "../src/index.js";

/** HANDOFF.md §6 の契約（contract/contract.ts と同じ形） */
export const sampleContract = (() => {
  const Part = z
    .object({
      partNo: z.string(),
      name: z.string(),
      qty: z.number().int(),
      updatedAt: z.string().describe("ISO 8601"),
    })
    .meta({ id: "Part" });
  return defineContract({
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
})();

/** 対応している型をひととおり含む契約 */
export const kitchenSinkContract = (() => {
  const Status = z.enum(["open", "in-progress", "closed", "2nd"]).meta({ id: "Status" });
  const Address = z
    .object({ line1: z.string(), line2: z.string().optional(), zip: z.string().nullable() })
    .meta({ id: "Address" });
  const Customer = z
    .object({
      id: z.number().int(),
      name: z.string(),
      status: Status,
      address: Address.optional(),
      tags: z.array(z.string()),
      scores: z.array(z.number()).optional(),
      attributes: z.record(z.string(), z.string()),
      extra: z.unknown(),
      date: z.string().describe("VB 予約語の回避を確認する"),
      end: z.boolean().optional(),
      snake_case_name: z.string(),
      nullableInt: z.number().int().nullable(),
      optionalNullableInt: z.number().int().optional().nullable(),
      kind: z.enum(["a", "b"]),
      children: z.array(z.object({ childId: z.string(), weight: z.number().optional() })),
      meta: z.object({ createdBy: z.string() }).optional(),
    })
    .meta({ id: "Customer" });
  return defineContract({
    methods: {
      customers: {
        list: {
          input: z.object({ page: z.number().int().optional() }).describe("顧客一覧を取得する"),
          output: z.object({ items: z.array(Customer), total: z.number().int() }),
        },
        save: {
          input: z.object({ customer: Customer }),
          output: z.object({ ok: z.boolean() }),
        },
      },
      system: {
        ping: {
          input: z.object({}),
          output: z.object({ time: z.string() }),
        },
      },
    },
    events: {
      customerChanged: z.object({ id: z.number().int(), status: Status }),
      log: z.object({ level: z.enum(["info", "warn"]), text: z.string() }),
    },
  });
})();
