/**
 * A `DbEngine` backed by a remote Cloudflare D1 database, reached over D1's REST
 * "query" endpoint. The connection config (account id, database id, API token)
 * is held only in memory by the registry for as long as the tab is open; nothing
 * is persisted to disk and the token is never sent back to the browser.
 *
 * D1 is SQLite under the hood, so every operation is expressed as the same SQL
 * the local engine builds — only execution differs (an HTTPS call instead of a
 * better-sqlite3 prepared statement).
 */
import {
  DEFAULT_ROW_LIMIT,
  columnDefinitionSql,
  quoteIdentifier,
  quoteLiteral,
  type ColumnDefinition,
  type QueryResult,
  type SqlValue,
} from "../schema";
import { ExportUnsupportedError, type DbEngine } from "./engine";

export type D1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

const API_BASE =
  process.env.TINY_DB_D1_API_BASE ?? "https://api.cloudflare.com/client/v4";

/** Tables exposed via the API never include these system-table prefixes. */
const LIST_TABLES_SQL =
  "SELECT name FROM sqlite_master WHERE type = 'table' " +
  "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' " +
  "AND name NOT LIKE 'd1_%' ORDER BY name";

/** One statement's slice of a D1 query response. */
type D1StatementResult = {
  results?: Record<string, unknown>[];
};

type D1Response = {
  result?: D1StatementResult[];
  success?: boolean;
  errors?: { code?: number; message?: string }[];
};

function queryUrl(config: D1Config): string {
  return (
    `${API_BASE}/accounts/${encodeURIComponent(config.accountId)}` +
    `/d1/database/${encodeURIComponent(config.databaseId)}/query`
  );
}

/** Convert a bound SqlValue into the JSON form D1 accepts as a parameter. */
function toD1Param(value: SqlValue): unknown {
  // The grid never produces blobs, but encode defensively just in case.
  return value instanceof Uint8Array ? Array.from(value) : value;
}

/** Convert a JSON value returned by D1 back into a `SqlValue`. */
function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  // Anything else (an object) is surfaced as its JSON text.
  return JSON.stringify(value);
}

/** Run SQL against D1 and return one entry per statement. Throws on API error. */
async function d1Query(
  config: D1Config,
  sql: string,
  params: SqlValue[] = [],
): Promise<D1StatementResult[]> {
  let res: Response;
  try {
    res = await fetch(queryUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params: params.map(toD1Param) }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach Cloudflare D1: ${detail}`);
  }

  let body: D1Response = {};
  try {
    body = (await res.json()) as D1Response;
  } catch {
    // Non-JSON body (e.g. an HTML error page); fall back to the status below.
  }

  if (!res.ok || body.success === false) {
    const message =
      body.errors
        ?.map((e) => e.message)
        .filter(Boolean)
        .join("; ") || `Cloudflare D1 request failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return body.result ?? [];
}

/** Turn one statement's row objects into a column-ordered `QueryResult`. */
function toQueryResult(statement: D1StatementResult | undefined): QueryResult {
  const rows = statement?.results ?? [];
  if (rows.length === 0) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);
  return {
    columns,
    rows: rows.map((row) => columns.map((column) => toSqlValue(row[column]))),
  };
}

/** Fetch a table's column names (used to keep headers for an empty table). */
async function tableColumnNames(
  config: D1Config,
  table: string,
): Promise<string[]> {
  const [stmt] = await d1Query(
    config,
    `SELECT name FROM pragma_table_info(${quoteLiteral(table)})`,
  );
  return (stmt?.results ?? []).map((row) => String(row.name));
}

