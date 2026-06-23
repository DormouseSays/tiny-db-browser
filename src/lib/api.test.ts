import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as api from "./api";
import { encodeValue } from "./wire";

/** A successful JSON response with a parsed body. */
function ok(body: unknown, status = 200): Response {
  return {
    ok: true,
    status,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

/** A 204 No Content response (its body is never read). */
function noContent(): Response {
  return {
    ok: true,
    status: 204,
    statusText: "No Content",
    json: async () => {
      throw new Error("204 has no body");
    },
  } as unknown as Response;
}

/** An error response carrying a JSON `{ error }` message. */
function jsonError(status: number, message: string): Response {
  return {
    ok: false,
    status,
    statusText: "Error",
    json: async () => ({ error: message }),
  } as unknown as Response;
}

/** An error response whose body isn't JSON (so we fall back to statusText). */
function nonJsonError(statusText: string): Response {
  return {
    ok: false,
    status: 500,
    statusText,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
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

/** [url, init] of the n-th fetch call. */
function callOf(n: number): [string, RequestInit] {
  return fetchMock.mock.calls[n] as [string, RequestInit];
}

/** The parsed JSON body of the n-th fetch call. */
function bodyOf(n: number): unknown {
  return JSON.parse(callOf(n)[1].body as string);
}

describe("request error handling", () => {
  it("surfaces the server's JSON error message", async () => {
    fetchMock.mockResolvedValueOnce(jsonError(400, "bad table"));
    await expect(api.listTables("db")).rejects.toThrow("bad table");
  });

  it("falls back to statusText when the error body isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(nonJsonError("Internal Server Error"));
    await expect(api.listTables("db")).rejects.toThrow("Internal Server Error");
  });

  it("falls back to statusText when the JSON body has no error field", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => ({ unrelated: true }),
    } as unknown as Response);
    await expect(api.listTables("db")).rejects.toThrow("Bad Gateway");
  });

  it("resolves to undefined on 204 without reading a body", async () => {
    fetchMock.mockResolvedValueOnce(noContent());
    await expect(api.closeDatabase("db")).resolves.toBeUndefined();
  });
});

describe("uploadDatabase", () => {
  it("POSTs the file as multipart form data and tags it sqlite", async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: "data", name: "data.db", tables: ["t"] }));
    const file = new File([new Uint8Array([1, 2, 3])], "data.db");

    const info = await api.uploadDatabase(file);

    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    expect(info).toEqual({ id: "data", name: "data.db", tables: ["t"], kind: "sqlite" });
  });
});

describe("openD1Database", () => {
  it("POSTs the connection as JSON and tags the result d1", async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: "uuid", name: "remote", tables: [] }));
    const connection = {
      accountId: "acc",
      databaseId: "db",
      apiToken: "tok",
      name: "remote",
    };

    const info = await api.openD1Database(connection);

    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/d1");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect(bodyOf(0)).toEqual(connection);
    expect(info.kind).toBe("d1");
  });
});

describe("listServerDatabases / listPresetDatabases", () => {
  it("unwraps the files array from the databases endpoint", async () => {
    const files = [{ id: "a", name: "a.db" }];
    fetchMock.mockResolvedValueOnce(ok({ files }));
    await expect(api.listServerDatabases()).resolves.toEqual(files);
    expect(callOf(0)[0]).toBe("/api/databases");
  });

  it("unwraps the files array from the presets endpoint", async () => {
    const files = [{ id: "p", name: "p.db" }];
    fetchMock.mockResolvedValueOnce(ok({ files }));
    await expect(api.listPresetDatabases()).resolves.toEqual(files);
    expect(callOf(0)[0]).toBe("/api/databases/presets");
  });
});

describe("openServerDatabase", () => {
  it("POSTs to the id's open endpoint and tags it sqlite", async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: "a", name: "a.db", tables: ["t"] }));
    const info = await api.openServerDatabase("a");

    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/a/open");
    expect(init.method).toBe("POST");
    expect(info.kind).toBe("sqlite");
  });
});

describe("closeDatabase", () => {
  it("DELETEs the database resource", async () => {
    fetchMock.mockResolvedValueOnce(noContent());
    await api.closeDatabase("a");
    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/a");
    expect(init.method).toBe("DELETE");
  });
});

