// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DELETE } from "./route";
import { openUploaded } from "@/lib/server/registry";
import {
  jsonRequest,
  params,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

const dataDir = setupTempDataDir();

describe("DELETE /api/databases/[id]", () => {
  it("closes an open database, keeps its file, and is idempotent", async () => {
    const info = await openUploaded("people.sqlite", usersBytes());

    const res = await DELETE(jsonRequest("DELETE"), params({ id: info.id }));
    expect(res.status).toBe(204);

    // The backing file is retained after closing.
    await expect(
      readFile(path.join(dataDir(), "people.sqlite")),
    ).resolves.toBeDefined();

    // Closing again (and closing an unknown id) is a no-op.
    expect((await DELETE(jsonRequest("DELETE"), params({ id: info.id }))).status).toBe(204);
    expect((await DELETE(jsonRequest("DELETE"), params({ id: "nope" }))).status).toBe(204);
  });
});