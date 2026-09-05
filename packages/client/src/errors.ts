import type { z } from "zod";

/** Host 側から JSON-RPC error 応答が返ったとき */
export class BridgeError extends Error {
  override readonly name = "BridgeError";
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
    public readonly method?: string,
  ) {
    super(message);
  }
}

/** 送信前の入力、受信後の出力、またはイベント payload が契約（zod）に合わなかったとき */
export class BridgeValidationError extends Error {
  override readonly name = "BridgeValidationError";
  constructor(
    public readonly direction: "input" | "output" | "event",
    /** method 名（`parts.search`）またはイベント名（`progress`） */
    public readonly target: string,
    public readonly issues: z.ZodError["issues"],
  ) {
    super(`${direction} of "${target}" does not match the contract: ${summarize(issues)}`);
  }
}

/** 応答がタイムアウトしたとき（WebView2Transport） */
export class BridgeTimeoutError extends Error {
  override readonly name = "BridgeTimeoutError";
  constructor(
    public readonly method: string,
    public readonly timeoutMs: number,
  ) {
    super(`"${method}" timed out after ${timeoutMs}ms`);
  }
}

function summarize(issues: z.ZodError["issues"]): string {
  return issues
    .slice(0, 3)
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
