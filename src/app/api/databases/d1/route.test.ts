// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { POST } from "./route";
import { closeEntry } from "@/lib/server/registry";
import { jsonRequest } from "@/test/route-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubD1(rows: Record<string, unknown>[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: [{ results: rows }] }),
    }),
  );
}

describe("POST /api/databases/d1", () => {
  it("opens a connection and returns its id, name, and tables", async () => {
    stubD1([{ name: "widgets" }]);
    const res = await POST(
      jsonRequest("POST", {
        accountId: "acc",
        databaseId: "db",
        apiToken: "tok",
        name: "Prod",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; tables: string[] };
    expect(body.name).toBe("Prod");
    expect(body.tables).toEqual(["widgets"]);
    closeEntry(body.id);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(jsonRequest("POST", { accountId: "acc" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/required/);
  });

  it("surfaces a Cloudflare authentication failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          errors: [{ message: "Authentication error" }],
        }),
      }),
    );
    const res = await POST(
      jsonRequest("POST", {
        accountId: "acc",
        databaseId: "db",
        apiToken: "bad",
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Authentication error" });
  });
});
