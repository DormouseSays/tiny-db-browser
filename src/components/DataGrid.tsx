"use client";

import type { SqlValue, QueryResult } from "@/lib/schema";
import RowActions from "./RowActions";
import type { TableEditing } from "./useTableEditing";
import styles from "./DataGrid.module.css";

/** Render a raw SQLite cell value for display in the grid. */
function formatCell(value: SqlValue) {
  if (value === null) return <span className={styles.null}>NULL</span>;
  if (value instanceof Uint8Array) {
    return <span className={styles.blob}>[{value.length} bytes]</span>;
  }
  return String(value);
}

type DataGridProps = {
  result: QueryResult | null;
  /** Query-level error (e.g. bad SQL), shown instead of the grid. */
  error: string | null;
  busy: boolean;
  /** Editable table name, or null when the result is read-only. */
  editableTable: string | null;
  editing: TableEditing;
};

/**
 * The scrollable results table: column headers, a numbered row per result row,
 * an optional insert row, and the inline edit/insert error. Editing behaviour is
 * delegated entirely to the `editing` controller.
 */
export default function DataGrid({
  result,
  error,
  busy,
  editableTable,
  editing,
}: DataGridProps) {
  if (error) {
    return (
      <div className={styles.grid}>
        <p className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!result || result.columns.length === 0) {
    return (
      <div className={styles.grid}>
        <p className={styles.empty}>
          {busy
            ? "Loading…"
            : result
              ? "Query returned no rows."
              : "Select a table to view its data."}
        </p>
      </div>
    );
  }

  const { insertValues } = editing;

  return (
    <div className={styles.grid}>
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
            <DataRow
              key={r}
              row={row}
              index={r}
              columns={result.columns}
              editableTable={editableTable}
              editing={editing}
            />
          ))}
          {editableTable && insertValues && (
            <InsertRow
              columns={result.columns}
              values={insertValues}
              editing={editing}
            />
          )}
        </tbody>
      </table>
      {editing.error && <p className={styles.error}>{editing.error}</p>}
      {result.rows.length === 0 && !insertValues && (
        <p className={styles.empty}>Query returned no rows.</p>
      )}
      {editableTable && !insertValues && (
        <button
          type="button"
          className={styles.insertRow}
          onClick={editing.startInsert}
        >
          + Insert row
        </button>
      )}
    </div>
  );
}

type DataRowProps = {
  row: SqlValue[];
  index: number;
  columns: string[];
  editableTable: string | null;
  editing: TableEditing;
};

/** One result row: its number/action column followed by its data cells. */
function DataRow({ row, index, columns, editableTable, editing }: DataRowProps) {
  const { edit, pendingDelete, flashing } = editing;
  const rowEdit = edit && edit.rowIndex === index ? edit : null;
  const confirmingDelete = pendingDelete === index;
  const active = rowEdit !== null || confirmingDelete;

  return (
    <tr
      className={
        active
          ? `${rowEdit ? styles.editingRow : styles.pendingDeleteRow} ${
              flashing ? styles.errorFlash : ""
            }`
          : undefined
      }
      onAnimationEnd={editing.endFlash}
    >
      <td className={styles.rowNumber}>
        {rowEdit ? (
          <RowActions
            actions={[
              { glyph: "💾", label: "Save changes", onClick: editing.saveEdit },
              { glyph: "✕", label: "Cancel", onClick: editing.cancelEdit },
            ]}
          />
        ) : confirmingDelete ? (
          <RowActions
            actions={[
              {
                glyph: "✓",
                label: "Confirm delete",
                onClick: editing.confirmDelete,
                danger: true,
              },
              { glyph: "✕", label: "Cancel delete", onClick: editing.cancelDelete },
            ]}
          />
        ) : (
          <>
            {index + 1}
            {editableTable && (
              <button
                type="button"
                className={styles.deleteRow}
                title="Delete row"
                aria-label="Delete row"
                onClick={() => editing.startDelete(index)}
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
        if (rowEdit && !isBlob) {
          return (
            <td key={c} className={styles.td}>
              <input
                className={styles.cellInput}
                value={rowEdit.values[c]}
                autoFocus={c === rowEdit.colIndex}
                onChange={(e) => editing.changeCell(c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") editing.saveEdit();
                  else if (e.key === "Escape") editing.cancelEdit();
                }}
                aria-label={`${columns[c]} value`}
              />
            </td>
          );
        }
        return (
          <td
            key={c}
            className={`${styles.td} ${cellEditable ? styles.editable : ""}`}
            onClick={cellEditable ? () => editing.startEdit(index, c) : undefined}
          >
            {formatCell(value)}
          </td>
        );
      })}
    </tr>
  );
}

type InsertRowProps = {
  columns: string[];
  values: string[];
  editing: TableEditing;
};

/** The in-progress new row appended below the grid while inserting. */
function InsertRow({ columns, values, editing }: InsertRowProps) {
  return (
    <tr
      className={`${styles.editingRow} ${
        editing.flashing ? styles.errorFlash : ""
      }`}
      onAnimationEnd={editing.endFlash}
    >
      <td className={styles.rowNumber}>
        <RowActions
          actions={[
            { glyph: "💾", label: "Save new row", onClick: editing.saveInsert },
            { glyph: "✕", label: "Cancel", onClick: editing.cancelInsert },
          ]}
        />
      </td>
      {columns.map((column, c) => (
        <td key={c} className={styles.td}>
          <input
            className={styles.cellInput}
            value={values[c]}
            autoFocus={c === 0}
            onChange={(e) => editing.changeInsertCell(c, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") editing.saveInsert();
              else if (e.key === "Escape") editing.cancelInsert();
            }}
            aria-label={`New ${column} value`}
          />
        </td>
      ))}
    </tr>
  );
}
