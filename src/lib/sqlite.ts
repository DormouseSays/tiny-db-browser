import initSqlJs, {
  type SqlJsStatic,
  type Database,
  type SqlValue,
} from "sql.js";

export type { SqlValue };

/** Default cap on rows pulled into the grid when browsing a table. */
export const DEFAULT_ROW_LIMIT = 200;

/**
 * sql.js compiles SQLite to WebAssembly. The wasm binary is served from
 * `public/` (copied from the sql.js dist), so `locateFile` just points at the
 * site root. Initialization is cached — the wasm is fetched and compiled once.
 */
let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: (file) => `/${file}` });
  }
  return sqlPromise;
}

export type LoadedDatabase = {
  /** The original filename, used as the tab title. */
  name: string;
  /** User table names, alphabetically sorted (internal sqlite_* tables excluded). */
  tables: string[];
  /**
   * The open sql.js handle. Kept alive for the lifetime of the tab so tables
   * can be browsed and ad-hoc queries run; call `closeDatabase` when the tab
   * is closed to free the native (wasm) memory.
   */
  db: Database;
};

/** List user table names alphabetically, excluding internal sqlite_* tables. */
export function listTables(db: Database): string[] {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result[0]?.values.map((row) => String(row[0])) ?? [];
}

/** Read a user-selected SQLite file fully into memory and list its tables. */
export async function loadSqliteFile(file: File): Promise<LoadedDatabase> {
  const SQL = await getSqlJs();
  const buffer = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));
  return { name: file.name, tables: listTables(db), db };
}

/** Free the native memory held by a loaded database's handle. */
export function closeDatabase(database: LoadedDatabase) {
  database.db.close();
}

export type QueryResult = {
  columns: string[];
  rows: SqlValue[][];
};

/**
 * Run arbitrary SQL and return the final result set. sql.js returns one result
 * per statement; we surface the last one so trailing `SELECT`s win, and an
 * empty grid for statements that yield no rows (e.g. `CREATE`, `UPDATE`).
 */
export function runQuery(db: Database, sql: string): QueryResult {
  const results = db.exec(sql);
  const last = results[results.length - 1];
  if (!last) return { columns: [], rows: [] };
  return { columns: last.columns, rows: last.values };
}

/** Quote an identifier (e.g. a table name) for safe interpolation into SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** The SQLite storage classes offered when defining a new column. */
export const COLUMN_TYPES = ["TEXT", "INTEGER", "REAL", "NUMERIC", "BLOB"] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export type ColumnDefinition = {
  name: string;
  type: ColumnType;
  primaryKey: boolean;
  notNull: boolean;
};

/**
 * Build and execute a `CREATE TABLE` statement. Identifiers are quoted; the
 * caller is responsible for having validated that the name and columns are
 * non-empty. Throws if SQLite rejects the statement (e.g. duplicate name).
 */
export function createTable(
  db: Database,
  name: string,
  columns: ColumnDefinition[],
): void {
  const defs = columns.map((column) => {
    const parts = [quoteIdentifier(column.name), column.type];
    if (column.primaryKey) parts.push("PRIMARY KEY");
    // PRIMARY KEY already implies NOT NULL, so don't emit a redundant clause.
    else if (column.notNull) parts.push("NOT NULL");
    return parts.join(" ");
  });
  db.run(`CREATE TABLE ${quoteIdentifier(name)} (${defs.join(", ")})`);
}
