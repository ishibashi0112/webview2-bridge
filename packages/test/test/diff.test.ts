import { describe, expect, it } from "vitest";
import { diffRows, keyOf, normalizeValue, summarizeDiff } from "../src/db/diff.js";

describe("diffRows", () => {
  it("inserted / updated / deleted を分ける", () => {
    const before = [
      { OrderNo: "A1", Status: "NEW", Qty: 1 },
      { OrderNo: "A2", Status: "NEW", Qty: 2 },
      { OrderNo: "A3", Status: "NEW", Qty: 3 },
    ];
    const after = [
      { OrderNo: "A1", Status: "DONE", Qty: 1 },
      { OrderNo: "A3", Status: "NEW", Qty: 3 },
      { OrderNo: "A4", Status: "NEW", Qty: 4 },
    ];
    const d = diffRows(before, after, ["OrderNo"]);
    expect(d.inserted).toEqual([{ OrderNo: "A4", Status: "NEW", Qty: 4 }]);
    expect(d.deleted).toEqual([{ OrderNo: "A2", Status: "NEW", Qty: 2 }]);
    expect(d.updated).toHaveLength(1);
    expect(d.updated[0]?.key).toEqual({ OrderNo: "A1" });
    expect(d.updated[0]?.changed).toEqual({ Status: { before: "NEW", after: "DONE" } });
    expect(summarizeDiff(d)).toBe("inserted 1 / updated 1 / deleted 1");
  });

  it("複合キーで同定する", () => {
    const before = [{ A: 1, B: "x", V: 1 }];
    const after = [
      { A: 1, B: "x", V: 1 },
      { A: 1, B: "y", V: 1 },
    ];
    const d = diffRows(before, after, ["A", "B"]);
    expect(d.inserted).toEqual([{ A: 1, B: "y", V: 1 }]);
    expect(d.updated).toEqual([]);
  });

  it("Date は ISO 文字列で比べ、同じ時刻なら変更なし", () => {
    const t = new Date("2026-09-22T01:02:03Z");
    const d = diffRows([{ K: 1, At: t }], [{ K: 1, At: new Date(t.getTime()) }], ["K"]);
    expect(d.updated).toEqual([]);
    expect(normalizeValue(t)).toBe("2026-09-22T01:02:03.000Z");
  });

  it("数値と数値文字列(Oracle の NUMBER 等)は同じとみなす。undefined と null も同じ", () => {
    const d = diffRows([{ K: 1, N: 10, X: undefined }], [{ K: 1, N: "10", X: null }], ["K"]);
    expect(d.updated).toEqual([]);
  });

  it("Buffer は base64 で比べる", () => {
    expect(keyOf({ K: Buffer.from("ab") }, ["K"])).toBe(JSON.stringify(["base64:YWI="]));
    const d = diffRows([{ K: 1, B: Buffer.from("ab") }], [{ K: 1, B: Buffer.from("ac") }], ["K"]);
    expect(d.updated[0]?.changed["B"]).toBeDefined();
  });

  it("key が空なら例外", () => {
    expect(() => diffRows([], [], [])).toThrow(/key/);
  });
});
