// @vitest-environment node
import { describe, it, expect } from "vitest";
import { DELETE, GET, PATCH, POST } from "./route";
import { closeEntry, openUploaded } from "@/lib/server/registry";
import {
  bytesFrom,
  jsonRequest,
  params,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

setupTempDataDir();

/** A table with a BLOB column, to exercise wire encoding. */
function blobBytes() {
  return bytesFrom((db) => {
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, data BLOB)");
    db.exec("INSERT INTO t (id, name, data) VALUES (1, 'Ada', x'00ff10')");
  });
}

describe("GET /api/databases/[id]/tables/[table]/rows", () => {
  it("returns columns, rows (blobs encoded), and rowIds", async () => {
    const info = await openUploaded("read.sqlite", blobBytes());
    const res = await GET(jsonRequest("GET"), params({ id: info.id, table: "t" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      columns: ["id", "name", "data"],
      rows: [[1, "Ada", { $blob: "AP8Q" }]], // x'00ff10' -> base64 "AP8Q"
      rowIds: [1],
    });
    closeEntry(info.id);
  });

  it("returns 404 for an unknown database", async () => {
    const res = await GET(jsonRequest("GET"), params({ id: "nope", table: "t" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/databases/[id]/tables/[table]/rows (insert)", () => {
  it("inserts a row, reflected on the next read", async () => {
    const info = await openUploaded("insert.sqlite", usersBytes());
    const res = await POST(
      jsonRequest("POST", { values: { id: "2", name: "Grace" } }),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(204);

    const read = await GET(
      jsonRequest("GET"),
      params({ id: info.id, table: "users" }),
    );
    const body = (await read.json()) as { rows: unknown[][] };
    expect(body.rows).toEqual([
      [1, "Ada"],
      [2, "Grace"],
    ]);
    closeEntry(info.id);
  });
});

describe("PATCH /api/databases/[id]/tables/[table]/rows (update)", () => {
  it("updates a row by rowid, reflected on the next read", async () => {
    const info = await openUploaded("update.sqlite", usersBytes());
    const res = await PATCH(
      jsonRequest("PATCH", { rowId: 1, values: { name: "Ada Lovelace" } }),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(204);

    const read = await GET(
      jsonRequest("GET"),
      params({ id: info.id, table: "users" }),
    );
    const body = (await read.json()) as { rows: unknown[][] };
    expect(body.rows).toEqual([[1, "Ada Lovelace"]]);
    closeEntry(info.id);
  });

  it("returns 400 when rowId is missing", async () => {
    const info = await openUploaded("norowid.sqlite", usersBytes());
    const res = await PATCH(
      jsonRequest("PATCH", { values: { name: "x" } }),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing rowId." });
    closeEntry(info.id);
  });
});

describe("DELETE /api/databases/[id]/tables/[table]/rows", () => {
  it("deletes a row by rowid, reflected on the next read", async () => {
    const info = await openUploaded(
      "delete.sqlite",
      bytesFrom((db) => {
        db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
        db.exec("INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Grace')");
      }),
    );
    const res = await DELETE(
      jsonRequest("DELETE", { rowId: 1 }),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(204);

    const read = await GET(
      jsonRequest("GET"),
      params({ id: info.id, table: "users" }),
    );
    const body = (await read.json()) as { rows: unknown[][] };
    expect(body.rows).toEqual([[2, "Grace"]]);
    closeEntry(info.id);
  });

  it("returns 400 when rowId is missing", async () => {
    const info = await openUploaded("nodel.sqlite", usersBytes());
    const res = await DELETE(
      jsonRequest("DELETE", {}),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing rowId." });
    closeEntry(info.id);
  });
});