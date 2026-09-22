/**
 * `.env.e2e.local` / `.env.e2e` と環境変数から Knex の接続設定を組み立てる。
 * 依存を増やさないため Node 標準の util.parseEnv を使う。既にある環境変数は上書きしない(dotenv と同じ)。
 *
 *   E2E_DB_CLIENT          mssql | oracledb | pg | mysql2 | better-sqlite3
 *   E2E_DB_HOST / E2E_DB_PORT / E2E_DB_USER / E2E_DB_PASSWORD / E2E_DB_DATABASE
 *   E2E_DB_CONNECT_STRING  Oracle 用(省略時は host:port/database から組み立てる)
 *   E2E_DB_FILENAME        sqlite 用
 *   E2E_DB_OPTIONS         JSON。接続オブジェクトに深くマージする(例: {"options":{"encrypt":false}})
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { isDbClient, type DbClient } from "./guard.js";

export interface KnexLikeConfig {
  client: DbClient;
  connection: Record<string, unknown>;
  useNullAsDefault?: boolean;
  pool?: { min: number; max: number };
}

export const DEFAULT_ENV_FILES = [".env.e2e.local", ".env.e2e"] as const;

/** env ファイルを読み、未設定の変数だけ target に入れる。読んだファイルのパスを返す */
export function loadEnvFiles(baseDir: string, files: readonly string[] = DEFAULT_ENV_FILES, target: NodeJS.ProcessEnv = process.env): string[] {
  const loaded: string[] = [];
  for (const file of files) {
    const full = path.resolve(baseDir, file);
    if (!existsSync(full)) continue;
    const parsed = parseEnv(readFileSync(full, "utf8"));
    for (const [k, v] of Object.entries(parsed)) {
      if (target[k] === undefined) target[k] = v;
    }
    loaded.push(full);
  }
  return loaded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const cur = out[k];
    out[k] = isRecord(cur) && isRecord(v) ? deepMerge(cur, v) : v;
  }
  return out;
}

export class DbEnvError extends Error {
  override name = "DbEnvError";
}

/** 環境変数から Knex の設定を作る。E2E_DB_CLIENT が無ければ undefined(DB なしで動く) */
export function knexConfigFromEnv(env: NodeJS.ProcessEnv = process.env): KnexLikeConfig | undefined {
  const client = env["E2E_DB_CLIENT"]?.trim();
  if (client === undefined || client === "") return undefined;
  if (!isDbClient(client)) {
    throw new DbEnvError(`E2E_DB_CLIENT=${client} は未対応です(mssql | oracledb | pg | mysql2 | better-sqlite3)`);
  }
  const host = env["E2E_DB_HOST"];
  const port = env["E2E_DB_PORT"] !== undefined && env["E2E_DB_PORT"] !== "" ? Number(env["E2E_DB_PORT"]) : undefined;
  if (port !== undefined && !Number.isInteger(port)) throw new DbEnvError(`E2E_DB_PORT=${env["E2E_DB_PORT"]} は整数ではありません`);
  const user = env["E2E_DB_USER"];
  const password = env["E2E_DB_PASSWORD"];
  const database = env["E2E_DB_DATABASE"];
  let options: Record<string, unknown> = {};
  if (env["E2E_DB_OPTIONS"] !== undefined && env["E2E_DB_OPTIONS"].trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env["E2E_DB_OPTIONS"]);
    } catch (e) {
      throw new DbEnvError(`E2E_DB_OPTIONS が JSON として読めません: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!isRecord(parsed)) throw new DbEnvError("E2E_DB_OPTIONS は JSON オブジェクトで指定してください");
    options = parsed;
  }
  const required = (name: string, value: string | undefined): string => {
    if (value === undefined || value === "") throw new DbEnvError(`${name} が設定されていません(.env.e2e.local を確認してください)`);
    return value;
  };
  let connection: Record<string, unknown>;
  const config: KnexLikeConfig = { client, connection: {}, pool: { min: 0, max: 2 } };
  switch (client) {
    case "mssql":
      connection = {
        server: required("E2E_DB_HOST", host),
        ...(port !== undefined && { port }),
        user: required("E2E_DB_USER", user),
        password: password ?? "",
        database: required("E2E_DB_DATABASE", database),
        // 社内の SQL Server は自己署名証明書が多い。encrypt は E2E_DB_OPTIONS で明示できる
        options: { trustServerCertificate: true },
      };
      break;
    case "oracledb": {
      const connectString =
        env["E2E_DB_CONNECT_STRING"] !== undefined && env["E2E_DB_CONNECT_STRING"] !== ""
          ? env["E2E_DB_CONNECT_STRING"]
          : `${required("E2E_DB_HOST", host)}:${port ?? 1521}/${required("E2E_DB_DATABASE", database)}`;
      connection = { user: required("E2E_DB_USER", user), password: password ?? "", connectString };
      break;
    }
    case "pg":
    case "mysql2":
      connection = {
        host: required("E2E_DB_HOST", host),
        ...(port !== undefined && { port }),
        user: required("E2E_DB_USER", user),
        password: password ?? "",
        database: required("E2E_DB_DATABASE", database),
      };
      break;
    case "better-sqlite3":
      connection = { filename: required("E2E_DB_FILENAME", env["E2E_DB_FILENAME"]) };
      config.useNullAsDefault = true;
      delete config.pool;
      break;
  }
  config.connection = deepMerge(connection, options);
  return config;
}
