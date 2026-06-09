/**
 * Shared types, constants, and pure helpers used by both the browser client and
 * the server. This module deliberately does NOT import the SQLite engine, so it
 * is safe to pull into client components without bundling native code.
 */

/** A SQLite cell value. */
export type SqlValue = number | string | Uint8Array | null;

/** Default cap on rows pulled into the grid when browsing a table. */
export const DEFAULT_ROW_LIMIT = 200;

/** Where an open database lives. "d1" is a remote Cloudflare D1 connection. */
export type DatabaseKind = "sqlite" | "d1";

/** Identifying info for an open database, returned by the upload endpoint. */
export type DatabaseInfo = {
  /** Server-assigned id used to address this database in the API. */
  id: string;
  /** The original filename (or display name), used as the tab title. */
  name: string;
  /** User table names, alphabetically sorted (internal sqlite_* tables excluded). */
  tables: string[];
  /** Backing store; set by the client so the UI can adapt (defaults to sqlite). */
  kind?: DatabaseKind;
};

export type QueryResult = {
  columns: string[];
  rows: SqlValue[][];
};

/** A table's rows plus the rowid of each, so individual rows can be updated. */
export type TableData = QueryResult & { rowIds: SqlValue[] };

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

/** Quote an identifier (e.g. a table name) for safe interpolation into SQL. */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a string literal for inlining into SQL (e.g. a PRAGMA function arg). */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Render one column definition for a `CREATE TABLE` statement. Shared by every
 * SQL backend so the SQLite engine and the D1 engine emit identical DDL.
 * PRIMARY KEY already implies NOT NULL, so a redundant NOT NULL is dropped.
 */
export function columnDefinitionSql(column: ColumnDefinition): string {
  const parts = [quoteIdentifier(column.name), column.type];
  if (column.primaryKey) parts.push("PRIMARY KEY");
  else if (column.notNull) parts.push("NOT NULL");
  return parts.join(" ");
}

/** The default SQL shown when a table is opened in the grid. */
export function tableQuery(table: string): string {
  return `SELECT * FROM ${quoteIdentifier(table)} LIMIT ${DEFAULT_ROW_LIMIT};`;
}
