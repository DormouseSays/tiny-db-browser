"use client";

import { useRef, useState, type ChangeEvent } from "react";
import TabRow from "@/components/TabRow";
import DatabaseView from "@/components/DatabaseView";
import { loadSqliteFile, type LoadedDatabase } from "@/lib/sqlite";
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
      />

      {/* Content area */}
      <main className={styles.content}>
        {error && <p className={styles.error}>{error}</p>}
        {activeDatabase ? (
          <DatabaseView database={activeDatabase} />
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
