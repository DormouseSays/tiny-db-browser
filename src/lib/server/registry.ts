/**
 * Server-side registry of open SQLite databases.
 *
 * An uploaded file is written to the data directory and opened with sql.js; the
 * handle is held in memory for the lifetime of the tab. Mutations are written
 * straight back to the backing file so it always reflects the latest edits, and
 * the files themselves persist (they are not deleted when a tab closes).
 *
 * The registry and the sql.js init promise are stashed on `globalThis` so they
 * survive Next's dev-mode module reloading.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database, SqlJsStatic } from "sql.js";
import type { DatabaseInfo } from "../schema";
import { closeDatabase, exportDatabase, listTables } from "../sqlite";

/** Thrown when an operation references an id that isn't currently open. */
export class DatabaseNotFoundError extends Error {
  constructor(id: string) {
    super(`No open database with id "${id}".`);
    this.name = "DatabaseNotFoundError";
  }
}

type Entry = { id: string; name: string; path: string; db: Database };

const globalStore = globalThis as unknown as {
  __tdbRegistry?: Map<string, Entry>;
  __tdbSqlPromise?: Promise<SqlJsStatic>;
};

const registry: Map<string, Entry> =
  globalStore.__tdbRegistry ?? (globalStore.__tdbRegistry = new Map());

function getSqlJs(): Promise<SqlJsStatic> {
  // The asm.js build needs no separate .wasm file, sidestepping bundler
  // file-resolution issues; it loads cleanly in Node.
  if (!globalStore.__tdbSqlPromise) {
    globalStore.__tdbSqlPromise = initSqlJs();
  }
  return globalStore.__tdbSqlPromise;
}

/** Directory the uploaded database files live in (override via env for tests). */
function dataDir(): string {
  return (
    process.env.TINY_DB_DATA_DIR ??
    path.join(process.cwd(), ".data", "databases")
  );
}

/** Derive a database id from a filename: its base name without the extension. */
function idFromName(name: string): string {
  return path.parse(path.basename(name)).name;
}

/** Write an entry's current state back to its backing file. */
async function persist(entry: Entry): Promise<void> {
  await writeFile(entry.path, exportDatabase(entry.db));
}

/**
 * Save an uploaded SQLite file to the data directory under its original name and
 * open it, holding the handle until the tab is closed. The id is the file name
 * without its extension; re-uploading a name replaces the previous file and
 * handle. Throws if the bytes aren't a valid SQLite database.
 */
export async function openUploaded(
  name: string,
  bytes: Uint8Array,
): Promise<DatabaseInfo> {
  const SQL = await getSqlJs();
  // Opening validates the file header; do it before committing anything to disk.
  const db = new SQL.Database(bytes);
  const tables = listTables(db);

  const filename = path.basename(name);
  const id = idFromName(filename);
  if (!id) {
    db.close();
    throw new Error("Could not derive a database id from the file name.");
  }

  const dir = dataDir();
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, bytes);

  // Replace any handle previously held for this id.
  closeEntry(id);
  registry.set(id, { id, name: filename, path: filePath, db });
  return { id, name: filename, tables };
}

/** List the database files already on the server (whether open or not). */
export async function listFiles(): Promise<{ id: string; name: string }[]> {
  let names: string[];
  try {
    names = await readdir(dataDir());
  } catch {
    return []; // The data directory doesn't exist yet — nothing uploaded.
  }
  return names
    .filter((name) => !name.startsWith("."))
    .map((name) => ({ id: idFromName(name), name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Open a database file already on the server by id, reusing the existing handle
 * if it's already open. Throws `DatabaseNotFoundError` if no matching file
 * exists.
 */
export async function openExisting(id: string): Promise<DatabaseInfo> {
  const open = registry.get(id);
  if (open) {
    return { id, name: open.name, tables: listTables(open.db) };
  }

  let names: string[];
  try {
    names = await readdir(dataDir());
  } catch {
    throw new DatabaseNotFoundError(id);
  }
  const filename = names.find((name) => idFromName(name) === id);
  if (!filename) throw new DatabaseNotFoundError(id);

  const SQL = await getSqlJs();
  const filePath = path.join(dataDir(), filename);
  const db = new SQL.Database(new Uint8Array(await readFile(filePath)));
  registry.set(id, { id, name: filename, path: filePath, db });
  return { id, name: filename, tables: listTables(db) };
}

/** Look up an open database, throwing `DatabaseNotFoundError` if not held. */
export function requireEntry(id: string): Entry {
  const entry = registry.get(id);
  if (!entry) throw new DatabaseNotFoundError(id);
  return entry;
}

/** Read from a database without persisting (no mutation occurs). */
export function read<T>(id: string, fn: (db: Database) => T): T {
  return fn(requireEntry(id).db);
}

/**
 * Run an operation that may mutate the database, then immediately write the
 * updated bytes back to disk so the file always reflects the latest edits.
 */
export async function mutate<T>(
  id: string,
  fn: (db: Database) => T,
): Promise<T> {
  const entry = requireEntry(id);
  const result = fn(entry.db);
  await persist(entry);
  return result;
}

/** Close a database handle, keeping its file on disk. Idempotent. */
export function closeEntry(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  closeDatabase(entry.db);
  registry.delete(id);
}
