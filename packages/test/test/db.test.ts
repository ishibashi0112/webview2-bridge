import knexFactory, { type Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/db/index.js";

let knex: Knex;
let warnings: string[];
let db: Db;

beforeEach(async () => {
  knex = knexFactory({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
  await knex.schema.createTable("Customers", (t) => {
    t.string("CustomerCode").primary();
    t.string("Name");
  });
  await knex.schema.createTable("Orders", (t) => {
    t.increments("Id");
    t.string("OrderNo").unique();
    t.string("CustomerCode");
    t.string("Status");
    t.integer("Qty");
  });
  warnings = [];
  db = createDb(knex, { maxRows: 3, onWarning: (w) => warnings.push(w) });
});
afterEach(async () => {
  await knex.destroy();
});

describe("db helper (sqlite)", () => {
  it("insert → rows → expectRow → cleanup で消える", async () => {
    await db.insert("Customers", { CustomerCode: "E2E-1-C1", Name: "テスト顧客" });
    expect(await db.rows("Customers", { CustomerCode: "E2E-1-C1" })).toEqual([{ CustomerCode: "E2E-1-C1", Name: "テスト顧客" }]);
    await db.expectRow("Customers", { CustomerCode: "E2E-1-C1" }, { Name: "テスト顧客" });
    await expect(db.expectRow("Customers", { CustomerCode: "E2E-1-C1" }, { Name: "別名" })).rejects.toThrow(/Name: 期待 "別名" \/ 実際 "テスト顧客"/);
    await expect(db.expectRow("Customers", { CustomerCode: "nope" }, {})).rejects.toThrow(/0 行/);
    const r = await db.cleanup();
    expect(r).toEqual({ deleted: 1, failures: [] });
    expect(await db.rows("Customers")).toEqual([]);
  });

  it("snapshot → (アプリが行を作る) → diff が inserted を返し、cleanup がその行も消す", async () => {
    await db.insert("Customers", { CustomerCode: "E2E-2-C1", Name: "x" });
    const before = await db.snapshot([{ table: "Orders", key: ["OrderNo"], where: { CustomerCode: "E2E-2-C1" } }]);
    // アプリ相当: 直接 INSERT
    await knex("Orders").insert({ OrderNo: "ORD-1", CustomerCode: "E2E-2-C1", Status: "NEW", Qty: 2 });
    await knex("Orders").insert({ OrderNo: "ORD-other", CustomerCode: "OTHER", Status: "NEW", Qty: 1 });
    const diff = await db.diff(before);
    expect(diff["Orders"]?.inserted).toEqual([{ Id: 1, OrderNo: "ORD-1", CustomerCode: "E2E-2-C1", Status: "NEW", Qty: 2 }]);
    expect(diff["Orders"]?.updated).toEqual([]);
    const r = await db.cleanup();
    expect(r.deleted).toBe(2); // Orders の ORD-1 と Customers の 1 行
    expect(await db.rows("Orders")).toEqual([{ Id: 2, OrderNo: "ORD-other", CustomerCode: "OTHER", Status: "NEW", Qty: 1 }]);
  });

  it("diff は updated の変わった列と deleted を返す", async () => {
    await knex("Orders").insert([
      { OrderNo: "A", CustomerCode: "c", Status: "NEW", Qty: 1 },
      { OrderNo: "B", CustomerCode: "c", Status: "NEW", Qty: 1 },
    ]);
    const before = await db.snapshot([{ table: "Orders", key: ["OrderNo"], where: (qb) => qb.where("CustomerCode", "c") }]);
    await knex("Orders").where({ OrderNo: "A" }).update({ Status: "DONE" });
    await knex("Orders").where({ OrderNo: "B" }).delete();
    const diff = await db.diff(before);
    expect(diff["Orders"]?.updated[0]?.changed).toEqual({ Status: { before: "NEW", after: "DONE" } });
    expect(diff["Orders"]?.deleted.map((r) => r["OrderNo"])).toEqual(["B"]);
  });

  it("where 無しの snapshot は警告し、maxRows を超えると打ち切る", async () => {
    await knex("Orders").insert([1, 2, 3, 4].map((n) => ({ OrderNo: `O${n}`, CustomerCode: "c", Status: "NEW", Qty: n })));
    const snap = await db.snapshot([{ table: "Orders", key: ["OrderNo"] }]);
    expect(snap.tables["Orders"]?.truncated).toBe(true);
    expect(snap.tables["Orders"]?.rows).toHaveLength(3);
    expect(warnings.some((w) => w.includes("where が無い"))).toBe(true);
    expect(warnings.some((w) => w.includes("打ち切り"))).toBe(true);
  });

  it("query は生 SQL の行配列を返す", async () => {
    await knex("Customers").insert({ CustomerCode: "q1", Name: "n" });
    expect(await db.query("select Name from Customers where CustomerCode = ?", ["q1"])).toEqual([{ Name: "n" }]);
  });

  it("cleanup は失敗を集めて続行する", async () => {
    db.trackForCleanup("NoSuchTable", { X: 1 });
    await db.insert("Customers", { CustomerCode: "ok", Name: "n" });
    const r = await db.cleanup();
    expect(r.deleted).toBe(1);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatchObject({ table: "NoSuchTable", source: "diff" });
  });
});
