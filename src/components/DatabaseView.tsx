"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import {
  tableQuery,
  type DatabaseInfo,
  type QueryResult,
  type SqlValue,
} from "@/lib/schema";
import TableForm from "./TableForm";
import styles from "./DatabaseView.module.css";

/** The table editor is open either to create a new table (`table: null`) or to
 * edit an existing one (`table: name`); `null` means the editor is closed. */
type EditorState = { table: string | null } | null;

type DatabaseViewProps = {
  database: DatabaseInfo;
  /** Called after the schema changes (e.g. a table is created) so the parent
   * can refresh the tab's table list. */
  onSchemaChange?: () => void | Promise<void>;
};

type QueryState = {
  result: QueryResult | null;
  error: string | null;
  /** The table being viewed directly, whose rows are editable; null for
   * ad-hoc queries and tables without a rowid. */
  table: string | null;
  /** rowid for each row in `result`, parallel to `result.rows`. */
  rowIds: SqlValue[];
};

/** An empty (nothing selected) query state. */
const EMPTY_QUERY: QueryState = {
  result: null,
  error: null,
  table: null,
  rowIds: [],
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run ad-hoc SQL via the API. The result is not editable (we can't map
 * arbitrary rows back to a table), so `table`/`rowIds` are cleared. */
async function runAdHoc(id: string, sql: string): Promise<QueryState> {
  try {
    const result = await api.runQuery(id, sql);
    return { result, error: null, table: null, rowIds: [] };
  } catch (err) {
    return { result: null, error: errorMessage(err), table: null, rowIds: [] };
  }
}

/** Load a table directly so its rows are editable, falling back to a read-only
 * query for tables without a rowid (WITHOUT ROWID tables). */
async function loadTableState(id: string, table: string): Promise<QueryState> {
  try {
    const data = await api.readTable(id, table);
    return {
      result: { columns: data.columns, rows: data.rows },
      error: null,
      table,
      rowIds: data.rowIds,
    };
  } catch {
    // e.g. WITHOUT ROWID tables have no rowid; show them read-only.
    return runAdHoc(id, tableQuery(table));
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
  const { id, tables } = database;
  const firstTable = tables[0] ?? null;
  const [selectedTable, setSelectedTable] = useState<string | null>(firstTable);
  const [editor, setEditor] = useState<EditorState>(null);
  const [sql, setSql] = useState(firstTable ? tableQuery(firstTable) : "");
  const [query, setQuery] = useState<QueryState>(EMPTY_QUERY);
  // Start busy when there's a table to load on mount, so the grid shows a
  // loading state immediately rather than the "select a table" placeholder.
  const [busy, setBusy] = useState(Boolean(firstTable));
  // The row currently being edited inline, or null when none is.
  const [edit, setEdit] = useState<RowEdit | null>(null);
  // In-progress new row appended below the table, or null when not inserting.
  // One string per column, parallel to `result.columns`.
  const [insertValues, setInsertValues] = useState<string[] | null>(null);
  // The index of the row awaiting delete confirmation, or null when none is.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  // A failure from the last save attempt, shown below the grid.
  const [editError, setEditError] = useState<string | null>(null);
  // When true, the active row plays its red error-flash animation; cleared when
  // the animation ends, so a repeated failure can replay it.
  const [flashing, setFlashing] = useState(false);
  const { result, error, table: editableTable, rowIds } = query;

  // Discards the results of superseded loads, so rapid table switching or
  // re-querying never lands a stale result in the grid.
  const requestSeq = useRef(0);

  /** Apply a loader's result only if it's still the latest request, showing the
   * loading state meanwhile. For use from event handlers. */
  async function runLoad(loader: () => Promise<QueryState>) {
    const seq = ++requestSeq.current;
    setBusy(true);
    const next = await loader();
    if (seq === requestSeq.current) {
      setQuery(next);
      setBusy(false);
    }
  }

  // Load the first table once the database (tab) mounts. The component is keyed
  // by database id in the parent, so this re-runs when a different db opens.
  // `busy` starts true (above), and state is only set inside the async callback,
  // so the effect never calls setState synchronously.
  useEffect(() => {
    if (!firstTable) return;
    const seq = ++requestSeq.current;
    loadTableState(id, firstTable).then((next) => {
      if (seq === requestSeq.current) {
        setQuery(next);
        setBusy(false);
      }
    });
  }, [id, firstTable]);

  /** Surface a failed save/insert: show the message and flash the row red. */
  function reportEditError(err: unknown) {
    setEditError(errorMessage(err));
    setFlashing(true);
  }

  function selectTable(table: string) {
    setEditor(null);
    setEdit(null);
    setInsertValues(null);
    setPendingDelete(null);
    setEditError(null);
    setSelectedTable(table);
    setSql(tableQuery(table));
    runLoad(() => loadTableState(id, table));
  }

  async function handleSaved(name: string) {
    await onSchemaChange?.();
    selectTable(name);
  }

  function startEdit(rowIndex: number, colIndex: number) {
    if (!editableTable || !result) return;
    setEditError(null);
    setInsertValues(null);
    setPendingDelete(null);
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

  async function saveEdit() {
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
    const table = editableTable;
    try {
      await api.updateRow(id, table, rowIds[edit.rowIndex], values);
      setEdit(null);
      setEditError(null);
      // Re-read so the grid reflects how SQLite stored the values.
      runLoad(() => loadTableState(id, table));
    } catch (err) {
      reportEditError(err);
    }
  }

  function startInsert() {
    if (!editableTable || !result) return;
    setEdit(null);
    setPendingDelete(null);
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

  async function saveInsert() {
    if (!insertValues || !editableTable || !result) return;
    const values: Record<string, SqlValue> = {};
    result.columns.forEach((column, c) => {
      const text = insertValues[c];
      // An empty input means NULL (so the column takes its default); otherwise
      // let column affinity coerce the string.
      values[column] = text === "" ? null : text;
    });
    const table = editableTable;
    try {
      await api.insertRow(id, table, values);
      setInsertValues(null);
      setEditError(null);
      // Re-read so the new row (and any defaults SQLite filled in) appears.
      runLoad(() => loadTableState(id, table));
    } catch (err) {
      reportEditError(err);
    }
  }

  /** Arm delete confirmation for a row, cancelling any in-progress edit/insert. */
  function startDelete(rowIndex: number) {
    if (!editableTable) return;
    setEdit(null);
    setInsertValues(null);
    setEditError(null);
    setPendingDelete(rowIndex);
  }

  function cancelDelete() {
    setPendingDelete(null);
    setEditError(null);
  }

  async function confirmDelete() {
    if (pendingDelete === null || !editableTable) return;
    const table = editableTable;
    try {
      await api.deleteRow(id, table, rowIds[pendingDelete]);
      setPendingDelete(null);
      setEditError(null);
      // Re-read so the grid drops the deleted row and renumbers the rest.
      runLoad(() => loadTableState(id, table));
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
            databaseId={id}
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
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, r) => {
                        const editing = edit?.rowIndex === r;
                        const confirmingDelete = pendingDelete === r;
                        const active = editing || confirmingDelete;
                        return (
                          <tr
                            key={r}
                            className={
                              active
                                ? `${
                                    editing
                                      ? styles.editingRow
                                      : styles.pendingDeleteRow
                                  } ${flashing ? styles.errorFlash : ""}`
                                : undefined
                            }
                            onAnimationEnd={() => setFlashing(false)}
                          >
                            <td className={styles.rowNumber}>
                              {editing ? (
                                <div className={styles.rowActions}>
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
                                </div>
                              ) : confirmingDelete ? (
                                <div className={styles.rowActions}>
                                  <button
                                    type="button"
                                    className={`${styles.rowAction} ${styles.rowActionDanger}`}
                                    title="Confirm delete"
                                    aria-label="Confirm delete"
                                    onClick={confirmDelete}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.rowAction}
                                    title="Cancel delete"
                                    aria-label="Cancel delete"
                                    onClick={cancelDelete}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {r + 1}
                                  {editableTable && (
                                    <button
                                      type="button"
                                      className={styles.deleteRow}
                                      title="Delete row"
                                      aria-label="Delete row"
                                      onClick={() => startDelete(r)}
                                    >
                                      🗑
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
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
                          <td className={styles.rowNumber}>
                            <div className={styles.rowActions}>
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
                            </div>
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
                  {busy
                    ? "Loading…"
                    : result
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
                runLoad(() => runAdHoc(id, sql));
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
