"use client";

import { useRef, useState, type ChangeEvent } from "react";
import TabRow from "@/components/TabRow";
import DatabaseView from "@/components/DatabaseView";
import {
  closeDatabase,
  listTables,
  loadSqliteFile,
  type LoadedDatabase,
} from "@/lib/sqlite";
import styles from "./page.module.css";

const ICONS = [
  { glyph: "▶", label: "Run query" },
  { glyph: "🔍", label: "Search" },
  { glyph: "🔄", label: "Refresh" },
];

type OpenDatabase = LoadedDatabase & { id: string };

export default function Home() {
  const [databases, setDatabases] = useState<OpenDatabase[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so selecting the same file again re-fires onChange.
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      const loaded = await loadSqliteFile(file);
      setActiveTab(databases.length); // index of the tab we're about to append
      setDatabases((prev) => [...prev, { ...loaded, id: crypto.randomUUID() }]);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not open “${file.name}”: ${err.message}`
          : `Could not open “${file.name}”.`,
      );
    }
  }

  function closeTab(index: number) {
    setDatabases((prev) => {
      // Free the native (wasm) memory held by the closed tab's handle.
      const closed = prev[index];
      if (closed) closeDatabase(closed);
      return prev.filter((_, i) => i !== index);
    });
    // Keep the active tab pointing at a valid index. Closing a tab before the
    // active one shifts it left; closing the active or a later tab clamps it.
    setActiveTab((current) => {
      if (index < current) return current - 1;
      if (index === current) return Math.max(0, current - 1);
      return current;
    });
  }

  function refreshTables(id: string) {
    setDatabases((prev) =>
      prev.map((d) => (d.id === id ? { ...d, tables: listTables(d.db) } : d)),
    );
  }

  const activeDatabase = databases[activeTab];

  return (
    <div className={styles.window}>
      {/* Icon menu bar */}
      <div className={styles.menuBar}>
        <button
          type="button"
          className={styles.iconButton}
          title="Open SQLite database"
          aria-label="Open SQLite database"
          onClick={openFilePicker}
        >
          🗄
        </button>
        {ICONS.map((icon) => (
          <button
            key={icon.label}
            type="button"
            className={styles.iconButton}
            title={icon.label}
            aria-label={icon.label}
          >
            {icon.glyph}
          </button>
        ))}
        <span className={styles.menuSpacer} />
        <button
          type="button"
          className={styles.iconButton}
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sqlite,.sqlite3,.db,.db3"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {/* Tab row */}
      <TabRow
        tabs={databases.map((db) => db.name)}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onClose={closeTab}
      />

      {/* Content area */}
      <main className={styles.content}>
        {error && <p className={styles.error}>{error}</p>}
        {activeDatabase ? (
          <DatabaseView
            key={activeDatabase.id}
            database={activeDatabase}
            onSchemaChange={() => refreshTables(activeDatabase.id)}
          />
        ) : (
          <div className={styles.placeholder}>
            <p className={styles.placeholderTitle}>No database open</p>
            <p>
              Click the 🗄 icon in the menu bar to open a SQLite file and browse
              its tables.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>{databases.length === 0 ? "Ready" : `${databases.length} open`}</span>
        {activeDatabase && (
          <span>
            {activeDatabase.tables.length}{" "}
            {activeDatabase.tables.length === 1 ? "table" : "tables"}
          </span>
        )}
      </footer>
    </div>
  );
}