/** Build a `DbEngine` over a Cloudflare D1 connection. */
export function d1Engine(config: D1Config): DbEngine {
  return {
    async listTables() {
      const [stmt] = await d1Query(config, LIST_TABLES_SQL);
      return (stmt?.results ?? []).map((row) => String(row.name));
    },

    async runQuery(sql) {
      const results = await d1Query(config, sql);
      // The last row-producing statement wins, matching the SQLite engine.
      let last: D1StatementResult | undefined;
      for (const r of results) {
        if ((r.results?.length ?? 0) > 0) last = r;
      }
      return toQueryResult(last);
    },

    async readTable(table) {
      const sql =
        `SELECT rowid AS _tdb_rowid, * FROM ${quoteIdentifier(table)} ` +
        `LIMIT ${DEFAULT_ROW_LIMIT}`;
      const [stmt] = await d1Query(config, sql);
      const full = toQueryResult(stmt);
      if (full.columns.length === 0) {
        // No rows came back, so recover the headers from the table's schema.
        const names = await tableColumnNames(config, table);
        return { columns: names, rows: [], rowIds: [] };
      }
      return {
        columns: full.columns.slice(1),
        rows: full.rows.map((row) => row.slice(1)),
        rowIds: full.rows.map((row) => row[0]),
      };
    },

    async describeTable(table) {
      const [colsRes, countRes] = await Promise.all([
        d1Query(config, `SELECT * FROM pragma_table_info(${quoteLiteral(table)})`),
        d1Query(config, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`),
      ]);
      const columns: ColumnDefinition[] = (colsRes[0]?.results ?? []).map(
        (row) => ({
          name: String(row.name),
          type: String(row.type ?? ""),
          notNull: Number(row.notnull) !== 0,
          primaryKey: Number(row.pk) !== 0,
        }),
      );
      const rowCount = Number((countRes[0]?.results ?? [])[0]?.count ?? 0);
      return { columns, rowCount };
    },

    async createTable(name, columns) {
      const defs = columns.map(columnDefinitionSql).join(", ");
      await d1Query(config, `CREATE TABLE ${quoteIdentifier(name)} (${defs})`);
    },

    async rebuildTable(original, newName, columns) {
      const tempName = `tdb_rebuild_${newName}`;
      const defs = columns.map(columnDefinitionSql).join(", ");
      const carried = columns.filter((column) => column.originalName);
      const targetCols = carried.map((c) => quoteIdentifier(c.name)).join(", ");
      const sourceCols = carried
        .map((c) => quoteIdentifier(c.originalName as string))
        .join(", ");

      const statements = [`CREATE TABLE ${quoteIdentifier(tempName)} (${defs})`];
      if (carried.length > 0) {
        statements.push(
          `INSERT INTO ${quoteIdentifier(tempName)} (${targetCols}) ` +
            `SELECT ${sourceCols} FROM ${quoteIdentifier(original)}`,
        );
      }
      statements.push(`DROP TABLE ${quoteIdentifier(original)}`);
      statements.push(
        `ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(newName)}`,
      );
      // D1 runs the statements of a single query call as one batch.
      await d1Query(config, statements.join("; "));
    },

    async insertRow(table, values) {
      const columns = Object.keys(values);
      if (columns.length === 0) {
        await d1Query(config, `INSERT INTO ${quoteIdentifier(table)} DEFAULT VALUES`);
        return;
      }
      const cols = columns.map(quoteIdentifier).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      await d1Query(
        config,
        `INSERT INTO ${quoteIdentifier(table)} (${cols}) VALUES (${placeholders})`,
        columns.map((column) => values[column]),
      );
    },

    async updateRow(table, rowId, values) {
      const columns = Object.keys(values);
      if (columns.length === 0) return;
      const assignments = columns
        .map((column) => `${quoteIdentifier(column)} = ?`)
        .join(", ");
      await d1Query(
        config,
        `UPDATE ${quoteIdentifier(table)} SET ${assignments} WHERE rowid = ?`,
        [...columns.map((column) => values[column]), rowId],
      );
    },

    async deleteRow(table, rowId) {
      await d1Query(
        config,
        `DELETE FROM ${quoteIdentifier(table)} WHERE rowid = ?`,
        [rowId],
      );
    },

    async exportImage(): Promise<Uint8Array> {
      throw new ExportUnsupportedError(
        "A Cloudflare D1 database cannot be saved to a file.",
      );
    },

    close() {
      // Nothing to release: the connection is just stored config.
    },
  };
}
