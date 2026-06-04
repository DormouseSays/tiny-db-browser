"use client";

import { useRef, useState } from "react";
import {
  COLUMN_TYPES,
  createTable,
  type ColumnDefinition,
  type ColumnType,
  type LoadedDatabase,
} from "@/lib/sqlite";
import styles from "./CreateTableForm.module.css";

type ColumnRow = ColumnDefinition & { id: number };

type CreateTableFormProps = {
  db: LoadedDatabase["db"];
  /** Existing table names, used to reject duplicates before hitting SQLite. */
  existingTables: string[];
  onCreated: (name: string) => void;
  onCancel: () => void;
};

function blankColumn(id: number): ColumnRow {
  return { id, name: "", type: "TEXT", primaryKey: false, notNull: false };
}

export default function CreateTableForm({
  db,
  existingTables,
  onCreated,
  onCancel,
}: CreateTableFormProps) {
  const nextId = useRef(1);
  const [name, setName] = useState("");
  const [columns, setColumns] = useState<ColumnRow[]>(() => [blankColumn(0)]);
  const [error, setError] = useState<string | null>(null);

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

  function submit() {
    const tableName = name.trim();
    if (!tableName) {
      setError("Enter a table name.");
      return;
    }
    if (existingTables.some((t) => t.toLowerCase() === tableName.toLowerCase())) {
      setError(`A table named “${tableName}” already exists.`);
      return;
    }

    const defined = columns
      .map((column) => ({ ...column, name: column.name.trim() }))
      .filter((column) => column.name !== "");
    if (defined.length === 0) {
      setError("Add at least one named column.");
      return;
    }
    const lowered = defined.map((c) => c.name.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      setError("Column names must be unique.");
      return;
    }

    try {
      createTable(db, tableName, defined);
      onCreated(tableName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className={styles.header}>New table</div>

      <div className={styles.body}>
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
                    {COLUMN_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
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
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={styles.create}>
          Create table
        </button>
      </div>
    </form>
  );
}
