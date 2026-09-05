import type { z } from "zod";

/** 1 メソッドの契約。input / output は zod スキーマ。 */
export interface MethodDef {
  input: z.ZodType;
  output: z.ZodType;
}

/**
 * 契約全体の形。
 * - methods: `<namespace>.<name>` → { input, output }
 * - events:  `<name>` → payload（Host → Web の通知。ワイヤ上は `event.<name>`）
 */
export interface ContractShape {
  methods: Record<string, Record<string, MethodDef>>;
  events: Record<string, z.ZodType>;
}

/**
 * 契約を定義する。型を保持して返すだけの identity 関数。
 * ジェネレータとフロント側ランタイムはこの戻り値（またはそこから生成した JSON Schema）を読む。
 */
export function defineContract<const C extends ContractShape>(contract: C): C {
  return contract;
}
