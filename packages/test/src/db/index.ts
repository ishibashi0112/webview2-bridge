/**
 * テスト本文に `db` として渡る DB ヘルパ。Knex を薄く包み、方言は Knex に任せる。
 * - insert で入れた行と、diff で「増えた」と判定した行を記録し、cleanup() で逆順に削除する(後片付け)
 * - snapshot / diff はテーブル行の前後比較(db/diff.ts の純粋関数)
 */
import type { Knex } from "knex";
import { diffRows, pickKey, summarizeDiff, type Row, type TableDiff } from "./diff.js";

export interface SnapshotSpec {
  table: string;
  /** 行を同定するキー列 */
  key: string[];
  /** 絞り込み(通常は testId 接頭辞)。省略すると全行(maxRows で打ち切り) */
  where?: Row | ((qb: Knex.QueryBuilder) => Knex.QueryBuilder) | undefined;
}

export interface TableSnapshot {
  spec: SnapshotSpec;
  rows: Row[];
  /** maxRows を超えて打ち切った(diff は信頼できない) */
  truncated: boolean;
}

export interface DbSnapshot {
  takenAt: string;
  tables: Record<string, TableSnapshot>;
}

export type DbDiff = Record<string, TableDiff>;

export interface CleanupEntry {
  table: string;
  where: Row;
  /** 何によって記録されたか */
  source: "insert" | "diff";
}

export interface CleanupFailure extends CleanupEntry {
  error: string;
}

export interface CleanupResult {
  deleted: number;
  failures: CleanupFailure[];
}

export interface DbOptions {
  /** snapshot で where を省略したときに読む最大行数(既定 5000) */
  maxRows?: number | undefined;
  /** diff を取ったときに呼ばれる(レポート添付用) */
  onDiff?: ((diff: DbDiff, snapshot: DbSnapshot) => void | Promise<void>) | undefined;
  /** snapshot の where 省略など、注意事項を受け取る */
  onWarning?: ((message: string) => void) | undefined;
}

export interface Db {
  /** 生の Knex。ヘルパに無いことをするとき用 */
  readonly knex: Knex;
  /** 生 SQL(読み取り用)。バインドは `?` */
  query<T extends Row = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** 前提行を入れる。後片付けの対象に記録する(行の全列を where にして削除する) */
  insert(table: string, row: Row): Promise<void>;
  insertMany(table: string, rows: readonly Row[]): Promise<void>;
  /** 条件に合う行を取る */
  rows<T extends Row = Row>(table: string, where?: Row): Promise<T[]>;
  /** 現在の行を控える */
  snapshot(specs: readonly SnapshotSpec[]): Promise<DbSnapshot>;
  /** 控えと現在を比べる。増えた行は後片付けの対象に記録する */
  diff(snapshot: DbSnapshot): Promise<DbDiff>;
  /** 1 行取って部分一致を確かめる。無い / 複数 / 不一致は例外 */
  expectRow(table: string, where: Row, expected: Row): Promise<Row>;
  /** 記録した行を逆順に削除する(フィクスチャが自動で呼ぶ) */
  cleanup(): Promise<CleanupResult>;
  /** 後片付けの対象を手で足す(アプリが作った行を diff 以外で知っているとき) */
  trackForCleanup(table: string, where: Row): void;
}

