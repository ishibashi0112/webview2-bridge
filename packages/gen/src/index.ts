// 契約モジュール（contract.ts）とブラウザ側から import される可能性があるため、
// ここからは Node 固有 API（fs 等）に依存するものを export しない。generate / cli は別 entry。
export { type ContractDef, defineContract, type MethodDef, type NamespaceDef } from "./define.js";
export { type EmitOpenApiOptions, emitOpenApi } from "./emit-openapi.js";
export { type EmitTsOptions, emitTs } from "./emit-ts.js";
export { type EmitVbOptions, emitVb } from "./emit-vb.js";
export type { EmittedFile } from "./emitted.js";
export { type ContractSchema, GenerateError, type JsonSchema, type MethodSchema } from "./schema.js";
export { toSchema } from "./to-schema.js";
