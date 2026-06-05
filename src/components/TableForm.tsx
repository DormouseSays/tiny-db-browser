"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import {
  COLUMN_TYPES,
  type ColumnDefinition,
  type ColumnType,
  type EditColumn,
} from "@/lib/schema";
import styles from "./TableForm.module.css";

type ColumnRow = EditColumn & { id: number };

type TableFormProps = {
  databaseId: string;
  /** Existing table names, used to reject duplicates before hitting SQLite. */
  existingTables: string[];
  /** The table being edited, or null/undefined to create a new one. */
  table?: string | null;
  onSaved: (name: string) => void;
  onCancel: () => void;
};

function blankColumn(id: number): ColumnRow {
  return { id, name: "", type: "TEXT", primaryKey: false, notNull: false };
}

export default function TableForm({
  databaseId,
  existingTables,
  table,
  onSaved,
  onCancel,
}: TableFormProps) {
  const editing = table != null;
  // When editing, the existing schema + row count are fetched on mount.
  const [loading, setLoading] = useState(editing);
  const [originalSchema, setOriginalSchema] = useState<ColumnDefinition[]>([]);
  const [rowCount, setRowCount] = useState(0);

  const nextId = useRef(1);
  const [name, setName] = useState(table ?? "");
  const [columns, setColumns] = useState<ColumnRow[]>(
    editing ? [] : [blankColumn(0)],
  );
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Load the existing table's schema and row count when editing.
  useEffect(() => {
    if (table == null) return;
    const target = table;
    let active = true;
    api
      .getTableSchema(databaseId, target)
      .then(({ columns: schema, rowCount: count }) => {
        if (!active) return;
        setOriginalSchema(schema);
        setRowCount(count);
        setColumns(
          schema.map((column, i) => ({
            ...column,
            id: i,
            originalName: column.name,
          })),
        );
        nextId.current = Math.max(schema.length, 1);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [databaseId, table]);

  function addColumn() {
    setColumns((prev) => [...prev, blankColumn(nextId.current++)]);
  }

  function removeColumn(id: number) {
    setColumns((prev) => prev.filter((column) => column.id !== id));
  }

  function updateColumn(id: number, patch: Partial<ColumnRow>) {
    setColumns((prev) =>
      prev.map((column) => (column.id === id ? { ...column, ...patch } : column)),
    );
  }

  /** Validate inputs and return the cleaned name + columns, or null on error. */
  function build(): { name: string; columns: ColumnRow[] } | null {
    const tableName = name.trim();
    if (!tableName) {
      setError("Enter a table name.");
      return null;
    }
    const originalLower = (table ?? "").toLowerCase();
    const collides = existingTables.some(
      (t) =>
        t.toLowerCase() === tableName.toLowerCase() &&
        t.toLowerCase() !== originalLower,
    );
    if (collides) {
      setError(`A table named “${tableName}” already exists.`);
      return null;
    }

    const defined = columns
      .map((column) => ({ ...column, name: column.name.trim() }))
      .filter((column) => column.name !== "");
    if (defined.length === 0) {
      setError("Add at least one named column.");
      return null;
    }
    const lowered = defined.map((c) => c.name.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      setError("Column names must be unique.");
      return null;
    }

    setError(null);
    return { name: tableName, columns: defined };
  }

  /** Describe data that would be lost by saving, or null if the edit is safe. */
  function dataLoss(next: ColumnRow[]): string | null {
    if (!editing || rowCount === 0) return null;
    const kept = new Set(
      next.map((c) => c.originalName).filter(Boolean) as string[],
    );
    const dropped = originalSchema
      .map((c) => c.name)
      .filter((columnName) => !kept.has(columnName));
    if (dropped.length === 0) return null;
    const cols = dropped.map((c) => `“${c}”`).join(", ");
    const rows = `${rowCount} row${rowCount === 1 ? "" : "s"}`;
    return `This will permanently delete the data in ${
      dropped.length === 1 ? "column" : "columns"
    } ${cols} across ${rows}.`;
  }

  async function apply(built: { name: string; columns: ColumnRow[] }) {
    try {
      if (table != null) {
        await api.rebuildTable(databaseId, table, built.name, built.columns);
      } else {
        await api.createTable(databaseId, built.name, built.columns);
      }
      onSaved(built.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWarning(null);
    }
  }

  function handleSubmit() {
    const built = build();
    if (!built) return;
    const loss = dataLoss(built.columns);
    if (loss) {
      setWarning(loss);
      return;
    }
    apply(built);
  }

  function confirmSave() {
    const built = build();
    if (built) apply(built);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <div className={styles.header}>{editing ? "Edit table" : "New table"}</div>

      <div className={styles.body}>
        {loading ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
        <>
        <label className={styles.nameField}>
          <span className={styles.label}>Table name</span>
          <input
            className={styles.nameInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. customers"
            spellCheck={false}
            autoFocus
          />
        </label>

        <div className={styles.columnsHeader}>
          <span className={styles.label}>Columns</span>
          <button type="button" className={styles.addColumn} onClick={addColumn}>
            + Add column
          </button>
        </div>

        <table className={styles.columnsTable}>
          <thead>
            <tr>
              <th className={styles.colName}>Name</th>
              <th className={styles.colType}>Type</th>
              <th className={styles.colFlag}>PK</th>
              <th className={styles.colFlag}>Not null</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.id}>
                <td>
                  <input
                    className={styles.cellInput}
                    value={column.name}
                    onChange={(event) =>
                      updateColumn(column.id, { name: event.target.value })
                    }
                    placeholder="column_name"
                    spellCheck={false}
                    aria-label="Column name"
                  />
                </td>
                <td>
                  <select
                    className={styles.cellSelect}
                    value={column.type}
                    onChange={(event) =>
                      updateColumn(column.id, {
                        type: event.target.value as ColumnType,
                      })
                    }
                    aria-label="Column type"
                  >
                    {Array.from(new Set([column.type, ...COLUMN_TYPES])).map(
                      (type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ),
                    )}
                  </select>
                </td>
                <td className={styles.flagCell}>
                  <input
                    type="checkbox"
                    checked={column.primaryKey}
                    onChange={(event) =>
                      updateColumn(column.id, { primaryKey: event.target.checked })
                    }
                    aria-label="Primary key"
                  />
                </td>
                <td className={styles.flagCell}>
                  <input
                    type="checkbox"
                    checked={column.notNull}
                    disabled={column.primaryKey}
                    onChange={(event) =>
                      updateColumn(column.id, { notNull: event.target.checked })
                    }
                    aria-label="Not null"
                  />
                </td>
                <td className={styles.flagCell}>
                  <button
                    type="button"
                    className={styles.removeColumn}
                    onClick={() => removeColumn(column.id)}
                    disabled={columns.length === 1}
                    aria-label="Remove column"
                    title="Remove column"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {error && <p className={styles.error}>{error}</p>}
        {warning && (
          <div className={styles.warning}>
            <strong className={styles.warningTitle}>⚠ Data loss warning</strong>
            <p>{warning}</p>
          </div>
        )}
        </>
        )}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        {warning ? (
          <button type="button" className={styles.danger} onClick={confirmSave}>
            Save anyway
          </button>
        ) : (
          <button type="submit" className={styles.create} disabled={loading}>
            {editing ? "Save changes" : "Create table"}
          </button>
        )}
      </div>
    </form>
  );
}
