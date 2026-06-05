import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { SqlJsStatic } from "sql.js";
import { closeEntry, openUploaded } from "@/lib/server/registry";
import { POST } from "./route";

let SQL: SqlJsStatic;
let dir: string;

/** Build a SQLite file image to stand in for an uploaded file. */
function sampleBytes(): Uint8Array {
  const db = new SQL.Database();
  db.run("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, data BLOB)");
  db.run("INSERT INTO t (id, name, data) VALUES (1, 'Ada', x'00ff10')");
  const bytes = db.export();
  db.close();
  return bytes;
}

/** Open a fresh copy of the sample database and return its id. */
async function openSample(): Promise<string> {
  const { id } = await openUploaded("sample.sqlite", sampleBytes());
  return id;
}

/** Invoke the POST handler the way Next would, with a JSON body and route params. */
function callQuery(id: string, body: unknown) {
  const request = new NextRequest("http://localhost/api/databases/x/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

beforeAll(async () => {
  SQL = await initSqlJs();
  dir = await mkdtemp(path.join(tmpdir(), "tdb-query-route-"));
  process.env.TINY_DB_DATA_DIR = dir;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.TINY_DB_DATA_DIR;
});

describe("POST /api/databases/[id]/query", () => {
  it("returns the columns and rows of a SELECT", async () => {
    const id = await openSample();
    const res = await callQuery(id, { sql: "SELECT id, name FROM t" });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      columns: ["id", "name"],
      rows: [[1, "Ada"]],
    });
    closeEntry(id);
  });

  it("encodes BLOB values in the wire format", async () => {
    const id = await openSample();
    const res = await callQuery(id, { sql: "SELECT data FROM t" });

    const body = (await res.json()) as { rows: unknown[][] };
    // x'00ff10' base64-encodes to "AP8Q".
    expect(body.rows).toEqual([[{ $blob: "AP8Q" }]]);
    closeEntry(id);
  });

  it("persists a mutating statement and reflects it on the next query", async () => {
    const id = await openSample();

    const insert = await callQuery(id, {
      sql: "INSERT INTO t (id, name) VALUES (2, 'Grace')",
    });
    expect(insert.status).toBe(200);
    // A non-row-producing statement yields an empty grid.
    await expect(insert.json()).resolves.toEqual({ columns: [], rows: [] });

    const select = await callQuery(id, {
      sql: "SELECT id, name FROM t ORDER BY id",
    });
    await expect(select.json()).resolves.toEqual({
      columns: ["id", "name"],
      rows: [
        [1, "Ada"],
        [2, "Grace"],
      ],
    });
    closeEntry(id);
  });

  it("reports column names for a query that matches zero rows", async () => {
    const id = await openSample();
    const res = await callQuery(id, { sql: "SELECT id, name FROM t WHERE 0" });
    await expect(res.json()).resolves.toEqual({
      columns: ["id", "name"],
      rows: [],
    });
    closeEntry(id);
  });

  it("returns 400 when the body has no SQL string", async () => {
    const id = await openSample();
    const res = await callQuery(id, { notSql: true });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing SQL." });
    closeEntry(id);
  });

  it("returns 400 with the engine's message for invalid SQL", async () => {
    const id = await openSample();
    const res = await callQuery(id, { sql: "SELECT * FROM no_such_table" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no_such_table/);
    closeEntry(id);
  });

  it("returns 404 for an unknown database id", async () => {
    const res = await callQuery("does-not-exist", { sql: "SELECT 1" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/does-not-exist/);
  });
});
