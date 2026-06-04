import initSqlJs, { type SqlJsStatic } from "sql.js";

/**
 * sql.js compiles SQLite to WebAssembly. The wasm binary is served from
 * `public/` (copied from the sql.js dist), so `locateFile` just points at the
 * site root. Initialization is cached — the wasm is fetched and compiled once.
 */
let sqlPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: (file) => `/${file}` });
  }
  return sqlPromise;
}

export type LoadedDatabase = {
  /** The original filename, used as the tab title. */
  name: string;
  /** User table names, alphabetically sorted (internal sqlite_* tables excluded). */
  tables: string[];
};

/** Read a user-selected SQLite file fully into memory and list its tables. */
export async function loadSqliteFile(file: File): Promise<LoadedDatabase> {
  const SQL = await getSqlJs();
  const buffer = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));
  try {
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tables = result[0]?.values.map((row) => String(row[0])) ?? [];
    return { name: file.name, tables };
  } finally {
    // The byte buffer is loaded; we only need the table list, so free the
    // native memory rather than holding the handle open per tab.
    db.close();
  }
}