function fmt(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

export function createDb(knex: Knex, options: DbOptions = {}): Db {
  const maxRows = options.maxRows ?? 5000;
  const cleanupEntries: CleanupEntry[] = [];

  const applyWhere = (qb: Knex.QueryBuilder, where: SnapshotSpec["where"]): Knex.QueryBuilder => {
    if (where === undefined) return qb;
    if (typeof where === "function") return where(qb);
    return qb.where(where);
  };

  const db: Db = {
    knex,
    async query<T extends Row = Row>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const result: unknown = await knex.raw(sql, [...params] as Knex.RawBinding[]);
      return normalizeRawResult(knex, result) as T[];
    },
    async insert(table, row) {
      await knex(table).insert(row);
      cleanupEntries.push({ table, where: { ...row }, source: "insert" });
    },
    async insertMany(table, rows) {
      for (const row of rows) await db.insert(table, row);
    },
    async rows<T extends Row = Row>(table: string, where: Row = {}): Promise<T[]> {
      return (await knex(table).where(where).select("*")) as T[];
    },
    async snapshot(specs) {
      const tables: Record<string, TableSnapshot> = {};
      for (const spec of specs) {
        if (spec.key.length === 0) throw new Error(`snapshot: ${spec.table} の key が空です`);
        if (spec.where === undefined) {
          options.onWarning?.(`snapshot(${spec.table}): where が無いので全行(最大 ${maxRows} 行)を読みます。testId で絞ることを勧めます`);
        }
        const rows = (await applyWhere(knex(spec.table), spec.where).select("*").limit(maxRows + 1)) as Row[];
        const truncated = rows.length > maxRows;
        if (truncated) {
          rows.length = maxRows;
          options.onWarning?.(`snapshot(${spec.table}): ${maxRows} 行を超えたため打ち切りました。diff は信頼できません`);
        }
        tables[spec.table] = { spec, rows, truncated };
      }
      return { takenAt: new Date().toISOString(), tables };
    },
    async diff(snapshot) {
      const result: DbDiff = {};
      for (const [table, snap] of Object.entries(snapshot.tables)) {
        const rows = (await applyWhere(knex(table), snap.spec.where).select("*").limit(maxRows + 1)) as Row[];
        if (rows.length > maxRows) rows.length = maxRows;
        const d = diffRows(snap.rows, rows, snap.spec.key);
        result[table] = d;
        for (const inserted of d.inserted) {
          cleanupEntries.push({ table, where: pickKey(inserted, snap.spec.key), source: "diff" });
        }
      }
      await options.onDiff?.(result, snapshot);
      return result;
    },
    async expectRow(table, where, expected) {
      const rows = await db.rows(table, where);
      if (rows.length !== 1) {
        throw new Error(`expectRow(${table} where ${JSON.stringify(where)}): ${rows.length} 行でした(1 行を期待)`);
      }
      const row = rows[0]!;
      const mismatches: string[] = [];
      const d = diffRows([{ ...row, ...expected }], [row], Object.keys(where).length > 0 ? Object.keys(where) : Object.keys(row));
      for (const u of d.updated) {
        for (const [col, c] of Object.entries(u.changed)) mismatches.push(`${col}: 期待 ${fmt(c.before)} / 実際 ${fmt(c.after)}`);
      }
      if (mismatches.length > 0) throw new Error(`expectRow(${table}): 不一致\n  ${mismatches.join("\n  ")}`);
      return row;
    },
    trackForCleanup(table, where) {
      cleanupEntries.push({ table, where: { ...where }, source: "diff" });
    },
    async cleanup() {
      const failures: CleanupFailure[] = [];
      let deleted = 0;
      // 逆順(外部キー: 子 → 親)。同じ行を二重に記録していても 2 回目は 0 件削除で済む
      for (const entry of [...cleanupEntries].reverse()) {
        try {
          deleted += await knex(entry.table).where(entry.where).delete();
        } catch (e) {
          failures.push({ ...entry, error: e instanceof Error ? e.message : String(e) });
        }
      }
      cleanupEntries.length = 0;
      return { deleted, failures };
    },
  };
  return db;
}

/** knex.raw の戻り値は方言ごとに形が違う。行配列に揃える */
export function normalizeRawResult(knex: Knex, result: unknown): Row[] {
  const client = (knex.client as { config?: { client?: string } }).config?.client;
  if (client === "pg") {
    const r = result as { rows?: Row[] };
    return r.rows ?? [];
  }
  if (client === "mysql2") {
    const r = result as [unknown, unknown];
    return Array.isArray(r) && Array.isArray(r[0]) ? (r[0] as Row[]) : [];
  }
  if (client === "oracledb") {
    return Array.isArray(result) ? (result as Row[]) : [];
  }
  // mssql / better-sqlite3 は行配列
  return Array.isArray(result) ? (result as Row[]) : [];
}

export { diffRows, summarizeDiff, type Row, type TableDiff };
