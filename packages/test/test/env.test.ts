import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DbEnvError, knexConfigFromEnv, loadEnvFiles } from "../src/db/env.js";

describe("knexConfigFromEnv", () => {
  it("E2E_DB_CLIENT が無ければ undefined", () => {
    expect(knexConfigFromEnv({})).toBeUndefined();
    expect(knexConfigFromEnv({ E2E_DB_CLIENT: " " })).toBeUndefined();
  });
  it("mssql: server / database / trustServerCertificate 既定、E2E_DB_OPTIONS を深くマージ", () => {
    const c = knexConfigFromEnv({
      E2E_DB_CLIENT: "mssql",
      E2E_DB_HOST: "db01",
      E2E_DB_PORT: "1434",
      E2E_DB_USER: "u",
      E2E_DB_PASSWORD: "p",
      E2E_DB_DATABASE: "MyApp_Test",
      E2E_DB_OPTIONS: '{"options":{"encrypt":false}}',
    });
    expect(c).toEqual({
      client: "mssql",
      pool: { min: 0, max: 2 },
      connection: { server: "db01", port: 1434, user: "u", password: "p", database: "MyApp_Test", options: { trustServerCertificate: true, encrypt: false } },
    });
  });
  it("oracledb: connectString は host:port/database から組み立て、明示があればそれ", () => {
    expect(knexConfigFromEnv({ E2E_DB_CLIENT: "oracledb", E2E_DB_HOST: "db01", E2E_DB_USER: "u", E2E_DB_DATABASE: "TESTPDB" })?.connection).toEqual({
      user: "u",
      password: "",
      connectString: "db01:1521/TESTPDB",
    });
    expect(knexConfigFromEnv({ E2E_DB_CLIENT: "oracledb", E2E_DB_USER: "u", E2E_DB_CONNECT_STRING: "alias" })?.connection).toMatchObject({ connectString: "alias" });
  });
  it("better-sqlite3: filename と useNullAsDefault", () => {
    expect(knexConfigFromEnv({ E2E_DB_CLIENT: "better-sqlite3", E2E_DB_FILENAME: ":memory:" })).toEqual({
      client: "better-sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
  });
  it("不正な値は DbEnvError", () => {
    expect(() => knexConfigFromEnv({ E2E_DB_CLIENT: "mongo" })).toThrow(DbEnvError);
    expect(() => knexConfigFromEnv({ E2E_DB_CLIENT: "pg", E2E_DB_HOST: "h", E2E_DB_USER: "u", E2E_DB_DATABASE: "d", E2E_DB_PORT: "abc" })).toThrow(/E2E_DB_PORT/);
    expect(() => knexConfigFromEnv({ E2E_DB_CLIENT: "pg", E2E_DB_USER: "u", E2E_DB_DATABASE: "d" })).toThrow(/E2E_DB_HOST/);
    expect(() => knexConfigFromEnv({ E2E_DB_CLIENT: "pg", E2E_DB_HOST: "h", E2E_DB_USER: "u", E2E_DB_DATABASE: "d", E2E_DB_OPTIONS: "[1]" })).toThrow(/オブジェクト/);
  });
});

describe("loadEnvFiles", () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  it("存在するファイルだけ読み、既にある変数は上書きしない", () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "wv2b-env-"));
    writeFileSync(path.join(dir, ".env.e2e.local"), "E2E_DB_CLIENT=mssql\nE2E_DB_HOST=local\n");
    writeFileSync(path.join(dir, ".env.e2e"), "E2E_DB_HOST=shared\nE2E_DB_USER=u\n");
    const target: NodeJS.ProcessEnv = { E2E_DB_CLIENT: "pg" };
    const loaded = loadEnvFiles(dir, undefined, target);
    expect(loaded.map((f) => path.basename(f))).toEqual([".env.e2e.local", ".env.e2e"]);
    expect(target).toEqual({ E2E_DB_CLIENT: "pg", E2E_DB_HOST: "local", E2E_DB_USER: "u" });
  });
});
