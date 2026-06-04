import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
// The asm.js build needs no wasm fetch, so it loads cleanly under jsdom.
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { Database, SqlJsStatic } from "sql.js";
import {
  countRows,
  createTable,
  getTableSchema,
  listTables,
  quoteIdentifier,
  rebuildTable,
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
