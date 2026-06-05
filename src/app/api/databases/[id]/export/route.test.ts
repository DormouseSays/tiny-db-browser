// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { closeEntry, openUploaded } from "@/lib/server/registry";
import {
  jsonRequest,
  params,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

setupTempDataDir();

describe("GET /api/databases/[id]/export", () => {
  it("streams the database bytes as a downloadable SQLite file", async () => {
    const info = await openUploaded("dump.sqlite", usersBytes());

    const res = await GET(jsonRequest("GET"), params({ id: info.id }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-sqlite3");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="dump.sqlite"',
    );

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 15).toString("latin1")).toBe("SQLite format 3");
    closeEntry(info.id);
  });

  it("returns 404 for an id that isn't open", async () => {
    const res = await GET(jsonRequest("GET"), params({ id: "not-open" }));
    expect(res.status).toBe(404);
  });
});