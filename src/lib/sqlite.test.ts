import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  countRows,
  createTable,
  exportDatabase,
  getTableSchema,
  listTables,
  insertRow,
  quoteIdentifier,
  readTable,
  rebuildTable,
  runQuery,
  splitStatements,
  updateRow,
} from "./sqlite";

let db: Database.Database;

/** Run a SELECT and return its rows as arrays of values. */
function selectRows(sql: string) {
  return db.prepare(sql).raw().all();
}

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

describe("quoteIdentifier", () => {
  it("wraps in double quotes and escapes embedded quotes", () => {
    expect(quoteIdentifier("users")).toBe('"users"');
    expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
  });
});

describe("splitStatements", () => {
  it("splits on top-level semicolons", () => {
    expect(splitStatements("SELECT 1; SELECT 2")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  it("ignores semicolons inside strings, identifiers, and comments", () => {
    expect(
      splitStatements("INSERT INTO t VALUES ('a;b'); SELECT 1"),
    ).toEqual(["INSERT INTO t VALUES ('a;b')", "SELECT 1"]);
    expect(splitStatements('SELECT "a;b" FROM t')).toEqual([
      'SELECT "a;b" FROM t',
    ]);
    expect(splitStatements("SELECT 1 -- a;b\n; SELECT 2")).toEqual([
      "SELECT 1 -- a;b",
      "SELECT 2",
    ]);
    expect(splitStatements("SELECT /* a;b */ 1")).toEqual([
      "SELECT /* a;b */ 1",
    ]);
  });

  it("drops blank and comment-only fragments", () => {
    expect(splitStatements("  ;\n; SELECT 1 ;")).toEqual(["SELECT 1"]);
    expect(splitStatements("-- just a comment")).toEqual([]);
    expect(splitStatements("")).toEqual([]);
  });
});

describe("createTable / getTableSchema", () => {
  it("creates a table with the given columns and reports its schema", () => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: true },
    ]);

    expect(listTables(db)).toEqual(["users"]);
    expect(getTableSchema(db, "users")).toEqual([
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: true },
    ]);
  });

  it("rejects a duplicate table name", () => {
    createTable(db, "t", [
      { name: "a", type: "TEXT", primaryKey: false, notNull: false },
    ]);
    expect(() =>
      createTable(db, "t", [
        { name: "a", type: "TEXT", primaryKey: false, notNull: false },
      ]),
    ).toThrow();
  });
});

describe("runQuery", () => {
  beforeEach(() => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
  });

  it("reports column names for a query that matches zero rows", () => {
    expect(runQuery(db, "SELECT id, name FROM users")).toEqual({
      columns: ["id", "name"],
      rows: [],
    });
  });

  it("returns columns and rows for a populated table", () => {
    db.exec("INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')");
    expect(runQuery(db, "SELECT id, name FROM users ORDER BY id")).toEqual({
      columns: ["id", "name"],
      rows: [
        [1, "Ada"],
        [2, "Grace"],
      ],
    });
  });

  it("surfaces the trailing query across multiple statements", () => {
    const result = runQuery(
      db,
      "INSERT INTO users (id, name) VALUES (1, 'Ada'); SELECT name FROM users",
    );
    expect(result).toEqual({ columns: ["name"], rows: [["Ada"]] });
  });

  it("returns an empty grid for a statement that yields no columns", () => {
    expect(runQuery(db, "UPDATE users SET name = 'x'")).toEqual({
      columns: [],
      rows: [],
    });
  });
});

describe("readTable / updateRow", () => {
  beforeEach(() => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
    db.exec("INSERT INTO users (id, name) VALUES (10, 'Ada'), (20, 'Grace')");
  });

  it("returns rows without the rowid column and a parallel rowId list", () => {
    const data = readTable(db, "users");
    expect(data.columns).toEqual(["id", "name"]);
    expect(data.rows).toEqual([
      [10, "Ada"],
      [20, "Grace"],
    ]);
    // INTEGER PRIMARY KEY aliases the rowid, so the ids double as rowids.
    expect(data.rowIds).toEqual([10, 20]);
  });

  it("updates the targeted row by rowid, leaving others untouched", () => {
    const { rowIds } = readTable(db, "users");
    updateRow(db, "users", rowIds[0], { name: "Ada Lovelace" });

    const after = readTable(db, "users");
    expect(after.rows).toEqual([
      [10, "Ada Lovelace"],
      [20, "Grace"],
    ]);
  });

  it("writes a null value", () => {
    const { rowIds } = readTable(db, "users");
    updateRow(db, "users", rowIds[1], { name: null });
    expect(readTable(db, "users").rows[1]).toEqual([20, null]);
  });

  it("coerces strings by column affinity", () => {
    const { rowIds } = readTable(db, "users");
    // "30" bound to the INTEGER-affinity id column is stored as a number.
    updateRow(db, "users", rowIds[0], { id: "30" });
    expect(readTable(db, "users").rows).toContainEqual([30, "Ada"]);
  });

  it("does nothing when given no columns to set", () => {
    const { rowIds } = readTable(db, "users");
    updateRow(db, "users", rowIds[0], {});
    expect(readTable(db, "users").rows).toEqual([
      [10, "Ada"],
      [20, "Grace"],
    ]);
  });
});

