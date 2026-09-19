import { camelCase, pascalCase } from "./naming.js";
import { DEFS_PREFIX, refName, type ContractSchema, type JsonSchema } from "./schema.js";
import type { EmittedFile } from "./emitted.js";

export interface EmitOpenApiOptions {
  /** `info.title`（既定 "webview2-bridge contract"） */
  title?: string;
  /** `info.version`（既定 "1.0.0"）。契約の版であり gen の版ではない */
  version?: string;
  /** すべての path の前に付ける接頭辞（既定 ""。例: "/api"）。`servers[0].url` に入れるほうが普通なので通常は空のままでよい */
  basePath?: string;
  /** イベント配信（SSE）の path（既定 "/events"）。`false` でイベント用の path を出さない */
  eventsPath?: string | false;
  /** `servers[].url`（既定 ["/"]。例: ["http://localhost:8080/api"]） */
  servers?: string[];
}

const COMPONENTS_PREFIX = "#/components/schemas/";

/** JSON-RPC error オブジェクト。HTTP では成功以外の body にこの形をそのまま載せる */
const JSON_RPC_ERROR_SCHEMA_NAME = "JsonRpcError";

/**
 * contract.schema.json → openapi.json（OpenAPI 3.1）
 *
 * HTTP へのマッピング（HANDOFF.md §10 参照）
 * - `<ns>.<name>` → `POST /<ns>/<name>`。requestBody = input、200 = output（どちらも JSON、封筒なし）
 * - 失敗は JSON-RPC の error オブジェクト `{ code, message, data }` を body にする。
 *   -32602 / -32600 / -32700 → 400、-32601 → 404、それ以外（-32000 等）→ 500
 * - イベントは `GET /events`（text/event-stream）。各 `data:` 行は postMessage と同じ JSON-RPC 通知
 *   `{ "jsonrpc": "2.0", "method": "event.<name>", "params": {...} }`
 * - `$defs` は `components/schemas` へ。メソッドの入出力も VB の DTO と同じ名前
 *   （`<Ns><Name>Request` / `<Ns><Name>Response`、イベントは `<Name>Event`）で components に置く
 */
