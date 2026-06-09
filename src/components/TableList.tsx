"use client";

import styles from "./TableList.module.css";

type TableListProps = {
  tables: string[];
  /** The table currently shown in the grid. */
  selectedTable: string | null;
  /**
   * Which table the schema editor targets: a name when editing an existing
   * table, `null` when the editor is open for a new table, or `undefined` when
   * the editor is closed.
   */
  editorTable: string | null | undefined;
  onSelect: (table: string) => void;
  onEdit: (table: string) => void;
  onAddTable: () => void;
};

/** The left sidebar: the list of tables plus the "add table" button. */
export default function TableList({
  tables,
  selectedTable,
  editorTable,
  onSelect,
  onEdit,
  onAddTable,
}: TableListProps) {
  const editorOpen = editorTable !== undefined;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>Tables ({tables.length})</div>
      {tables.length === 0 ? (
        <p className={styles.empty}>No tables</p>
      ) : (
        <ul className={styles.tableList}>
          {tables.map((table) => {
            const highlighted = editorOpen
              ? editorTable === table
              : table === selectedTable;
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
                  onClick={() => onSelect(table)}
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
                  onClick={() => onEdit(table)}
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
          editorTable === null ? styles.addTableActive : ""
        }`}
        onClick={onAddTable}
      >
        + Add table
      </button>
    </aside>
  );
}
