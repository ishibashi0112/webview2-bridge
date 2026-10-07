import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineContract } from "../src/index.js";

/** ARCHITECTURE.md「契約の書き方」の契約（contract/contract.ts と同じ形） */
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

/**
 * テスト用の一時ディレクトリ。os.tmpdir() ではなくこのパッケージの中（`packages/gen/.tmp/`、git 管理外）に作る。
 * tsImport で読む契約の `import { z } from "zod"` を、実アプリと同じく自分の node_modules を遡って（ESM の経路で）
 * 解決させるため。/tmp に置くと tsx が親モジュール側へフォールバックして CJS の index.cjs を選び、Node 22.23 では
 * `Cannot find module '.../zod/index.cjs?namespace=...'` になる（2026-10-07 の初回 CI で判明）。
 */
export async function mkTempDirInPackage(prefix: string): Promise<string> {
  const base = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".tmp");
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, prefix));
}
