import { BridgeError, JsonRpcErrorCodes } from "./transport.js";

/**
 * 業務エラー（code -32010、HANDOFF.md §5）の扱い。
 * VB 側は `Throw JsonRpcException.Business(message, field)`、モックは `throw businessError(message, { field })`。
 * 画面側は isBusinessError / isUserFacingError で「message をそのまま利用者に見せてよいエラー」を見分け、
 * errorField で結び付く入力欄（要求の JSON 名）を取る。
 */

/** 業務エラーの data。field は要求の JSON 名（camelCase）。無ければ特定の入力欄に結び付かない */
export interface BusinessErrorData {
  field?: string;
}

/** 業務エラー（-32010）か。message をそのまま利用者に見せてよい */
export function isBusinessError(e: unknown): e is BridgeError {
  return e instanceof BridgeError && e.code === JsonRpcErrorCodes.Business;
}

/** 利用者向けエラー（-32019〜-32010）か。業務エラーのほか、アプリが決めた利用者向けコード（-32011 以降）を含む */
export function isUserFacingError(e: unknown): e is BridgeError {
  return e instanceof BridgeError && e.code >= JsonRpcErrorCodes.UserFacingMin && e.code <= JsonRpcErrorCodes.UserFacingMax;
}

/** エラーが結び付く入力項目（要求の JSON 名）。利用者向けエラーでないか、data.field が文字列でなければ undefined */
export function errorField(e: unknown): string | undefined {
  if (!isUserFacingError(e)) return undefined;
  const data = e.data;
  if (typeof data !== "object" || data === null) return undefined;
  const field = (data as Record<string, unknown>)["field"];
  return typeof field === "string" && field !== "" ? field : undefined;
}

/** モック（MemoryTransport のハンドラ）用: VB の JsonRpcException.Business と同じ形の業務エラーを作る */
export function businessError(message: string, options: { field?: string; method?: string } = {}): BridgeError {
  const data: BusinessErrorData | undefined = options.field === undefined ? undefined : { field: options.field };
  return new BridgeError({ code: JsonRpcErrorCodes.Business, message, ...(data !== undefined && { data }) }, options.method);
}
