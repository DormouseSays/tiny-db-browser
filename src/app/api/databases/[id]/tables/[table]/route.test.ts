// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET, PUT } from "./route";
import { closeEntry, openUploaded } from "@/lib/server/registry";
import type { ColumnDefinition } from "@/lib/schema";
import {
  jsonRequest,
  params,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

setupTempDataDir();

describe("GET /api/databases/[id]/tables/[table]", () => {
  it("returns the table's column schema and row count", async () => {
    const info = await openUploaded("schema.sqlite", usersBytes());
    const res = await GET(
      jsonRequest("GET"),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      columns: ColumnDefinition[];
      rowCount: number;
    };
    expect(body.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(body.rowCount).toBe(1);
    closeEntry(info.id);
  });

  it("returns 404 for an unknown database", async () => {
    const res = await GET(
      jsonRequest("GET"),
      params({ id: "nope", table: "users" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/databases/[id]/tables/[table] (rebuild)", () => {
  it("rebuilds the table and returns the updated table list", async () => {
    const info = await openUploaded("rebuild.sqlite", usersBytes());
    const res = await PUT(
      jsonRequest("PUT", {
        name: "people",
        columns: [
          { originalName: "id", name: "id", type: "INTEGER", primaryKey: true, notNull: false },
          { originalName: "name", name: "full_name", type: "TEXT", primaryKey: false, notNull: false },
        ],
      }),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ tables: ["people"] });
    closeEntry(info.id);
  });

  it("returns 400 when name or columns are missing", async () => {
    const info = await openUploaded("badrebuild.sqlite", usersBytes());
    const res = await PUT(
      jsonRequest("PUT", { name: "", columns: [] }),
      params({ id: info.id, table: "users" }),
    );
    expect(res.status).toBe(400);
    closeEntry(info.id);
  });
});