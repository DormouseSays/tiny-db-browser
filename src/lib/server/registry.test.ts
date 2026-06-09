import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DatabaseNotFoundError,
  closeEntry,
  listFiles,
  openD1,
  openExisting,
  openUploaded,
  requireEngine,
  requireEntry,
  withDatabase,
} from "./registry";
import { countRows, insertRow } from "../sqlite";

let dir: string;

/** Build a small SQLite file image to stand in for an uploaded file. */
function sampleBytes(): Buffer {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
  db.exec("INSERT INTO users (id, name) VALUES (1, 'Ada')");
  const bytes = db.serialize();
  db.close();
  return bytes;
}

beforeAll(async () => {
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

describe("withDatabase", () => {
  it("writes a mutation through to the backing file immediately", async () => {
    const info = await openUploaded("people.sqlite", sampleBytes());

    withDatabase(info.id, (db) =>
      insertRow(db, "users", { id: "2", name: "Grace" }),
    );
    expect(withDatabase(info.id, (db) => countRows(db, "users"))).toBe(2);

    // Re-open the file from disk in a fresh handle: the insert must be there.
    const reopened = new Database(path.join(dir, "people.sqlite"));
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
    expect(withDatabase("catalog", (db) => countRows(db, "users"))).toBe(1);
    closeEntry("catalog");
  });

  it("throws DatabaseNotFoundError when opening a file that doesn't exist", async () => {
    await expect(openExisting("missing")).rejects.toThrow(
      DatabaseNotFoundError,
    );
  });
});

describe("openExisting with preset files", () => {
  afterEach(() => {
    delete process.env.TINY_DB_PRESET_FILES;
  });

  it("opens a configured preset file from its on-disk path", async () => {
    const presetPath = path.join(dir, "reports.sqlite");
    await writeFile(presetPath, sampleBytes());
    process.env.TINY_DB_PRESET_FILES = presetPath;

    const info = await openExisting("reports");
    expect(info).toEqual({
      id: "reports",
      name: "reports.sqlite",
      tables: ["users"],
    });
    expect(withDatabase("reports", (db) => countRows(db, "users"))).toBe(1);
    closeEntry("reports");
  });

  it("throws DatabaseNotFoundError for a preset id whose file is missing", async () => {
    process.env.TINY_DB_PRESET_FILES = path.join(dir, "absent.sqlite");
    await expect(openExisting("absent")).rejects.toThrow();
  });
});

describe("openD1 / closeEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubD1(rows: Record<string, unknown>[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: [{ results: rows }] }),
      }),
    );
  }

  it("opens a D1 connection, lists its tables, and drops it on close", async () => {
    stubD1([{ name: "widgets" }]);
    const info = await openD1(
      { accountId: "a", databaseId: "b", apiToken: "t" },
      "Prod",
    );
    expect(info.name).toBe("Prod");
    expect(info.tables).toEqual(["widgets"]);
    expect(typeof info.id).toBe("string");
    expect(requireEngine(info.id)).toBeDefined();

    // Closing the tab removes every trace of the connection.
    closeEntry(info.id);
    expect(() => requireEntry(info.id)).toThrow(DatabaseNotFoundError);
  });

  it("defaults the display name to the database id", async () => {
    stubD1([]);
    const info = await openD1(
      { accountId: "a", databaseId: "mydb", apiToken: "t" },
      "",
    );
    expect(info.name).toBe("mydb");
    closeEntry(info.id);
  });

  it("has no local SQLite handle (withDatabase throws)", async () => {
    stubD1([]);
    const info = await openD1(
      { accountId: "a", databaseId: "b", apiToken: "t" },
      "x",
    );
    expect(() => withDatabase(info.id, (db) => db)).toThrow(
      /no local SQLite handle/,
    );
    closeEntry(info.id);
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
