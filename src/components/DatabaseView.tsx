"use client";

import { useState } from "react";
import {
  DEFAULT_ROW_LIMIT,
  quoteIdentifier,
  runQuery,
  type LoadedDatabase,
  type QueryResult,
  type SqlValue,
} from "@/lib/sqlite";
import styles from "./DatabaseView.module.css";

type DatabaseViewProps = {
  database: LoadedDatabase;
};

function tableQuery(table: string): string {
  return `SELECT * FROM ${quoteIdentifier(table)} LIMIT ${DEFAULT_ROW_LIMIT};`;
}

type QueryState = { result: QueryResult | null; error: string | null };

/** Run SQL against the handle, capturing either the rows or the error message. */
function evaluate(db: LoadedDatabase["db"], sql: string): QueryState {
  try {
    return { result: runQuery(db, sql), error: null };
  } catch (err) {
    return { result: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Render a raw SQLite cell value for display in the grid. */
function formatCell(value: SqlValue) {
  if (value === null) return <span className={styles.null}>NULL</span>;
  if (value instanceof Uint8Array) {
    return <span className={styles.blob}>[{value.length} bytes]</span>;
  }
  return String(value);
}

export default function DatabaseView({ database }: DatabaseViewProps) {
  const { tables, db } = database;
  const firstTable = tables[0] ?? null;
  const [selectedTable, setSelectedTable] = useState<string | null>(firstTable);
  const [sql, setSql] = useState(firstTable ? tableQuery(firstTable) : "");
  // Lazily run the initial table query once, on mount.
  const [query, setQuery] = useState<QueryState>(() =>
    firstTable ? evaluate(db, tableQuery(firstTable)) : { result: null, error: null },
  );
  const { result, error } = query;

  function selectTable(table: string) {
    const next = tableQuery(table);
    setSelectedTable(table);
    setSql(next);
    setQuery(evaluate(db, next));
  }

  return (
    <div className={styles.view}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          Tables ({tables.length})
        </div>
        {tables.length === 0 ? (
          <p className={styles.empty}>No tables</p>
        ) : (
          <ul className={styles.tableList}>
            {tables.map((table) => (
              <li key={table}>
                <button
                  type="button"
                  className={`${styles.tableItem} ${
                    table === selectedTable ? styles.tableItemActive : ""
                  }`}
                  onClick={() => selectTable(table)}
                >
                  <span className={styles.tableIcon} aria-hidden="true">
                    ▦
                  </span>
                  {table}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className={styles.main}>
        <div className={styles.grid}>
          {error ? (
            <p className={styles.error}>{error}</p>
          ) : result && result.columns.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rowNumber} aria-hidden="true" />
                  {result.columns.map((column) => (
                    <th key={column} className={styles.th}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, r) => (
                  <tr key={r}>
                    <td className={styles.rowNumber}>{r + 1}</td>
                    {row.map((value, c) => (
                      <td key={c} className={styles.td}>
                        {formatCell(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.empty}>
              {result ? "Query returned no rows." : "Select a table to view its data."}
            </p>
          )}
        </div>

        <form
          className={styles.queryBar}
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(evaluate(db, sql));
          }}
        >
          <textarea
            className={styles.sqlInput}
            value={sql}
            onChange={(event) => setSql(event.target.value)}
            spellCheck={false}
            placeholder="Enter a SQL query…"
            aria-label="SQL query"
          />
          <button type="submit" className={styles.runButton}>
            Run
          </button>
        </form>
      </section>
    </div>
  );
}
