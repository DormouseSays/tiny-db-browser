import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { SqlJsStatic } from "sql.js";
import {
  DatabaseNotFoundError,
  closeEntry,
  listFiles,
  mutate,
  openExisting,
  openUploaded,
  read,
  requireEntry,
} from "./registry";
import { countRows, insertRow } from "../sqlite";

let SQL: SqlJsStatic;
let dir: string;

/** Build a small SQLite file image to stand in for an uploaded file. */
function sampleBytes(): Uint8Array {
  const db = new SQL.Database();
  db.run("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
  db.run("INSERT INTO users (id, name) VALUES (1, 'Ada')");
  const bytes = db.export();
  db.close();
  return bytes;
}

beforeAll(async () => {
  SQL = await initSqlJs();
  dir = await mkdtemp(path.join(tmpdir(), "tdb-registry-"));
  process.env.TINY_DB_DATA_DIR = dir;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.TINY_DB_DATA_DIR;
});

describe("openUploaded", () => {
  it("keeps the original filename, ids by name without extension, reports tables", async () => {
    const info = await openUploaded("people.sqlite", sampleBytes());
    expect(info.id).toBe("people");
    expect(info.name).toBe("people.sqlite");
    expect(info.tables).toEqual(["users"]);

    // The file is stored under its original name in the data directory.
    const onDisk = await readFile(path.join(dir, "people.sqlite"));
    expect(new TextDecoder().decode(onDisk.subarray(0, 15))).toBe(
      "SQLite format 3",
    );
    closeEntry(info.id);
  });

  it("strips only the final extension when deriving the id", async () => {
    const info = await openUploaded("my.data.db", sampleBytes());
    expect(info.id).toBe("my.data");
    expect(info.name).toBe("my.data.db");
    await expect(readFile(path.join(dir, "my.data.db"))).resolves.toBeDefined();
    closeEntry(info.id);
  });

  it("rejects bytes that aren't a SQLite database", async () => {
    await expect(
      openUploaded("nope.txt", new Uint8Array([1, 2, 3, 4])),
    ).rejects.toThrow();
  });
});

describe("mutate / read / persist", () => {
  it("persists a mutation to the backing file immediately", async () => {
    const info = await openUploaded("people.sqlite", sampleBytes());

    await mutate(info.id, (db) =>
      insertRow(db, "users", { id: "2", name: "Grace" }),
    );
    expect(read(info.id, (db) => countRows(db, "users"))).toBe(2);

    // Re-open the file from disk in a fresh handle: the insert must be there.
    const reopened = new SQL.Database(
      await readFile(path.join(dir, `${info.id}.sqlite`)),
    );
    expect(countRows(reopened, "users")).toBe(2);
    reopened.close();
    closeEntry(info.id);
  });
});

describe("listFiles / openExisting", () => {
  it("lists uploaded files with id = name without extension", async () => {
    await openUploaded("inventory.db3", sampleBytes());
    const files = await listFiles();
    expect(files).toContainEqual({ id: "inventory", name: "inventory.db3" });
    closeEntry("inventory");
  });

  it("opens a file that exists on disk but isn't currently open", async () => {
    const info = await openUploaded("catalog.sqlite", sampleBytes());
    // Drop the in-memory handle, leaving only the file on disk.
    closeEntry(info.id);
    expect(() => requireEntry("catalog")).toThrow(DatabaseNotFoundError);

    const reopened = await openExisting("catalog");
    expect(reopened).toEqual({
      id: "catalog",
      name: "catalog.sqlite",
      tables: ["users"],
    });
    // It is held again and readable.
    expect(read("catalog", (db) => countRows(db, "users"))).toBe(1);
    closeEntry("catalog");
  });

  it("throws DatabaseNotFoundError when opening a file that doesn't exist", async () => {
    await expect(openExisting("missing")).rejects.toThrow(
      DatabaseNotFoundError,
    );
  });
});

describe("requireEntry / closeEntry", () => {
  it("throws DatabaseNotFoundError for an unknown id", () => {
    expect(() => requireEntry("does-not-exist")).toThrow(DatabaseNotFoundError);
  });

  it("closing removes the entry but leaves the file on disk", async () => {
    const info = await openUploaded("people.sqlite", sampleBytes());
    const filePath = path.join(dir, `${info.id}.sqlite`);
    closeEntry(info.id);

    expect(() => requireEntry(info.id)).toThrow(DatabaseNotFoundError);
    // The file persists.
    await expect(readFile(filePath)).resolves.toBeDefined();
    // Closing again is a no-op.
    expect(() => closeEntry(info.id)).not.toThrow();
  });
});
