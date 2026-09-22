import { describe, expect, it } from "vitest";
import { checkAllowed, describeConnection, oracleServiceName } from "../src/db/guard.js";

describe("describeConnection", () => {
  it("mssql は server/database", () => {
    const d = describeConnection("mssql", { server: "db01", database: "MyApp_Test" });
    expect(d).toMatchObject({ database: "MyApp_Test", host: "db01", label: "mssql db01/MyApp_Test" });
  });
  it("oracledb は connectString からサービス名", () => {
    expect(oracleServiceName("db01:1521/TESTPDB")).toEqual({ host: "db01", service: "TESTPDB" });
    expect(oracleServiceName("db01/TESTPDB")).toEqual({ host: "db01", service: "TESTPDB" });
    expect(oracleServiceName("TNSALIAS")).toEqual({ service: "TNSALIAS" });
    expect(describeConnection("oracledb", { connectString: "db01:1521/TESTPDB" }).database).toBe("TESTPDB");
  });
  it("sqlite はファイル名", () => {
    expect(describeConnection("better-sqlite3", { filename: "/tmp/x/test.db" }).database).toBe("/tmp/x/test.db");
  });
});

describe("checkAllowed", () => {
  const mssql = describeConnection("mssql", { server: "db01", database: "MyApp_Test" });
  it("許可リストが空なら止める", () => {
    const r = checkAllowed(mssql, []);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/allowedDatabases が空/);
  });
  it("DB 名(大文字小文字を無視)か host/DB で一致", () => {
    expect(checkAllowed(mssql, ["myapp_test"]).ok).toBe(true);
    expect(checkAllowed(mssql, ["DB01/MyApp_Test"]).ok).toBe(true);
    expect(checkAllowed(mssql, ["db02/MyApp_Test"]).ok).toBe(false);
    expect(checkAllowed(mssql, ["MyApp"]).ok).toBe(false);
  });
  it("一致しなければ理由付きで止める", () => {
    const r = checkAllowed(mssql, ["MyApp_Prod"]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/MyApp_Test/);
    expect(r.reason).toMatch(/MyApp_Prod/);
  });
  it("sqlite はファイル名の末尾一致も許す", () => {
    const sqlite = describeConnection("better-sqlite3", { filename: "/tmp/x/test.db" });
    expect(checkAllowed(sqlite, ["test.db"]).ok).toBe(true);
    expect(checkAllowed(sqlite, [":memory:"]).ok).toBe(false);
    expect(checkAllowed(describeConnection("better-sqlite3", { filename: ":memory:" }), [":memory:"]).ok).toBe(true);
  });
});
