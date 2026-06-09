import { mkdirSync } from "node:fs";
import path from "node:path";
import DatabaseConstructor from "better-sqlite3";

/** Where the seeded fixture database is written, shared with the spec. */
export const FIXTURE_DIR = path.join(__dirname, "fixtures");
export const FIXTURE_DB = path.join(FIXTURE_DIR, "sample.db");

/** The seeded table and its rows, asserted on in the spec. */
export const FIXTURE_TABLE = "widgets";
export const FIXTURE_ROWS = [
  { id: 1, name: "Sprocket", quantity: 12 },
  { id: 2, name: "Cog", quantity: 7 },
  { id: 3, name: "Flange", quantity: 23 },
];

/**
 * Build a small, deterministic SQLite database for the e2e tests to upload, so a
 * run never depends on the contents of `.data` or the configured presets. Runs
 * once before the suite; rebuilt fresh each time so a stale fixture can't linger.
 */
export default function globalSetup() {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const db = new DatabaseConstructor(FIXTURE_DB);
  try {
    db.exec(`DROP TABLE IF EXISTS ${FIXTURE_TABLE}`);
    db.exec(
      `CREATE TABLE ${FIXTURE_TABLE} (
         id INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         quantity INTEGER NOT NULL
       )`,
    );
    const insert = db.prepare(
      `INSERT INTO ${FIXTURE_TABLE} (id, name, quantity) VALUES (?, ?, ?)`,
    );
    const insertAll = db.transaction((rows: typeof FIXTURE_ROWS) => {
      for (const row of rows) insert.run(row.id, row.name, row.quantity);
    });
    insertAll(FIXTURE_ROWS);
  } finally {
    db.close();
  }
}
