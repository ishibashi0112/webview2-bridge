import type { z } from "zod";

/** 1 メソッド: 入力と出力の zod スキーマ */
export interface MethodDef {
  input: z.ZodType;
  output: z.ZodType;
}

/** namespace → method 名 → MethodDef */
export type NamespaceDef = Record<string, MethodDef>;

/** 契約全体の形。`methods.<namespace>.<name>` と `events.<name>` */
export interface ContractDef {
  methods: Record<string, NamespaceDef>;
  events: Record<string, z.ZodType>;
}

/**
 * 契約を定義する。型を保持して返すだけの identity 関数。
 * 実行時の検証・変換は行わない（ジェネレータと client が型パラメータとして受ける）。
 */
export function defineContract<const C extends ContractDef>(contract: C): C {
  return contract;
}
