export { defineContract, type ContractShape, type MethodDef } from "./define.js";
export { contractToJsonSchema, CONTRACT_SCHEMA_TITLE } from "./to-schema.js";
export type { ContractSchemaDocument, JsonSchema } from "./schema-types.js";
export {
  buildContractModel,
  ContractModelError,
  EVENT_METHOD_PREFIX,
  type ContractModel,
  type DtoClassModel,
  type EnumClassModel,
  type EventModel,
  type MethodModel,
  type NamespaceModel,
  type PropertyModel,
  type TypeRef,
} from "./model.js";
export { emitTs, type EmitTsOptions } from "./emit-ts.js";
export { emitVb, vbTypeName, type EmitVbOptions } from "./emit-vb.js";
export { GENERATED_MARKER } from "./header.js";
