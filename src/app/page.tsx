"use client";

import { useRef, useState, type ChangeEvent } from "react";
import TabRow from "@/components/TabRow";
import DatabaseView from "@/components/DatabaseView";
import * as api from "@/lib/api";
import type { DatabaseInfo } from "@/lib/schema";
import styles from "./page.module.css";

const ICONS = [
  { glyph: "▶", label: "Run query" },
  { glyph: "🔍", label: "Search" },
  { glyph: "🔄", label: "Refresh" },
];

export default function Home() {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
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
      // Upload the file to the server, which opens it and reports its tables.
      const info = await api.uploadDatabase(file);
      setActiveTab(databases.length); // index of the tab we're about to append
      setDatabases((prev) => [...prev, info]);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not open “${file.name}”: ${err.message}`
          : `Could not open “${file.name}”.`,
      );
    }
  }

  function saveActiveDatabase() {
    const database = databases[activeTab];
    if (!database) return;
    // The server streams the current bytes with a Content-Disposition header;
    // a transient anchor turns that into a download named after the file.
    const anchor = document.createElement("a");
    anchor.href = api.exportUrl(database.id);
    anchor.download = database.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function closeTab(index: number) {
    setDatabases((prev) => {
      // Release the server-side handle for the closed tab (the file is kept).
      const closed = prev[index];
      if (closed) void api.closeDatabase(closed.id).catch(() => {});
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

  async function refreshTables(id: string) {
    try {
      const tables = await api.listTables(id);
      setDatabases((prev) => prev.map((d) => (d.id === id ? { ...d, tables } : d)));
    } catch {
      // A failed refresh leaves the previous table list in place.
    }
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
        <button
          type="button"
          className={styles.iconButton}
          title="Save database to file"
          aria-label="Save database to file"
          onClick={saveActiveDatabase}
          disabled={!activeDatabase}
        >
          💾
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
