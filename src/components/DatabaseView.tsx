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
import TableList from "./TableList";
import DataGrid from "./DataGrid";
import QueryBar from "./QueryBar";
import { useTableEditing } from "./useTableEditing";
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

  const editing = useTableEditing({
    databaseId: id,
    table: editableTable,
    result,
    rowIds,
    reload: (table) => runLoad(() => loadTableState(id, table)),
  });

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

  function selectTable(table: string) {
    setEditor(null);
    editing.reset();
    setSelectedTable(table);
    setSql(tableQuery(table));
    runLoad(() => loadTableState(id, table));
  }

  async function handleSaved(name: string) {
    await onSchemaChange?.();
    selectTable(name);
  }

  function runSql() {
    editing.reset();
    runLoad(() => runAdHoc(id, sql));
  }

  return (
    <div className={styles.view}>
      <TableList
        tables={tables}
        selectedTable={selectedTable}
        editorTable={editor === null ? undefined : editor.table}
        onSelect={selectTable}
        onEdit={(table) => setEditor({ table })}
        onAddTable={() => setEditor({ table: null })}
      />

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
            <DataGrid
              result={result}
              error={error}
              busy={busy}
              editableTable={editableTable}
              editing={editing}
            />
            <QueryBar value={sql} onChange={setSql} onRun={runSql} />
          </>
        )}
      </section>
    </div>
  );
}
