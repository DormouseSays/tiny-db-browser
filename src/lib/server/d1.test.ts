// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { d1Engine, type D1Config } from "./d1";
import { ExportUnsupportedError } from "./engine";

const CONFIG: D1Config = {
  accountId: "acc",
  databaseId: "db",
  apiToken: "tok",
};

/** A successful D1 response: one `{ results }` entry per statement. */
function ok(statements: Record<string, unknown>[][]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      result: statements.map((rows) => ({ results: rows, success: true })),
    }),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The parsed body of the n-th fetch call. */
function bodyOf(call: number) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

describe("d1Engine", () => {
  it("targets the account/database query URL with a bearer token", async () => {
    fetchMock.mockResolvedValueOnce(ok([[{ name: "users" }]]));
    await d1Engine(CONFIG).listTables();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db/query",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("listTables excludes system tables and returns the names", async () => {
    fetchMock.mockResolvedValueOnce(ok([[{ name: "orders" }, { name: "users" }]]));
    const tables = await d1Engine(CONFIG).listTables();
    expect(tables).toEqual(["orders", "users"]);
    expect(bodyOf(0).sql).toMatch(/NOT LIKE '_cf_%'/);
  });

  it("runQuery returns the last row-producing statement, column-ordered", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        [], // a non-SELECT statement
        [
          { id: 1, name: "Ada" },
          { id: 2, name: "Grace" },
        ],
      ]),
    );
    const result = await d1Engine(CONFIG).runQuery("…");
    expect(result.columns).toEqual(["id", "name"]);
    expect(result.rows).toEqual([
      [1, "Ada"],
      [2, "Grace"],
    ]);
  });

  it("readTable splits the rowid column out into rowIds", async () => {
    fetchMock.mockResolvedValueOnce(
      ok([
        [
          { _tdb_rowid: 5, id: 5, name: "Ada" },
          { _tdb_rowid: 6, id: 6, name: "Grace" },
        ],
      ]),
    );
    const data = await d1Engine(CONFIG).readTable("users");
    expect(data.columns).toEqual(["id", "name"]);
    expect(data.rows).toEqual([
      [5, "Ada"],
      [6, "Grace"],
    ]);
    expect(data.rowIds).toEqual([5, 6]);
  });

  it("readTable recovers column headers for an empty table", async () => {
    fetchMock
      .mockResolvedValueOnce(ok([[]])) // SELECT returned no rows
      .mockResolvedValueOnce(ok([[{ name: "id" }, { name: "name" }]])); // pragma
    const data = await d1Engine(CONFIG).readTable("users");
    expect(data.columns).toEqual(["id", "name"]);
    expect(data.rows).toEqual([]);
    expect(data.rowIds).toEqual([]);
  });

  it("insertRow builds a parameterized INSERT", async () => {
    fetchMock.mockResolvedValueOnce(ok([[]]));
    await d1Engine(CONFIG).insertRow("users", { id: 3, name: "Eve" });
    const body = bodyOf(0);
    expect(body.sql).toBe('INSERT INTO "users" ("id", "name") VALUES (?, ?)');
    expect(body.params).toEqual([3, "Eve"]);
  });

  it("updateRow targets the row by rowid with bound params", async () => {
    fetchMock.mockResolvedValueOnce(ok([[]]));
    await d1Engine(CONFIG).updateRow("users", 7, { name: "Ada L" });
    const body = bodyOf(0);
    expect(body.sql).toBe('UPDATE "users" SET "name" = ? WHERE rowid = ?');
    expect(body.params).toEqual(["Ada L", 7]);
  });

  it("deleteRow targets the row by rowid", async () => {
    fetchMock.mockResolvedValueOnce(ok([[]]));
    await d1Engine(CONFIG).deleteRow("users", 7);
    const body = bodyOf(0);
    expect(body.sql).toBe('DELETE FROM "users" WHERE rowid = ?');
    expect(body.params).toEqual([7]);
  });

  it("describeTable reports columns and row count", async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok([
          [
            { name: "id", type: "INTEGER", notnull: 0, pk: 1 },
            { name: "name", type: "TEXT", notnull: 1, pk: 0 },
          ],
        ]),
      )
      .mockResolvedValueOnce(ok([[{ count: 2 }]]));
    const desc = await d1Engine(CONFIG).describeTable("users");
    expect(desc.rowCount).toBe(2);
    expect(desc.columns).toEqual([
      { name: "id", type: "INTEGER", notNull: false, primaryKey: true },
      { name: "name", type: "TEXT", notNull: true, primaryKey: false },
    ]);
  });

  it("surfaces a Cloudflare error message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        errors: [{ code: 10000, message: "Authentication error" }],
      }),
    } as unknown as Response);
    await expect(d1Engine(CONFIG).listTables()).rejects.toThrow(
      "Authentication error",
    );
  });

  it("wraps a network failure with a friendly message", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(d1Engine(CONFIG).listTables()).rejects.toThrow(
      /Could not reach Cloudflare D1/,
    );
  });

  it("cannot be exported to a file", async () => {
    await expect(d1Engine(CONFIG).exportImage()).rejects.toBeInstanceOf(
      ExportUnsupportedError,
    );
  });
});
