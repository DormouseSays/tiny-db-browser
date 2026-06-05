/**
 * Typed client for the database API. Every DB operation that used to run
 * against an in-browser SQLite handle now goes through these fetch wrappers to
 * the server route handlers under `/api/databases`.
 *
 * Responses carry values in the JSON wire format (see `./wire`); blobs are
 * decoded back into `Uint8Array` here so callers get plain `SqlValue`s.
 */
import type {
  ColumnDefinition,
  DatabaseInfo,
  EditColumn,
  QueryResult,
  SqlValue,
  TableData,
} from "./schema";
import { decodeRow, decodeValue, type WireValue } from "./wire";

/** Perform a request and parse JSON, throwing the server's error message. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // Non-JSON error body; fall back to the status text.
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const base = (id: string) => `/api/databases/${encodeURIComponent(id)}`;
const tablePath = (id: string, table: string) =>
  `${base(id)}/tables/${encodeURIComponent(table)}`;

/** Upload a SQLite file and open it on the server. */
export async function uploadDatabase(file: File): Promise<DatabaseInfo> {
  const form = new FormData();
  form.append("file", file);
  return request<DatabaseInfo>("/api/databases", {
    method: "POST",
    body: form,
  });
}

/** List the database files already on the server. */
export async function listServerDatabases(): Promise<
  { id: string; name: string }[]
> {
  const { files } = await request<{ files: { id: string; name: string }[] }>(
    "/api/databases",
  );
  return files;
}

/** Open a database file already on the server by id. */
export async function openServerDatabase(id: string): Promise<DatabaseInfo> {
  return request<DatabaseInfo>(`${base(id)}/open`, { method: "POST" });
}

/** Close an open database (releases the server handle; the file is kept). */
export async function closeDatabase(id: string): Promise<void> {
  await request<void>(base(id), { method: "DELETE" });
}

/** A URL that downloads the current bytes of the database as a file. */
export function exportUrl(id: string): string {
  return `${base(id)}/export`;
}

/** List the user tables in a database. */
export async function listTables(id: string): Promise<string[]> {
  const { tables } = await request<{ tables: string[] }>(`${base(id)}/tables`);
  return tables;
}

/** Run ad-hoc SQL and return the final result set. */
export async function runQuery(id: string, sql: string): Promise<QueryResult> {
  const data = await request<{ columns: string[]; rows: WireValue[][] }>(
    `${base(id)}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    },
  );
  return { columns: data.columns, rows: data.rows.map(decodeRow) };
}

/** Read a page of rows from a table, including each row's rowid. */
export async function readTable(id: string, table: string): Promise<TableData> {
  const data = await request<{
    columns: string[];
    rows: WireValue[][];
    rowIds: WireValue[];
  }>(`${tablePath(id, table)}/rows`);
  return {
    columns: data.columns,
    rows: data.rows.map(decodeRow),
    rowIds: data.rowIds.map(decodeValue),
  };
}

/** Insert a new row. Values are sent as-is (the UI never produces blobs). */
export async function insertRow(
  id: string,
  table: string,
  values: Record<string, SqlValue>,
): Promise<void> {
  await request<void>(`${tablePath(id, table)}/rows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
}

/** Update a row, identified by its rowid. */
export async function updateRow(
  id: string,
  table: string,
  rowId: SqlValue,
  values: Record<string, SqlValue>,
): Promise<void> {
  await request<void>(`${tablePath(id, table)}/rows`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rowId, values }),
  });
}

/** Read a table's column schema and current row count. */
export async function getTableSchema(
  id: string,
  table: string,
): Promise<{ columns: ColumnDefinition[]; rowCount: number }> {
  return request(tablePath(id, table));
}

/** Create a new table; returns the database's updated table list. */
export async function createTable(
  id: string,
  name: string,
  columns: ColumnDefinition[],
): Promise<string[]> {
  const { tables } = await request<{ tables: string[] }>(`${base(id)}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, columns }),
  });
  return tables;
}

/** Rebuild an existing table; returns the database's updated table list. */
export async function rebuildTable(
  id: string,
  table: string,
  name: string,
  columns: EditColumn[],
): Promise<string[]> {
  const { tables } = await request<{ tables: string[] }>(tablePath(id, table), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, columns }),
  });
  return tables;
}
