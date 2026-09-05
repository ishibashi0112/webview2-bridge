// 契約モジュール（contract.ts）とブラウザ側から import される可能性があるため、
// ここからは Node 固有 API（fs 等）に依存するものを export しない。generate / cli は別 entry。
export { defineContract, type ContractDef, type MethodDef, type NamespaceDef } from "./define.js";
export { toSchema } from "./to-schema.js";
export { emitTs, type EmitTsOptions } from "./emit-ts.js";
export { emitVb, type EmitVbOptions } from "./emit-vb.js";
export type { EmittedFile } from "./emitted.js";
export { GenerateError, type ContractSchema, type JsonSchema, type MethodSchema } from "./schema.js";
