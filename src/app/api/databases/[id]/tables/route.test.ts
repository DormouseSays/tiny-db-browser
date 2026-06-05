// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { closeEntry, openUploaded } from "@/lib/server/registry";
import {
  jsonRequest,
  params,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

setupTempDataDir();

describe("GET /api/databases/[id]/tables", () => {
  it("lists the user tables", async () => {
    const info = await openUploaded("list.sqlite", usersBytes());
    const res = await GET(jsonRequest("GET"), params({ id: info.id }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tables: ["users"] });
    closeEntry(info.id);
  });

  it("returns 404 for an unknown database", async () => {
    const res = await GET(jsonRequest("GET"), params({ id: "nope" }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/databases/[id]/tables (create)", () => {
  it("creates a table and returns the updated table list", async () => {
    const info = await openUploaded("create.sqlite", usersBytes());
    const res = await POST(
      jsonRequest("POST", {
        name: "notes",
        columns: [{ name: "id", type: "INTEGER", primaryKey: true, notNull: false }],
      }),
      params({ id: info.id }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tables: ["notes", "users"] });
    closeEntry(info.id);
  });

  it("returns 400 when name or columns are missing", async () => {
    const info = await openUploaded("invalid.sqlite", usersBytes());
    const res = await POST(
      jsonRequest("POST", { name: "x", columns: [] }),
      params({ id: info.id }),
    );
    expect(res.status).toBe(400);
    closeEntry(info.id);
  });

  it("returns 400 when the table already exists", async () => {
    const info = await openUploaded("dup.sqlite", usersBytes());
    const res = await POST(
      jsonRequest("POST", {
        name: "users",
        columns: [{ name: "id", type: "INTEGER", primaryKey: false, notNull: false }],
      }),
      params({ id: info.id }),
    );
    expect(res.status).toBe(400);
    closeEntry(info.id);
  });
});