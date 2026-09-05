// 型マッピングを網羅する契約: enum / nullable / optional 値型 / ネスト object / 配列要素 object / int64 / 複数 namespace
import { z } from "zod";
import { defineContract } from "../../src/define.js";

export const OrderStatus = z.enum(["open", "in-progress", "closed"]).meta({ id: "OrderStatus" });

export const Address = z
  .object({
    zip: z.string(),
    line1: z.string(),
    line2: z.string().nullable(),
  })
  .meta({ id: "Address" });

export const kitchenSinkContract = defineContract({
  methods: {
    orders: {
      list: {
        input: z.object({
          status: OrderStatus.optional(),
          kind: z.enum(["a", "b"]),
          page: z.number().int().optional(),
          pageSize: z.number().int(),
          includeClosed: z.boolean().optional(),
          minTotal: z.number().nullable(),
          bigId: z.number().int().meta({ format: "int64" }),
        }),
        output: z.object({
          total: z.number().int(),
          rows: z.array(
            z.object({
              orderNo: z.string(),
              status: OrderStatus,
              shipTo: Address,
              billTo: Address.nullable(),
              lines: z.array(z.object({ sku: z.string(), qty: z.number().int(), unitPrice: z.number() })),
              tags: z.array(z.string()),
              memo: z.object({ text: z.string(), date: z.string().optional() }).optional(),
            }),
          ),
        }),
      },
      cancel: {
        input: z.object({ orderNo: z.string(), reason: z.string().optional() }),
        output: z.object({ ok: z.boolean() }),
      },
    },
    "master-data": {
      getAddress: {
        input: z.object({ id: z.string() }),
        output: Address,
      },
    },
  },
  events: {
    orderChanged: z.object({ orderNo: z.string(), status: OrderStatus }),
    heartbeat: z.object({ at: z.string(), seq: z.number().int() }),
  },
});
