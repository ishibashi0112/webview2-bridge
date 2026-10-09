import { describe, expect, it } from "vitest";
import {
  BridgeError,
  JsonRpcErrorCodes,
  MemoryTransport,
  businessError,
  createClient,
  errorField,
  isBusinessError,
  isUserFacingError,
  type MemoryHandlers,
} from "../src/index.js";
import { contract, type Contract } from "./fixtures.js";

describe("business errors (HANDOFF.md §5, code -32010)", () => {
  it("businessError builds the same shape as VB JsonRpcException.Business", () => {
    const e = businessError("在庫が足りません", { field: "qty" });
    expect(e).toBeInstanceOf(BridgeError);
    expect(e.code).toBe(JsonRpcErrorCodes.Business);
    expect(e.code).toBe(-32010);
    expect(e.message).toBe("在庫が足りません");
    expect(e.data).toEqual({ field: "qty" });
    expect(e.method).toBeUndefined();
    // field 無し → data 無し（VB は data: null。どちらも errorField は undefined）
    expect(businessError("x").data).toBeUndefined();
    expect(businessError("x", { method: "a.b" }).method).toBe("a.b");
  });

  it("isBusinessError / isUserFacingError / errorField classify errors by code and data.field", () => {
    const withField = businessError("m", { field: "qty" });
    expect(isBusinessError(withField)).toBe(true);
    expect(isUserFacingError(withField)).toBe(true);
    expect(errorField(withField)).toBe("qty");
    expect(errorField(businessError("m"))).toBeUndefined();

    // アプリが決めた利用者向けコード（-32011〜-32019）は業務エラーではないが利用者向け
    const appCode = new BridgeError({ code: -32011, message: "ファイルに書き込めません" });
    expect(isBusinessError(appCode)).toBe(false);
    expect(isUserFacingError(appCode)).toBe(true);
    expect(isUserFacingError(new BridgeError({ code: -32019, message: "x" }))).toBe(true);

    // 範囲外は利用者向けではない（field があっても無視）
    const server = new BridgeError({ code: JsonRpcErrorCodes.ServerError, message: "boom", data: "System.Exception" });
    expect(isUserFacingError(server)).toBe(false);
    expect(errorField(server)).toBeUndefined();
    const outOfRange = new BridgeError({ code: -32020, message: "x", data: { field: "a" } });
    expect(isUserFacingError(outOfRange)).toBe(false);
    expect(errorField(outOfRange)).toBeUndefined();

    expect(isBusinessError(new Error("x"))).toBe(false);
    expect(isUserFacingError(undefined)).toBe(false);
    expect(errorField("nope")).toBeUndefined();
    // data.field が文字列でない / 空 / data が文字列（VB の未処理例外の型名）なら undefined
    expect(errorField(new BridgeError({ code: -32010, message: "m", data: { field: 1 } }))).toBeUndefined();
    expect(errorField(new BridgeError({ code: -32010, message: "m", data: { field: "" } }))).toBeUndefined();
    expect(errorField(new BridgeError({ code: -32010, message: "m", data: null }))).toBeUndefined();
    expect(errorField(new BridgeError({ code: -32010, message: "m", data: "field" }))).toBeUndefined();
  });

  it("reaches the screen through MemoryTransport + createClient with the method attached", async () => {
    const handlers: MemoryHandlers<Contract> = {
      parts: {
        search: (input) => {
          if (input.keyword.includes("%")) throw businessError("キーワードに % は使えません", { field: "keyword" });
          return { items: [] };
        },
      },
    };
    const client = createClient(contract, new MemoryTransport<Contract>(handlers));
    const err = await client.parts.search({ keyword: "a%" }).catch((e: unknown) => e);
    expect(isBusinessError(err)).toBe(true);
    expect(errorField(err)).toBe("keyword");
    expect((err as BridgeError).method).toBe("parts.search");
    expect((err as BridgeError).message).toBe("キーワードに % は使えません");
    expect((err as BridgeError).data).toEqual({ field: "keyword" });
  });

  it("MemoryTransport keeps an explicit method on a thrown BridgeError", async () => {
    const t = new MemoryTransport<Contract>({
      parts: {
        search: () => {
          throw new BridgeError({ code: -32001, message: "custom" }, "other.method");
        },
      },
    });
    await expect(t.call("parts.search", { keyword: "x" })).rejects.toMatchObject({ code: -32001, method: "other.method" });
  });
});
