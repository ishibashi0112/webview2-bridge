/**
 * テーブル行の「前後差分」を取る純粋関数。DB を知らない(Knex から取った行配列だけを扱う)。
 * キー列で行を同定し、inserted / updated / deleted に分ける。updated は変わった列だけを before / after で返す。
 */

export type Row = Record<string, unknown>;

export interface UpdatedRow {
  key: Row;
  before: Row;
  after: Row;
  /** 変わった列だけ */
  changed: Record<string, { before: unknown; after: unknown }>;
}

export interface TableDiff {
  inserted: Row[];
  updated: UpdatedRow[];
  deleted: Row[];
}

/** 値を比較可能な形に正規化する(Date → ISO 文字列、Buffer → base64、bigint → 文字列) */
export function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return `base64:${value.toString("base64")}`;
  if (value instanceof Uint8Array) return `base64:${Buffer.from(value).toString("base64")}`;
  return value;
}

/** キー列の値を連結した文字列(Map のキーに使う) */
export function keyOf(row: Row, key: readonly string[]): string {
  return JSON.stringify(key.map((k) => normalizeValue(row[k])));
}

export function pickKey(row: Row, key: readonly string[]): Row {
  const out: Row = {};
  for (const k of key) out[k] = row[k];
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  const na = normalizeValue(a);
  const nb = normalizeValue(b);
  if (na === nb) return true;
  // 数値と数値文字列(Oracle の NUMBER など)は同じとみなす
  if (typeof na === "number" && typeof nb === "string" && nb.trim() !== "" && Number(nb) === na) return true;
  if (typeof nb === "number" && typeof na === "string" && na.trim() !== "" && Number(na) === nb) return true;
  return JSON.stringify(na) === JSON.stringify(nb);
}

export function diffRows(before: readonly Row[], after: readonly Row[], key: readonly string[]): TableDiff {
  if (key.length === 0) throw new Error("diffRows: key columns are required");
  const beforeMap = new Map<string, Row>();
  for (const row of before) beforeMap.set(keyOf(row, key), row);
  const result: TableDiff = { inserted: [], updated: [], deleted: [] };
  const seen = new Set<string>();
  for (const row of after) {
    const k = keyOf(row, key);
    seen.add(k);
    const prev = beforeMap.get(k);
    if (prev === undefined) {
      result.inserted.push(row);
      continue;
    }
    const changed: UpdatedRow["changed"] = {};
    const columns = new Set([...Object.keys(prev), ...Object.keys(row)]);
    for (const col of columns) {
      if (!sameValue(prev[col], row[col])) changed[col] = { before: prev[col], after: row[col] };
    }
    if (Object.keys(changed).length > 0) result.updated.push({ key: pickKey(row, key), before: prev, after: row, changed });
  }
  for (const [k, row] of beforeMap) {
    if (!seen.has(k)) result.deleted.push(row);
  }
  return result;
}

/** レポート向けの 1 行要約 */
export function summarizeDiff(diff: TableDiff): string {
  return `inserted ${diff.inserted.length} / updated ${diff.updated.length} / deleted ${diff.deleted.length}`;
}
