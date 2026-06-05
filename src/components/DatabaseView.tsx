"use client";

import { useState } from "react";
import {
  DEFAULT_ROW_LIMIT,
  insertRow,
  quoteIdentifier,
  readTable,
  runQuery,
  updateRow,
  type LoadedDatabase,
  type QueryResult,
  type SqlValue,
} from "@/lib/sqlite";
import TableForm from "./TableForm";
import styles from "./DatabaseView.module.css";

/** The table editor is open either to create a new table (`table: null`) or to
 * edit an existing one (`table: name`); `null` means the editor is closed. */
type EditorState = { table: string | null } | null;

type DatabaseViewProps = {
  database: LoadedDatabase;
  /** Called after the schema changes (e.g. a table is created) so the parent
   * can refresh the tab's table list. */
  onSchemaChange?: () => void;
};

function tableQuery(table: string): string {
  return `SELECT * FROM ${quoteIdentifier(table)} LIMIT ${DEFAULT_ROW_LIMIT};`;
}

type QueryState = {
  result: QueryResult | null;
  error: string | null;
  /** The table being viewed directly, whose rows are editable; null for
   * ad-hoc queries and tables without a rowid. */
  table: string | null;
  /** rowid for each row in `result`, parallel to `result.rows`. */
  rowIds: SqlValue[];
};

/** An empty (no database loaded / nothing selected) query state. */
const EMPTY_QUERY: QueryState = {
  result: null,
  error: null,
  table: null,
  rowIds: [],
};

/** Run ad-hoc SQL against the handle, capturing either the rows or the error
 * message. The result is not editable (we can't map arbitrary rows back to a
 * table), so `table`/`rowIds` are cleared. */
function evaluate(db: LoadedDatabase["db"], sql: string): QueryState {
  try {
    return { result: runQuery(db, sql), error: null, table: null, rowIds: [] };
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : String(err),
      table: null,
      rowIds: [],
    };
  }
}

/** Load a table directly so its rows are editable, falling back to a read-only
 * query for tables without a rowid (WITHOUT ROWID tables). */
function readTableState(db: LoadedDatabase["db"], table: string): QueryState {
  try {
    const data = readTable(db, table);
    return {
      result: { columns: data.columns, rows: data.rows },
      error: null,
      table,
      rowIds: data.rowIds,
    };
  } catch {
    return evaluate(db, tableQuery(table));
  }
}

/** A row being edited: the row's index in the grid, the column the edit started
 * in (focused on open), and the in-progress string value of each cell. */
type RowEdit = { rowIndex: number; colIndex: number; values: string[] };

/** Convert a cell value to the string shown in its edit input. */
function toInputValue(value: SqlValue): string {
  if (value === null || value instanceof Uint8Array) return "";
  return String(value);
}

/** Render a raw SQLite cell value for display in the grid. */
function formatCell(value: SqlValue) {
  if (value === null) return <span className={styles.null}>NULL</span>;
  if (value instanceof Uint8Array) {
    return <span className={styles.blob}>[{value.length} bytes]</span>;
  }
  return String(value);
}

