/**
 * Shared types, constants, and pure helpers used by both the browser client and
 * the server. This module deliberately does NOT import the SQLite engine, so it
 * is safe to pull into client components without bundling native code.
 */

/** A SQLite cell value. */
export type SqlValue = number | string | Uint8Array | null;

/** Default cap on rows pulled into the grid when browsing a table. */
export const DEFAULT_ROW_LIMIT = 200;

/** Identifying info for an open database, returned by the upload endpoint. */
export type DatabaseInfo = {
  /** Server-assigned id used to address this database in the API. */
  id: string;
  /** The original filename, used as the tab title. */
  name: string;
  /** User table names, alphabetically sorted (internal sqlite_* tables excluded). */
  tables: string[];
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

/** The default SQL shown when a table is opened in the grid. */
export function tableQuery(table: string): string {
  return `SELECT * FROM ${quoteIdentifier(table)} LIMIT ${DEFAULT_ROW_LIMIT};`;
}
