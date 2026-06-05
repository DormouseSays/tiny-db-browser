/**
 * Server-side SQLite operations. sql.js compiles SQLite to JS/WebAssembly and
 * runs in Node just as well as the browser; these helpers operate on an open
 * `Database` handle owned by the server registry (see `server/registry.ts`).
 *
 * Pure types, constants, and the identifier quoter live in `./schema` so client
 * code can import them without pulling in sql.js.
 */
import type { Database } from "sql.js";
import {
  DEFAULT_ROW_LIMIT,
  quoteIdentifier,
  type ColumnDefinition,
  type EditColumn,
  type QueryResult,
  type SqlValue,
  type TableData,
} from "./schema";

export {
  COLUMN_TYPES,
  DEFAULT_ROW_LIMIT,
  quoteIdentifier,
  tableQuery,
} from "./schema";
export type {
  ColumnDefinition,
  ColumnType,
  DatabaseInfo,
  EditColumn,
  QueryResult,
  SqlValue,
  TableData,
} from "./schema";

/** List user table names alphabetically, excluding internal sqlite_* tables. */
export function listTables(db: Database): string[] {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result[0]?.values.map((row) => String(row[0])) ?? [];
}

/** Serialize an open database back to a SQLite file image (on-disk format). */
export function exportDatabase(db: Database): Uint8Array {
  return db.export();
}

/** Free the native memory held by an open database handle. */
export function closeDatabase(db: Database): void {
  db.close();
}

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