export default function DatabaseView({
  database,
  onSchemaChange,
}: DatabaseViewProps) {
  const { tables, db } = database;
  const firstTable = tables[0] ?? null;
  const [selectedTable, setSelectedTable] = useState<string | null>(firstTable);
  const [editor, setEditor] = useState<EditorState>(null);
  const [sql, setSql] = useState(firstTable ? tableQuery(firstTable) : "");
  // Lazily run the initial table query once, on mount.
  const [query, setQuery] = useState<QueryState>(() =>
    firstTable ? readTableState(db, firstTable) : EMPTY_QUERY,
  );
  // The row currently being edited inline, or null when none is.
  const [edit, setEdit] = useState<RowEdit | null>(null);
  // In-progress new row appended below the table, or null when not inserting.
  // One string per column, parallel to `result.columns`.
  const [insertValues, setInsertValues] = useState<string[] | null>(null);
  // A failure from the last save attempt, shown below the grid.
  const [editError, setEditError] = useState<string | null>(null);
  // When true, the active row plays its red error-flash animation; cleared when
  // the animation ends, so a repeated failure can replay it.
  const [flashing, setFlashing] = useState(false);
  const { result, error, table: editableTable, rowIds } = query;

  /** Surface a failed save/insert: show the message and flash the row red. */
  function reportEditError(err: unknown) {
    setEditError(err instanceof Error ? err.message : String(err));
    setFlashing(true);
  }

  function selectTable(table: string) {
    setEditor(null);
    setEdit(null);
    setInsertValues(null);
    setEditError(null);
    setSelectedTable(table);
    setSql(tableQuery(table));
    setQuery(readTableState(db, table));
  }

  function handleSaved(name: string) {
    onSchemaChange?.();
    selectTable(name);
  }

  function startEdit(rowIndex: number, colIndex: number) {
    if (!editableTable || !result) return;
    setEditError(null);
    setInsertValues(null);
    setEdit({ rowIndex, colIndex, values: result.rows[rowIndex].map(toInputValue) });
  }

  function changeCell(colIndex: number, value: string) {
    setEdit((prev) =>
      prev
        ? {
            ...prev,
            values: prev.values.map((v, i) => (i === colIndex ? value : v)),
          }
        : prev,
    );
  }

  function cancelEdit() {
    setEdit(null);
    setEditError(null);
  }

  function saveEdit() {
    if (!edit || !editableTable || !result) return;
    const values: Record<string, SqlValue> = {};
    result.columns.forEach((column, c) => {
      // Blob cells aren't editable in the grid — leave them untouched.
      if (result.rows[edit.rowIndex][c] instanceof Uint8Array) return;
      const text = edit.values[c];
      // An empty input means NULL; otherwise let column affinity coerce the
      // string (e.g. "5" into an INTEGER column).
      values[column] = text === "" ? null : text;
    });
    try {
      updateRow(db, editableTable, rowIds[edit.rowIndex], values);
      setEdit(null);
      setEditError(null);
      // Re-read so the grid reflects how SQLite stored the values.
      setQuery(readTableState(db, editableTable));
    } catch (err) {
      reportEditError(err);
    }
  }

  function startInsert() {
    if (!editableTable || !result) return;
    setEdit(null);
    setEditError(null);
    setInsertValues(result.columns.map(() => ""));
  }

  function changeInsertCell(colIndex: number, value: string) {
    setInsertValues((prev) =>
      prev ? prev.map((v, i) => (i === colIndex ? value : v)) : prev,
    );
  }

  function cancelInsert() {
    setInsertValues(null);
    setEditError(null);
  }

  function saveInsert() {
    if (!insertValues || !editableTable || !result) return;
    const values: Record<string, SqlValue> = {};
    result.columns.forEach((column, c) => {
      const text = insertValues[c];
      // An empty input means NULL (so the column takes its default); otherwise
      // let column affinity coerce the string.
      values[column] = text === "" ? null : text;
    });
    try {
      insertRow(db, editableTable, values);
      setInsertValues(null);
      setEditError(null);
      // Re-read so the new row (and any defaults SQLite filled in) appears.
      setQuery(readTableState(db, editableTable));
    } catch (err) {
      reportEditError(err);
    }
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
            {tables.map((table) => {
              const highlighted =
                editor === null
                  ? table === selectedTable
                  : editor.table === table;
              return (
                <li
                  key={table}
                  className={`${styles.tableRow} ${
                    highlighted ? styles.tableRowActive : ""
                  }`}
                >
                  <button
                    type="button"
                    className={styles.tableItem}
                    onClick={() => selectTable(table)}
                  >
                    <span className={styles.tableIcon} aria-hidden="true">
                      ▦
                    </span>
                    {table}
                  </button>
                  <button
                    type="button"
                    className={styles.editTable}
                    aria-label={`Edit ${table}`}
                    title={`Edit ${table}`}
                    onClick={() => setEditor({ table })}
                  >
                    ✎
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className={`${styles.addTable} ${
            editor?.table === null ? styles.addTableActive : ""
          }`}
          onClick={() => setEditor({ table: null })}
        >
          + Add table
        </button>
      </aside>

      <section className={styles.main}>
        {editor ? (
          <TableForm
            db={db}
            existingTables={tables}
            table={editor.table}
            onSaved={handleSaved}
            onCancel={() => setEditor(null)}
          />
        ) : (
          <>
            <div className={styles.grid}>
              {error ? (
                <p className={styles.error}>{error}</p>
              ) : result && result.columns.length > 0 ? (
                <>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.rowNumber} aria-hidden="true" />
                        {result.columns.map((column) => (
                          <th key={column} className={styles.th}>
                            {column}
                          </th>
                        ))}
                        {editableTable && (
                          <th className={styles.actionsHead} aria-hidden="true" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, r) => {
                        const editing = edit?.rowIndex === r;
                        return (
                          <tr
                            key={r}
                            className={
                              editing
                                ? `${styles.editingRow} ${
                                    flashing ? styles.errorFlash : ""
                                  }`
                                : undefined
                            }
                            onAnimationEnd={() => setFlashing(false)}
                          >
                            <td className={styles.rowNumber}>{r + 1}</td>
                            {row.map((value, c) => {
                              const isBlob = value instanceof Uint8Array;
                              const cellEditable = Boolean(editableTable) && !isBlob;
                              if (editing && !isBlob) {
                                return (
                                  <td key={c} className={styles.td}>
                                    <input
                                      className={styles.cellInput}
                                      value={edit.values[c]}
                                      autoFocus={c === edit.colIndex}
                                      onChange={(e) => changeCell(c, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveEdit();
                                        else if (e.key === "Escape") cancelEdit();
                                      }}
                                      aria-label={`${result.columns[c]} value`}
                                    />
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={c}
                                  className={`${styles.td} ${
                                    cellEditable ? styles.editable : ""
                                  }`}
                                  onClick={
                                    cellEditable
                                      ? () => startEdit(r, c)
                                      : undefined
                                  }
                                >
                                  {formatCell(value)}
                                </td>
                              );
                            })}
                            {editableTable && (
                              <td className={styles.actions}>
                                {editing && (
                                  <>
                                    <button
                                      type="button"
                                      className={styles.rowAction}
                                      title="Save changes"
                                      aria-label="Save changes"
                                      onClick={saveEdit}
                                    >
                                      💾
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.rowAction}
                                      title="Cancel"
                                      aria-label="Cancel"
                                      onClick={cancelEdit}
                                    >
                                      ✕
                                    </button>
                                  </>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {editableTable && insertValues && (
                        <tr
                          className={`${styles.editingRow} ${
                            flashing ? styles.errorFlash : ""
                          }`}
                          onAnimationEnd={() => setFlashing(false)}
                        >
                          <td className={styles.rowNumber} aria-hidden="true">
                            ＋
                          </td>
                          {result.columns.map((column, c) => (
                            <td key={c} className={styles.td}>
                              <input
                                className={styles.cellInput}
                                value={insertValues[c]}
                                autoFocus={c === 0}
                                onChange={(e) =>
                                  changeInsertCell(c, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveInsert();
                                  else if (e.key === "Escape") cancelInsert();
                                }}
                                aria-label={`New ${column} value`}
                              />
                            </td>
                          ))}
                          <td className={styles.actions}>
                            <button
                              type="button"
                              className={styles.rowAction}
                              title="Save new row"
                              aria-label="Save new row"
                              onClick={saveInsert}
                            >
                              💾
                            </button>
                            <button
                              type="button"
                              className={styles.rowAction}
                              title="Cancel"
                              aria-label="Cancel"
                              onClick={cancelInsert}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {editError && <p className={styles.error}>{editError}</p>}
                  {result.rows.length === 0 && !insertValues && (
                    <p className={styles.empty}>Query returned no rows.</p>
                  )}
                  {editableTable && !insertValues && (
                    <button
                      type="button"
                      className={styles.insertRow}
                      onClick={startInsert}
                    >
                      + Insert row
                    </button>
                  )}
                </>
              ) : (
                <p className={styles.empty}>
                  {result
                    ? "Query returned no rows."
                    : "Select a table to view its data."}
                </p>
              )}
            </div>

            <form
              className={styles.queryBar}
              onSubmit={(event) => {
                event.preventDefault();
                setEdit(null);
                setInsertValues(null);
                setEditError(null);
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
          </>
        )}
      </section>
    </div>
  );
}
