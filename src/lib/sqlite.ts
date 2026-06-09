/**
 * Server-side SQLite operations, backed by better-sqlite3. Each helper operates
 * on an open `Database` handle owned by the server registry (see
 * `server/registry.ts`). better-sqlite3 keeps the underlying file open and
 * writes changes through immediately, so there is no separate persist step.
 *
 * Pure types, constants, and the identifier quoter live in `./schema` so client
 * code can import them without pulling in the native engine.
 */
import type DatabaseConstructor from "better-sqlite3";
import {
  DEFAULT_ROW_LIMIT,
  columnDefinitionSql,
  quoteIdentifier,
  type ColumnDefinition,
  type EditColumn,
  type QueryResult,
  type SqlValue,
  type TableData,
} from "./schema";

export { quoteIdentifier } from "./schema";

/** A better-sqlite3 database handle. */
export type Database = DatabaseConstructor.Database;

/** List user table names alphabetically, excluding internal sqlite_* tables. */
export function listTables(db: Database): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .pluck()
    .all() as string[];
}

/** Serialize the database to a SQLite file image (on-disk format). */
export function exportDatabase(db: Database): Buffer {
  return db.serialize();
}

/** Close an open database handle. */
export function closeDatabase(db: Database): void {
  db.close();
}

/**
 * Split a SQL string into individual statements on top-level semicolons,
 * ignoring semicolons inside string literals, quoted identifiers, and comments.
 * Blank and comment-only fragments are dropped. better-sqlite3 prepares a single
 * statement at a time, so the query bar relies on this to run scripts.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let hasContent = false; // a non-comment, non-whitespace char in the fragment
  type State =
    | "normal"
    | "single"
    | "double"
    | "backtick"
    | "bracket"
    | "line"
    | "block";
  let state: State = "normal";

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];

    if (state === "normal") {
      if (c === ";") {
        if (hasContent) statements.push(buf.trim());
        buf = "";
        hasContent = false;
        continue;
      }
      if (c === "-" && next === "-") {
        state = "line";
      } else if (c === "/" && next === "*") {
        state = "block";
      } else if (c === "'") {
        state = "single";
        hasContent = true;
      } else if (c === '"') {
        state = "double";
        hasContent = true;
      } else if (c === "`") {
        state = "backtick";
        hasContent = true;
      } else if (c === "[") {
        state = "bracket";
        hasContent = true;
      } else if (!/\s/.test(c)) {
        hasContent = true;
      }
      buf += c;
      continue;
    }

    // Inside a string / quoted identifier / comment: copy through, watching for
    // the terminator (and doubled-quote escapes within quoted forms).
    buf += c;
    switch (state) {
      case "single":
        if (c === "'") {
          if (next === "'") buf += sql[++i];
          else state = "normal";
        }
        break;
      case "double":
        if (c === '"') {
          if (next === '"') buf += sql[++i];
          else state = "normal";
        }
        break;
      case "backtick":
        if (c === "`") {
          if (next === "`") buf += sql[++i];
          else state = "normal";
        }
        break;
      case "bracket":
        if (c === "]") state = "normal";
        break;
      case "line":
        if (c === "\n") state = "normal";
        break;
      case "block":
        if (c === "*" && next === "/") {
          buf += sql[++i];
          state = "normal";
        }
        break;
    }
  }
  if (hasContent) statements.push(buf.trim());
  return statements;
}

/**
 * Run arbitrary SQL and return the final result set. Statements are executed in
 * order and the last row-producing one wins, so a trailing `SELECT` is what the
 * grid shows. A query reports its column names even when it matches zero rows,
 * letting the grid show headers for an empty table; non-row-producing statements
 * (e.g. `CREATE`, `UPDATE`) leave the result an empty grid.
 */
export function runQuery(db: Database, sql: string): QueryResult {
  let last: QueryResult = { columns: [], rows: [] };
  for (const statement of splitStatements(sql)) {
    const prepared = db.prepare(statement);
    if (prepared.reader) {
      last = {
        columns: prepared.columns().map((column) => column.name),
        rows: prepared.raw().all() as SqlValue[][],
      };
    } else {
      prepared.run();
    }
  }
  return last;
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
  const defs = columns.map(columnDefinitionSql).join(", ");
  db.exec(`CREATE TABLE ${quoteIdentifier(name)} (${defs})`);
}

/** Inspect an existing table's columns via `PRAGMA table_info`. */
export function getTableSchema(db: Database, table: string): ColumnDefinition[] {
  // table_info rows: { cid, name, type, notnull, dflt_value, pk }
  const rows = db.pragma(`table_info(${quoteIdentifier(table)})`) as Array<{
    name: string;
    type: string | null;
    notnull: number;
    pk: number;
  }>;
  return rows.map((row) => ({
    name: String(row.name),
    type: String(row.type ?? ""),
    notNull: Number(row.notnull) !== 0,
    primaryKey: Number(row.pk) !== 0,
  }));
}

/** Count the rows in a table. */
export function countRows(db: Database, table: string): number {
  return db
    .prepare(`SELECT COUNT(*) FROM ${quoteIdentifier(table)}`)
    .pluck()
    .get() as number;
}

/**
 * Apply an arbitrary schema change to an existing table using the standard
 * SQLite "rebuild" procedure: create a table with the new schema, copy over
 * data for columns that still exist (matched by `originalName`), drop the old
 * table, and rename the new one into place — all inside a transaction that rolls
 * back automatically on failure.
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
  const defs = columns.map(columnDefinitionSql).join(", ");
  const carried = columns.filter((column) => column.originalName);
  const targetCols = carried.map((c) => quoteIdentifier(c.name)).join(", ");
  const sourceCols = carried
    .map((c) => quoteIdentifier(c.originalName as string))
    .join(", ");

  db.transaction(() => {
    db.exec(`CREATE TABLE ${quoteIdentifier(tempName)} (${defs})`);
    if (carried.length > 0) {
      db.exec(
        `INSERT INTO ${quoteIdentifier(tempName)} (${targetCols}) ` +
          `SELECT ${sourceCols} FROM ${quoteIdentifier(originalName)}`,
      );
    }
    db.exec(`DROP TABLE ${quoteIdentifier(originalName)}`);
    db.exec(
      `ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(newName)}`,
    );
  })();
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
  db.prepare(
    `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE rowid = ?`,
  ).run(...params);
}

/**
 * Delete a single row, identified by its rowid. Identifiers are quoted and the
 * rowid bound as a parameter. Throws if SQLite rejects the delete (e.g. a
 * foreign-key constraint).
 */
export function deleteRow(db: Database, table: string, rowId: SqlValue): void {
  db.prepare(
    `DELETE FROM ${quoteIdentifier(table)} WHERE rowid = ?`,
  ).run(rowId);
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
    db.exec(`INSERT INTO ${quoteIdentifier(table)} DEFAULT VALUES`);
    return;
  }
  const cols = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const params = columns.map((column) => values[column]);
  db.prepare(
    `INSERT INTO ${quoteIdentifier(table)} (${cols}) VALUES (${placeholders})`,
  ).run(...params);
}
