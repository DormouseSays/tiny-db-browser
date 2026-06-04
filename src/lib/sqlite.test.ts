import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
// The asm.js build needs no wasm fetch, so it loads cleanly under jsdom.
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database, SqlJsStatic } from "sql.js";
import {
  countRows,
  createTable,
  exportDatabase,
  getTableSchema,
  listTables,
  quoteIdentifier,
  rebuildTable,
  runQuery,
} from "./sqlite";

let SQL: SqlJsStatic;
let db: Database;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  db = new SQL.Database();
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
    db.run("INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')");
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

describe("exportDatabase", () => {
  it("produces a SQLite image that round-trips edits when re-opened", () => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
    db.run("INSERT INTO users (id, name) VALUES (1, 'Ada')");

    const bytes = exportDatabase(db);
    // The SQLite file format starts with the literal header "SQLite format 3\0".
    expect(new TextDecoder().decode(bytes.subarray(0, 15))).toBe(
      "SQLite format 3",
    );

    const reopened = new SQL.Database(bytes);
    try {
      expect(listTables(reopened)).toEqual(["users"]);
      expect(reopened.exec("SELECT id, name FROM users")[0].values).toEqual([
        [1, "Ada"],
      ]);
    } finally {
      reopened.close();
    }
  });
});

describe("rebuildTable", () => {
  beforeEach(() => {
    createTable(db, "users", [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: false },
      { name: "name", type: "TEXT", primaryKey: false, notNull: false },
    ]);
    db.run("INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')");
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

    const rows = db.exec("SELECT id, full_name FROM people ORDER BY id")[0];
    expect(rows.values).toEqual([
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
    const rows = db.exec("SELECT id, email FROM users ORDER BY id")[0];
    expect(rows.values).toEqual([
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
