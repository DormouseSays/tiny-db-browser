// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { GET } from "./route";

afterEach(() => {
  delete process.env.TINY_DB_PRESET_FILES;
});

describe("GET /api/databases/presets", () => {
  it("lists the configured preset files as id/name pairs", async () => {
    process.env.TINY_DB_PRESET_FILES = [
      "/srv/data/sales.db",
      "/srv/data/people.sqlite",
    ].join(path.delimiter);

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      files: [
        { id: "people", name: "people.sqlite" },
        { id: "sales", name: "sales.db" },
      ],
    });
  });

  it("returns an empty list when nothing is configured", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ files: [] });
  });
});
