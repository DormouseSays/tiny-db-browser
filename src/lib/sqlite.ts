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

/**
 * Serialize an open database back to a SQLite file image. The bytes mirror the
 * on-disk format, so the result can be written straight to a `.sqlite` file or
 * re-opened with `loadSqliteFile`, edits and all.
 */
export function exportDatabase(db: Database): Uint8Array {
  return db.export();
}

export type QueryResult = {
  columns: string[];
  rows: SqlValue[][];
};

/**
 * Run arbitrary SQL and return the final result set. We step through the
 * statements one at a time and surface the last row-producing one, so a
 * trailing `SELECT` wins. Unlike `db.exec`, this reports the column names of a
 * query even when it matches zero rows — letting the grid show headers for an
 * empty table. Statements that yield no columns (e.g. `CREATE`, `UPDATE`) are
 * executed for their side effects but leave the result an empty grid.
 */
export function runQuery(db: Database, sql: string): QueryResult {
  let last: QueryResult = { columns: [], rows: [] };
  for (const statement of db.iterateStatements(sql)) {
    const columns = statement.getColumnNames();
    if (columns.length > 0) {
      const rows: SqlValue[][] = [];
      while (statement.step()) rows.push(statement.get());
      last = { columns, rows };
    } else {
      // Side-effecting statement (CREATE/INSERT/UPDATE/…); run it and move on.
      statement.step();
    }
  }
  return last;
}

/** A table's rows plus the rowid of each, so individual rows can be updated. */
export type TableData = QueryResult & { rowIds: SqlValue[] };

/**
 * Read up to `limit` rows from a table along with each row's rowid. The rowid
 * is pulled as a leading hidden column so callers can target a specific row in
 * an UPDATE without relying on a primary key. Throws for WITHOUT ROWID tables,
 * which have no rowid.
 */
export function readTable(
  db: Database,
  table: string,
  limit = DEFAULT_ROW_LIMIT,
): TableData {
  const full = runQuery(
    db,
    `SELECT rowid AS _tdb_rowid, * FROM ${quoteIdentifier(table)} LIMIT ${limit}`,
  );
  return {
    columns: full.columns.slice(1),
    rows: full.rows.map((row) => row.slice(1)),
    rowIds: full.rows.map((row) => row[0]),
  };
}

/**
 * Update a single row, identified by its rowid, setting the given columns to
 * new values. Identifiers are quoted and values bound as parameters. Throws if
 * SQLite rejects the update (e.g. a constraint violation).
 */
export function updateRow(
  db: Database,
  table: string,
  rowId: SqlValue,
  values: Record<string, SqlValue>,
): void {
  const columns = Object.keys(values);
  if (columns.length === 0) return;
  const assignments = columns
    .map((column) => `${quoteIdentifier(column)} = ?`)
    .join(", ");
  const params = [...columns.map((column) => values[column]), rowId];
  db.run(
    `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE rowid = ?`,
    params,
  );
}

/**
 * Insert a new row, setting the given columns to the given values. Columns not
 * listed take their default (or NULL). With no columns, inserts a row of all
 * defaults. Identifiers are quoted and values bound as parameters. Throws if
 * SQLite rejects the insert (e.g. a constraint violation).
 */
export function insertRow(
  db: Database,
  table: string,
  values: Record<string, SqlValue>,
): void {
  const columns = Object.keys(values);
  if (columns.length === 0) {
    db.run(`INSERT INTO ${quoteIdentifier(table)} DEFAULT VALUES`);
    return;
  }
  const cols = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const params = columns.map((column) => values[column]);
  db.run(
    `INSERT INTO ${quoteIdentifier(table)} (${cols}) VALUES (${placeholders})`,
    params,
  );
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
  /** Free-form so existing types (e.g. `VARCHAR(255)`) survive a round-trip. */
  type: string;
  primaryKey: boolean;
  notNull: boolean;
};

/** A column being edited, carrying the name it had before the edit (if any). */
export type EditColumn = ColumnDefinition & {
  /** The column's original name, or undefined for a newly added column. */
  originalName?: string;
};

/** Render a single column definition for a `CREATE TABLE` statement. */
function columnClause(column: ColumnDefinition): string {
  const parts = [quoteIdentifier(column.name), column.type];
  if (column.primaryKey) parts.push("PRIMARY KEY");
  // PRIMARY KEY already implies NOT NULL, so don't emit a redundant clause.
  else if (column.notNull) parts.push("NOT NULL");
  return parts.join(" ");
}

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
  const defs = columns.map(columnClause).join(", ");
  db.run(`CREATE TABLE ${quoteIdentifier(name)} (${defs})`);
}

/** Inspect an existing table's columns via `PRAGMA table_info`. */
export function getTableSchema(db: Database, table: string): ColumnDefinition[] {
  // table_info columns: cid, name, type, notnull, dflt_value, pk
  const result = db.exec(`PRAGMA table_info(${quoteIdentifier(table)})`);
  return (
    result[0]?.values.map((row) => ({
      name: String(row[1]),
      type: String(row[2] ?? ""),
      notNull: Number(row[3]) !== 0,
      primaryKey: Number(row[5]) !== 0,
    })) ?? []
  );
}

/** Count the rows in a table. */
export function countRows(db: Database, table: string): number {
  const result = db.exec(`SELECT COUNT(*) FROM ${quoteIdentifier(table)}`);
  return Number(result[0]?.values[0]?.[0] ?? 0);
}

/**
 * Apply an arbitrary schema change to an existing table using the standard
 * SQLite "rebuild" procedure: create a table with the new schema, copy over
 * data for columns that still exist (matched by `originalName`), drop the old
 * table, and rename the new one into place — all inside a transaction.
 *
 * Columns without an `originalName` are new and start empty; original columns
 * absent from `columns` are dropped, losing their data. Note this does not
 * preserve indexes or triggers on the rebuilt table.
 */
export function rebuildTable(
  db: Database,
  originalName: string,
  newName: string,
  columns: EditColumn[],
): void {
  const tempName = `tdb_rebuild_${newName}`;
  const defs = columns.map(columnClause).join(", ");
  const carried = columns.filter((column) => column.originalName);
  const targetCols = carried.map((c) => quoteIdentifier(c.name)).join(", ");
  const sourceCols = carried
    .map((c) => quoteIdentifier(c.originalName as string))
    .join(", ");

  try {
    db.run("BEGIN");
    db.run(`CREATE TABLE ${quoteIdentifier(tempName)} (${defs})`);
    if (carried.length > 0) {
      db.run(
        `INSERT INTO ${quoteIdentifier(tempName)} (${targetCols}) ` +
          `SELECT ${sourceCols} FROM ${quoteIdentifier(originalName)}`,
      );
    }
    db.run(`DROP TABLE ${quoteIdentifier(originalName)}`);
    db.run(
      `ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(newName)}`,
    );
    db.run("COMMIT");
  } catch (err) {
    try {
      db.run("ROLLBACK");
    } catch {
      // The transaction may already be aborted; surface the original error.
    }
    throw err;
  }
}
