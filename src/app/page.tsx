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
  // The "open a server database" picker: open state + the loaded file list
  // (null while loading).
  const [browseOpen, setBrowseOpen] = useState(false);
  const [serverFiles, setServerFiles] = useState<
    { id: string; name: string }[] | null
  >(null);

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  /** Add a tab for the database, or focus (and refresh) it if already open. */
  function addOrFocusDatabase(info: DatabaseInfo) {
    const index = databases.findIndex((d) => d.id === info.id);
    if (index >= 0) {
      setActiveTab(index);
      setDatabases((prev) => prev.map((d) => (d.id === info.id ? info : d)));
    } else {
      setActiveTab(databases.length);
      setDatabases((prev) => [...prev, info]);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so selecting the same file again re-fires onChange.
    event.target.value = "";
    if (!file) return;

    setError(null);
    try {
      // Upload the file to the server, which opens it and reports its tables.
      addOrFocusDatabase(await api.uploadDatabase(file));
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not open “${file.name}”: ${err.message}`
          : `Could not open “${file.name}”.`,
      );
    }
  }

  /** Toggle the server-database picker, loading the file list when opening. */
  async function toggleBrowse() {
    if (browseOpen) {
      setBrowseOpen(false);
      return;
    }
    setBrowseOpen(true);
    setServerFiles(null);
    setError(null);
    try {
      setServerFiles(await api.listServerDatabases());
    } catch (err) {
      setBrowseOpen(false);
      setError(
        err instanceof Error
          ? `Could not list databases: ${err.message}`
          : "Could not list databases.",
      );
    }
  }

  /** Open a database already on the server, picked from the list. */
  async function openServerFile(id: string, name: string) {
    setBrowseOpen(false);
    setError(null);
    try {
      addOrFocusDatabase(await api.openServerDatabase(id));
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not open “${name}”: ${err.message}`
          : `Could not open “${name}”.`,
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
          title="Upload SQLite database"
          aria-label="Upload SQLite database"
          onClick={openFilePicker}
        >
          ⬆
        </button>
        <div className={styles.openMenu}>
          <button
            type="button"
            className={styles.iconButton}
            title="Open a database on the server"
            aria-label="Open a database on the server"
            aria-haspopup="menu"
            aria-expanded={browseOpen}
            onClick={toggleBrowse}
          >
            📂
          </button>
          {browseOpen && (
            <>
              <div
                className={styles.dropdownOverlay}
                onClick={() => setBrowseOpen(false)}
              />
              <div className={styles.dropdown} role="menu">
                {serverFiles === null ? (
                  <p className={styles.dropdownEmpty}>Loading…</p>
                ) : serverFiles.length === 0 ? (
                  <p className={styles.dropdownEmpty}>
                    No databases on the server
                  </p>
                ) : (
                  <ul className={styles.dropdownList}>
                    {serverFiles.map((file) => (
                      <li key={file.id}>
                        <button
                          type="button"
                          className={styles.dropdownItem}
                          role="menuitem"
                          onClick={() => openServerFile(file.id, file.name)}
                        >
                          {file.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
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
              Click the ⬆ icon to upload a SQLite file, or the 📂 icon to open
              one already on the server.
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
