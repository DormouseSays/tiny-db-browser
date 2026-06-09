import { useState } from "react";
import * as api from "@/lib/api";
import type { QueryResult, SqlValue } from "@/lib/schema";

/** A row being edited: the row's index in the grid, the column the edit started
 * in (focused on open), and the in-progress string value of each cell. */
export type RowEdit = { rowIndex: number; colIndex: number; values: string[] };

/** Convert a cell value to the string shown in its edit input. */
function toInputValue(value: SqlValue): string {
  if (value === null || value instanceof Uint8Array) return "";
  return String(value);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Options = {
  databaseId: string;
  /** The editable table name, or null when the current result is read-only. */
  table: string | null;
  result: QueryResult | null;
  /** rowid for each row in `result`, parallel to `result.rows`. */
  rowIds: SqlValue[];
  /** Reload the table after a successful mutation. */
  reload: (table: string) => void;
};

export type TableEditing = ReturnType<typeof useTableEditing>;

/**
 * Owns the inline edit / insert / delete state for the rows of one table and the
 * API calls that commit them. Keeping this out of the view leaves `DatabaseView`
 * responsible only for loading data and `DataGrid` for rendering it.
 *
 * Only one of edit / insert / delete is ever active at a time; starting one
 * clears the others. A failed mutation surfaces `error` and sets `flashing` so
 * the active row plays its red error animation.
 */
export function useTableEditing({
  databaseId,
  table,
  result,
  rowIds,
  reload,
}: Options) {
  // The row currently being edited inline, or null when none is.
  const [edit, setEdit] = useState<RowEdit | null>(null);
  // In-progress new row, one string per column parallel to `result.columns`, or
  // null when not inserting.
  const [insertValues, setInsertValues] = useState<string[] | null>(null);
  // The index of the row awaiting delete confirmation, or null when none is.
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  // A failure from the last mutation, shown below the grid.
  const [error, setError] = useState<string | null>(null);
  // When true, the active row plays its red error-flash animation; cleared when
  // the animation ends, so a repeated failure can replay it.
  const [flashing, setFlashing] = useState(false);

  /** Clear every in-progress action (used when navigating away). */
  function reset() {
    setEdit(null);
    setInsertValues(null);
    setPendingDelete(null);
    setError(null);
  }

  /** Surface a failed mutation: show the message and flash the active row red. */
  function reportError(err: unknown) {
    setError(errorMessage(err));
    setFlashing(true);
  }

  function startEdit(rowIndex: number, colIndex: number) {
    if (!table || !result) return;
    setInsertValues(null);
    setPendingDelete(null);
    setError(null);
    setEdit({
      rowIndex,
      colIndex,
      values: result.rows[rowIndex].map(toInputValue),
    });
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
    setError(null);
  }

  async function saveEdit() {
    if (!edit || !table || !result) return;
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
      await api.updateRow(databaseId, table, rowIds[edit.rowIndex], values);
      setEdit(null);
      setError(null);
      // Re-read so the grid reflects how SQLite stored the values.
      reload(table);
    } catch (err) {
      reportError(err);
    }
  }

  function startInsert() {
    if (!table || !result) return;
    setEdit(null);
    setPendingDelete(null);
    setError(null);
    setInsertValues(result.columns.map(() => ""));
  }

  function changeInsertCell(colIndex: number, value: string) {
    setInsertValues((prev) =>
      prev ? prev.map((v, i) => (i === colIndex ? value : v)) : prev,
    );
  }

  function cancelInsert() {
    setInsertValues(null);
    setError(null);
  }

  async function saveInsert() {
    if (!insertValues || !table || !result) return;
    const values: Record<string, SqlValue> = {};
    result.columns.forEach((column, c) => {
      const text = insertValues[c];
      // An empty input means NULL (so the column takes its default); otherwise
      // let column affinity coerce the string.
      values[column] = text === "" ? null : text;
    });
    try {
      await api.insertRow(databaseId, table, values);
      setInsertValues(null);
      setError(null);
      // Re-read so the new row (and any defaults SQLite filled in) appears.
      reload(table);
    } catch (err) {
      reportError(err);
    }
  }

  /** Arm delete confirmation for a row, cancelling any in-progress edit/insert. */
  function startDelete(rowIndex: number) {
    if (!table) return;
    setEdit(null);
    setInsertValues(null);
    setError(null);
    setPendingDelete(rowIndex);
  }

  function cancelDelete() {
    setPendingDelete(null);
    setError(null);
  }

  async function confirmDelete() {
    if (pendingDelete === null || !table) return;
    try {
      await api.deleteRow(databaseId, table, rowIds[pendingDelete]);
      setPendingDelete(null);
      setError(null);
      // Re-read so the grid drops the deleted row and renumbers the rest.
      reload(table);
    } catch (err) {
      reportError(err);
    }
  }

  return {
    edit,
    insertValues,
    pendingDelete,
    error,
    flashing,
    reset,
    endFlash: () => setFlashing(false),
    startEdit,
    changeCell,
    saveEdit,
    cancelEdit,
    startInsert,
    changeInsertCell,
    saveInsert,
    cancelInsert,
    startDelete,
    confirmDelete,
    cancelDelete,
  };
}