describe("insertRow", () => {
  beforeEach(() => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
  });

  it("appends a new row with the given values", () => {
    insertRow(db, "users", { id: "1", name: "Ada" });
    expect(readTable(db, "users").rows).toEqual([[1, "Ada"]]);
  });

  it("stores a null for unspecified-as-empty values", () => {
    insertRow(db, "users", { id: "1", name: null });
    expect(readTable(db, "users").rows).toEqual([[1, null]]);
  });

  it("inserts a defaults-only row when given no columns", () => {
    insertRow(db, "users", {});
    // No columns set: id auto-assigns (rowid alias), name defaults to NULL.
    const rows = readTable(db, "users").rows;
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBeNull();
  });

  it("throws on a constraint violation", () => {
    insertRow(db, "users", { id: "1", name: "Ada" });
    expect(() => insertRow(db, "users", { id: "1", name: "Dup" })).toThrow();
  });
});

describe("exportDatabase", () => {
  it("produces a SQLite image that round-trips edits when re-opened", async () => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
    db.exec("INSERT INTO users (id, name) VALUES (1, 'Ada')");

    const bytes = exportDatabase(db);
    // The SQLite file format starts with the literal header "SQLite format 3\0".
    expect(new TextDecoder().decode(bytes.subarray(0, 15))).toBe(
      "SQLite format 3",
    );

    // better-sqlite3 opens files by path, so write the image out and reopen it.
    const dir = await mkdtemp(path.join(tmpdir(), "tdb-export-"));
    const file = path.join(dir, "roundtrip.sqlite");
    await writeFile(file, bytes);
    const reopened = new Database(file);
    try {
      expect(listTables(reopened)).toEqual(["users"]);
      expect(reopened.prepare("SELECT id, name FROM users").raw().all()).toEqual(
        [[1, "Ada"]],
      );
    } finally {
      reopened.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("rebuildTable", () => {
  beforeEach(() => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
    db.exec("INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')");
  });

  it("renames the table and preserves carried-over data", () => {
    rebuildTable(db, "users", "people", [
      { originalName: "id", name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { originalName: "name", name: "full_name", type: "TEXT", primaryKey: false, notNull: false },
    ]);

    expect(listTables(db)).toEqual(["people"]);
    const schema = getTableSchema(db, "people");
    expect(schema.map((c) => c.name)).toEqual(["id", "full_name"]);
    expect(countRows(db, "people")).toBe(2);

    expect(selectRows("SELECT id, full_name FROM people ORDER BY id")).toEqual([
      [1, "Ada"],
      [2, "Grace"],
    ]);
  });

  it("adds a new column as empty and drops omitted columns", () => {
    rebuildTable(db, "users", "users", [
      { originalName: "id", name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      // "name" omitted -> dropped; "email" has no originalName -> new/empty.
      { name: "email", type: "TEXT", primaryKey: false, notNull: false },
    ]);

    const schema = getTableSchema(db, "users");
    expect(schema.map((c) => c.name)).toEqual(["id", "email"]);
    expect(selectRows("SELECT id, email FROM users ORDER BY id")).toEqual([
      [1, null],
      [2, null],
    ]);
  });

  it("rolls back and leaves the original table intact on failure", () => {
    // Forcing a NOT NULL column with no default over existing rows fails the copy.
    expect(() =>
      rebuildTable(db, "users", "users", [
        { originalName: "id", name: "id", type: "INTEGER", primaryKey: true, notNull: false },
        { originalName: "name", name: "name", type: "TEXT", primaryKey: false, notNull: false },
        { name: "required", type: "TEXT", primaryKey: false, notNull: true },
      ]),
    ).toThrow();

    // Original schema and data must be untouched.
    expect(listTables(db)).toEqual(["users"]);
    expect(getTableSchema(db, "users").map((c) => c.name)).toEqual(["id", "name"]);
    expect(countRows(db, "users")).toBe(2);
  });
});
