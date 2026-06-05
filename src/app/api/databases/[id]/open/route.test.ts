// @vitest-environment node
import { describe, it, expect } from "vitest";
import { POST } from "./route";
import { closeEntry, openUploaded } from "@/lib/server/registry";
import {
  jsonRequest,
  params,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

setupTempDataDir();

describe("POST /api/databases/[id]/open", () => {
  it("opens a database file already on the server", async () => {
    const info = await openUploaded("catalog.sqlite", usersBytes());
    // Drop the handle so only the file on disk remains.
    closeEntry(info.id);

    const res = await POST(jsonRequest("POST"), params({ id: "catalog" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: "catalog",
      name: "catalog.sqlite",
      tables: ["users"],
    });
    closeEntry("catalog");
  });

  it("returns 404 for an id with no matching file", async () => {
    const res = await POST(jsonRequest("POST"), params({ id: "missing" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/missing/);
  });
});