// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { closeEntry } from "@/lib/server/registry";
import {
  jsonRequest,
  uploadRequest,
  setupTempDataDir,
  usersBytes,
} from "@/test/route-helpers";

setupTempDataDir();

describe("POST /api/databases (upload)", () => {
  it("uploads a SQLite file and reports its id, name, and tables", async () => {
    const res = await POST(uploadRequest("people.sqlite", usersBytes()));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: "people",
      name: "people.sqlite",
      tables: ["users"],
    });
    closeEntry("people");
  });

  it("rejects a file that isn't a SQLite database", async () => {
    const res = await POST(
      uploadRequest("notes.txt", new Uint8Array([1, 2, 3, 4])),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not a SQLite database/i);
  });

  it("returns 400 when no file field is present", async () => {
    const request = new NextRequest("http://localhost/api/databases", {
      method: "POST",
      body: new FormData(),
    });
    const res = await POST(request);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No file was uploaded." });
  });

  it("returns 400 for a non-multipart body", async () => {
    const res = await POST(jsonRequest("POST", { not: "multipart" }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Expected a multipart form upload.",
    });
  });
});

describe("GET /api/databases (list)", () => {
  it("lists the files already on the server", async () => {
    await POST(uploadRequest("inventory.sqlite", usersBytes()));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: { id: string; name: string }[] };
    expect(body.files).toContainEqual({
      id: "inventory",
      name: "inventory.sqlite",
    });
    closeEntry("inventory");
  });
});