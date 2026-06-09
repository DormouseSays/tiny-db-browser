/**
 * The database engine abstraction the API routes talk to.
 *
 * Every open database — a local SQLite file or a remote Cloudflare D1 — is
 * exposed through this single async interface, so the route handlers and the
 * whole client UI work the same regardless of where the data actually lives.
 * `sqliteEngine` adapts the synchronous better-sqlite3 helpers in `../sqlite`;
 * `d1Engine` (see `./d1`) implements the same surface over D1's REST API.
 */
import type {
  ColumnDefinition,
  EditColumn,
  QueryResult,
  SqlValue,
  TableData,
} from "../schema";
import {
  closeDatabase,
  countRows,
  createTable,
  deleteRow,
  exportDatabase,
  getTableSchema,
  insertRow,
  listTables,
  readTable,
  rebuildTable,
  runQuery,
  updateRow,
  type Database,
} from "../sqlite";

/** A table's column definitions plus its current row count. */
export type TableDescription = {
  columns: ColumnDefinition[];
  rowCount: number;
};

/** Thrown by `exportImage` for engines that can't produce a SQLite file. */
export class ExportUnsupportedError extends Error {
  constructor(message = "This database cannot be exported to a file.") {
    super(message);
    this.name = "ExportUnsupportedError";
  }
}

/** The operations a backing store must provide to drive the grid and editor. */
export interface DbEngine {
  listTables(): Promise<string[]>;
  runQuery(sql: string): Promise<QueryResult>;
  readTable(table: string): Promise<TableData>;
  describeTable(table: string): Promise<TableDescription>;
  createTable(name: string, columns: ColumnDefinition[]): Promise<void>;
  rebuildTable(
    original: string,
    newName: string,
    columns: EditColumn[],
  ): Promise<void>;
  insertRow(table: string, values: Record<string, SqlValue>): Promise<void>;
  updateRow(
    table: string,
    rowId: SqlValue,
    values: Record<string, SqlValue>,
  ): Promise<void>;
  deleteRow(table: string, rowId: SqlValue): Promise<void>;
  /** Serialize to a SQLite file image, or throw `ExportUnsupportedError`. */
  exportImage(): Promise<Uint8Array>;
  /** Release any resources held for this database. */
  close(): void;
}

/** Adapt an open better-sqlite3 handle to the async engine interface. */
export function sqliteEngine(db: Database): DbEngine {
  return {
    async listTables() {
      return listTables(db);
    },
    async runQuery(sql) {
      return runQuery(db, sql);
    },
    async readTable(table) {
      return readTable(db, table);
    },
    async describeTable(table) {
      return { columns: getTableSchema(db, table), rowCount: countRows(db, table) };
    },
    async createTable(name, columns) {
      createTable(db, name, columns);
    },
    async rebuildTable(original, newName, columns) {
      rebuildTable(db, original, newName, columns);
    },
    async insertRow(table, values) {
      insertRow(db, table, values);
    },
    async updateRow(table, rowId, values) {
      updateRow(db, table, rowId, values);
    },
    async deleteRow(table, rowId) {
      deleteRow(db, table, rowId);
    },
    async exportImage() {
      return exportDatabase(db);
    },
    close() {
      closeDatabase(db);
    },
  };
}
