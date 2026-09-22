/**
 * 本番 DB に向けてテストが走らないためのガード。
 * 接続設定から「どの DB か」を 1 つの文字列に要約し、許可リスト(allowedDatabases)と照合する。
 * 許可リストの各項目は、DB 名(大文字小文字を区別しない)か `host/DB名` のどちらかに一致すればよい。
 */

export type DbClient = "mssql" | "oracledb" | "pg" | "mysql2" | "better-sqlite3";

export interface ConnectionDescription {
  client: DbClient;
  /** DB 名(sqlite はファイル名、Oracle はサービス名) */
  database: string;
  host?: string | undefined;
  /** 人が読む用: client host/database */
  label: string;
}

export function isDbClient(value: unknown): value is DbClient {
  return value === "mssql" || value === "oracledb" || value === "pg" || value === "mysql2" || value === "better-sqlite3";
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Oracle の connectString(`host:port/service` や `host/service`、tnsnames の別名)からサービス名を取り出す */
export function oracleServiceName(connectString: string): { host?: string | undefined; service: string } {
  const slash = connectString.lastIndexOf("/");
  if (slash < 0) return { service: connectString };
  const hostPort = connectString.slice(0, slash);
  const colon = hostPort.indexOf(":");
  return { host: colon >= 0 ? hostPort.slice(0, colon) : hostPort, service: connectString.slice(slash + 1) };
}

export function describeConnection(client: DbClient, connection: Record<string, unknown>): ConnectionDescription {
  switch (client) {
    case "mssql": {
      const host = str(connection["server"]) ?? str(connection["host"]);
      const database = str(connection["database"]) ?? "";
      return { client, database, host, label: `${client} ${host ?? "?"}/${database || "?"}` };
    }
    case "oracledb": {
      const cs = str(connection["connectString"]) ?? "";
      const { host, service } = oracleServiceName(cs);
      return { client, database: service, host, label: `${client} ${cs || "?"}` };
    }
    case "pg":
    case "mysql2": {
      const host = str(connection["host"]);
      const database = str(connection["database"]) ?? "";
      return { client, database, host, label: `${client} ${host ?? "?"}/${database || "?"}` };
    }
    case "better-sqlite3": {
      const database = str(connection["filename"]) ?? "";
      return { client, database, label: `${client} ${database || "?"}` };
    }
  }
}

export interface GuardResult {
  ok: boolean;
  description: ConnectionDescription;
  reason?: string;
}

export function checkAllowed(description: ConnectionDescription, allowedDatabases: readonly string[]): GuardResult {
  if (allowedDatabases.length === 0) {
    return { ok: false, description, reason: "allowedDatabases が空です。テスト DB の名前を e2e.config.ts の db.allowedDatabases に書いてください(本番 DB に向けて走らせないためのガードです)" };
  }
  const db = description.database.toLowerCase();
  const hostDb = description.host !== undefined ? `${description.host.toLowerCase()}/${db}` : undefined;
  for (const entry of allowedDatabases) {
    const e = entry.trim().toLowerCase();
    if (e === "") continue;
    if (e === db || (hostDb !== undefined && e === hostDb)) return { ok: true, description };
    // sqlite はファイル名の末尾一致も許す(相対 / 絶対の差を吸収)
    if (description.client === "better-sqlite3" && (db.endsWith(e) || db.endsWith(`/${e}`) || db.endsWith(`\\${e}`))) {
      return { ok: true, description };
    }
  }
  return {
    ok: false,
    description,
    reason: `接続先 ${description.label} は allowedDatabases [${allowedDatabases.join(", ")}] に含まれていません。テスト DB ではない可能性があるため停止します`,
  };
}