export function emitOpenApi(schema: ContractSchema, options: EmitOpenApiOptions = {}): EmittedFile[] {
  const basePath = normalizeBasePath(options.basePath ?? "");
  const eventsPath = options.eventsPath === undefined ? "/events" : options.eventsPath;

  const components: Record<string, unknown> = {};
  for (const [id, def] of Object.entries(schema.$defs)) {
    components[id] = rewriteRefs(def);
  }

  const paths: Record<string, unknown> = {};
  const tags: { name: string; description: string }[] = [];

  for (const [ns, methods] of Object.entries(schema.methods)) {
    tags.push({ name: ns, description: `Methods of namespace \`${ns}\`` });
    for (const [name, m] of Object.entries(methods)) {
      const base = `${pascalCase(ns)}${pascalCase(name)}`;
      const requestName = `${base}Request`;
      const responseName = `${base}Response`;
      addComponent(components, requestName, m.input, `methods.${ns}.${name}.input`);
      addComponent(components, responseName, m.output, `methods.${ns}.${name}.output`);

      const operation: Record<string, unknown> = {
        operationId: camelCase(`${ns} ${name}`),
        "x-webview2-bridge-method": `${ns}.${name}`,
        tags: [ns],
      };
      operation["summary"] = typeof m.input.description === "string" ? m.input.description : `${ns}.${name}`;
      operation["requestBody"] = {
        required: true,
        content: { "application/json": { schema: { $ref: `${COMPONENTS_PREFIX}${requestName}` } } },
      };
      operation["responses"] = {
        "200": {
          description: "Success",
          content: { "application/json": { schema: { $ref: `${COMPONENTS_PREFIX}${responseName}` } } },
        },
        "400": { $ref: "#/components/responses/InvalidParams" },
        "404": { $ref: "#/components/responses/MethodNotFound" },
        "500": { $ref: "#/components/responses/ServerError" },
      };
      paths[`${basePath}/${ns}/${name}`] = { post: operation };
    }
  }

  const eventNames = Object.keys(schema.events);
  const notificationSchemas: unknown[] = [];
  for (const name of eventNames) {
    const eventName = `${pascalCase(name)}Event`;
    addComponent(components, eventName, schema.events[name]!, `events.${name}`);
    notificationSchemas.push({
      type: "object",
      properties: {
        jsonrpc: { type: "string", const: "2.0" },
        method: { type: "string", const: `event.${name}` },
        params: { $ref: `${COMPONENTS_PREFIX}${eventName}` },
      },
      required: ["jsonrpc", "method", "params"],
    });
  }

  if (eventsPath !== false && eventNames.length > 0) {
    tags.push({ name: "events", description: "Host → Web notifications (Server-Sent Events)" });
    paths[`${basePath}${normalizeBasePath(eventsPath)}`] = {
      get: {
        operationId: "events",
        tags: ["events"],
        summary: "Server-Sent Events. Each `data:` line is one JSON-RPC notification (same as the postMessage wire format)",
        responses: {
          "200": {
            description: "Event stream",
            content: {
              "text/event-stream": {
                schema: notificationSchemas.length === 1 ? notificationSchemas[0] : { oneOf: notificationSchemas },
              },
            },
          },
        },
      },
    };
  }

  components[JSON_RPC_ERROR_SCHEMA_NAME] = {
    type: "object",
    description: "JSON-RPC 2.0 error object. Same shape as the `error` member over postMessage",
    properties: {
      code: { type: "integer", description: "-32700 Parse, -32600 Invalid Request, -32601 Method not found, -32602 Invalid params, -32000.. application" },
      message: { type: "string" },
      data: { description: "Unhandled server exceptions put the exception type name here" },
    },
    required: ["code", "message"],
  };

  const errorResponse = (description: string): unknown => ({
    description,
    content: { "application/json": { schema: { $ref: `${COMPONENTS_PREFIX}${JSON_RPC_ERROR_SCHEMA_NAME}` } } },
  });

  const doc = {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "webview2-bridge contract",
      version: options.version ?? "1.0.0",
      description:
        "Generated by @ishibashi0112/webview2-bridge-gen from contract.schema.json. " +
        "Every contract method is `POST /<namespace>/<method>` with the input as JSON body and the output as JSON response. " +
        `Errors carry a JSON-RPC error object (${JSON_RPC_ERROR_SCHEMA_NAME}) in the body.`,
    },
    servers: (options.servers ?? ["/"]).map((url) => ({ url })),
    tags,
    // 認証などの横断事項は契約に含めない（配備側で決め、HttpTransport の headers / credentials で付ける）
    security: [],
    paths,
    components: {
      schemas: components,
      responses: {
        InvalidParams: errorResponse("Invalid params (JSON-RPC -32602), invalid request (-32600) or parse error (-32700)"),
        MethodNotFound: errorResponse("Method not found (JSON-RPC -32601)"),
        ServerError: errorResponse("Unhandled server error (JSON-RPC -32000 or other application-defined code)"),
      },
    },
    "x-webview2-bridge": {
      contractVersion: schema.contractVersion,
      events: eventNames.map((name) => ({ name, method: `event.${name}`, schema: `${COMPONENTS_PREFIX}${pascalCase(name)}Event` })),
    },
  };

  return [{ path: "openapi.json", content: JSON.stringify(doc, null, 2) + "\n" }];
}

/** `#/$defs/X` への参照なら components 側の名前で参照し、そうでなければ中身を（参照を書き換えて）置く */
function addComponent(components: Record<string, unknown>, name: string, node: JsonSchema, path: string): void {
  if (node.$ref !== undefined) {
    const target = refName(node.$ref);
    if (target === name) return; // .meta({ id }) の名前が DTO 名と一致している
    // 名前付きスキーマがそのまま入出力になっている場合は alias として置く（同じ名前を 2 つ生成しない）
    components[name] = { $ref: `${COMPONENTS_PREFIX}${target}`, description: `Alias of ${target} (${path})` };
    return;
  }
  if (name in components) {
    throw new Error(`OpenAPI component name collision: "${name}" (${path}). Use .meta({ id }) with a different name`);
  }
  components[name] = rewriteRefs(node);
}

/** `#/$defs/X` → `#/components/schemas/X` を再帰的に書き換える（元のオブジェクトは変更しない） */
function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "$ref" && typeof v === "string" && v.startsWith(DEFS_PREFIX)) {
      out[k] = `${COMPONENTS_PREFIX}${v.slice(DEFS_PREFIX.length)}`;
    } else {
      out[k] = rewriteRefs(v);
    }
  }
  return out;
}

/** "" / "/api" / "api/" → "" / "/api" / "/api" */
function normalizeBasePath(p: string): string {
  const trimmed = p.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