describe("exportUrl", () => {
  it("builds the export URL without making a request", () => {
    expect(api.exportUrl("a")).toBe("/api/databases/a/export");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listTables", () => {
  it("unwraps the tables array", async () => {
    fetchMock.mockResolvedValueOnce(ok({ tables: ["users", "orders"] }));
    await expect(api.listTables("a")).resolves.toEqual(["users", "orders"]);
    expect(callOf(0)[0]).toBe("/api/databases/a/tables");
  });
});

describe("runQuery", () => {
  it("POSTs the SQL and decodes wire rows, including blobs", async () => {
    const blob = new Uint8Array([10, 20, 30]);
    fetchMock.mockResolvedValueOnce(
      ok({ columns: ["n", "data"], rows: [[1, encodeValue(blob)], [2, null]] }),
    );

    const result = await api.runQuery("a", "SELECT 1");

    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/a/query");
    expect(init.method).toBe("POST");
    expect(bodyOf(0)).toEqual({ sql: "SELECT 1" });
    expect(result.columns).toEqual(["n", "data"]);
    expect(result.rows[0][0]).toBe(1);
    expect(Array.from(result.rows[0][1] as Uint8Array)).toEqual([10, 20, 30]);
    expect(result.rows[1]).toEqual([2, null]);
  });
});

describe("readTable", () => {
  it("decodes both rows and the parallel rowIds", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ columns: ["name"], rows: [["alice"], ["bob"]], rowIds: [1, 2] }),
    );

    const data = await api.readTable("a", "users");

    expect(callOf(0)[0]).toBe("/api/databases/a/tables/users/rows");
    expect(data.columns).toEqual(["name"]);
    expect(data.rows).toEqual([["alice"], ["bob"]]);
    expect(data.rowIds).toEqual([1, 2]);
  });
});

describe("row mutations", () => {
  it("insertRow POSTs the values", async () => {
    fetchMock.mockResolvedValueOnce(noContent());
    await api.insertRow("a", "users", { name: "carol" });
    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/a/tables/users/rows");
    expect(init.method).toBe("POST");
    expect(bodyOf(0)).toEqual({ values: { name: "carol" } });
  });

  it("updateRow PATCHes the rowId and values", async () => {
    fetchMock.mockResolvedValueOnce(noContent());
    await api.updateRow("a", "users", 7, { name: "dave" });
    const [, init] = callOf(0);
    expect(init.method).toBe("PATCH");
    expect(bodyOf(0)).toEqual({ rowId: 7, values: { name: "dave" } });
  });

  it("deleteRow DELETEs the rowId", async () => {
    fetchMock.mockResolvedValueOnce(noContent());
    await api.deleteRow("a", "users", 7);
    const [, init] = callOf(0);
    expect(init.method).toBe("DELETE");
    expect(bodyOf(0)).toEqual({ rowId: 7 });
  });
});

describe("getTableSchema", () => {
  it("returns the columns and row count from the table endpoint", async () => {
    const schema = {
      columns: [{ name: "id", type: "INTEGER", primaryKey: true, notNull: true }],
      rowCount: 3,
    };
    fetchMock.mockResolvedValueOnce(ok(schema));
    await expect(api.getTableSchema("a", "users")).resolves.toEqual(schema);
    expect(callOf(0)[0]).toBe("/api/databases/a/tables/users");
  });
});

describe("createTable", () => {
  it("POSTs the name and columns and returns the updated table list", async () => {
    const columns = [
      { name: "id", type: "INTEGER", primaryKey: true, notNull: true },
    ];
    fetchMock.mockResolvedValueOnce(ok({ tables: ["users", "widgets"] }));

    const tables = await api.createTable("a", "widgets", columns);

    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/a/tables");
    expect(init.method).toBe("POST");
    expect(bodyOf(0)).toEqual({ name: "widgets", columns });
    expect(tables).toEqual(["users", "widgets"]);
  });
});

describe("rebuildTable", () => {
  it("PUTs the new definition to the table endpoint", async () => {
    const columns = [
      {
        name: "id",
        type: "INTEGER",
        primaryKey: true,
        notNull: true,
        originalName: "id",
      },
    ];
    fetchMock.mockResolvedValueOnce(ok({ tables: ["renamed"] }));

    const tables = await api.rebuildTable("a", "users", "renamed", columns);

    const [url, init] = callOf(0);
    expect(url).toBe("/api/databases/a/tables/users");
    expect(init.method).toBe("PUT");
    expect(bodyOf(0)).toEqual({ name: "renamed", columns });
    expect(tables).toEqual(["renamed"]);
  });
});

describe("URL encoding", () => {
  it("percent-encodes ids and table names with special characters", async () => {
    fetchMock.mockResolvedValueOnce(ok({ columns: [], rows: [], rowIds: [] }));
    await api.readTable("a/b", "odd name");
    expect(callOf(0)[0]).toBe("/api/databases/a%2Fb/tables/odd%20name/rows");
  });
});
