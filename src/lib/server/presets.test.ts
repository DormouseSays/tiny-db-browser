import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import { findPreset, listPresets } from "./presets";

afterEach(() => {
  delete process.env.TINY_DB_PRESET_FILES;
});

/** Join paths with the OS delimiter, the way the env var is expected to read. */
function configure(...paths: string[]): void {
  process.env.TINY_DB_PRESET_FILES = paths.join(path.delimiter);
}

describe("listPresets", () => {
  it("returns an empty list when nothing is configured", () => {
    expect(listPresets()).toEqual([]);
  });

  it("parses paths into id (name without extension), name, and absolute path", () => {
    configure("/srv/data/sales.db", "/srv/data/people.sqlite");
    expect(listPresets()).toEqual([
      { id: "people", name: "people.sqlite", path: "/srv/data/people.sqlite" },
      { id: "sales", name: "sales.db", path: "/srv/data/sales.db" },
    ]);
  });

  it("resolves relative paths against the working directory", () => {
    configure("data/local.db");
    expect(listPresets()).toEqual([
      {
        id: "local",
        name: "local.db",
        path: path.resolve("data/local.db"),
      },
    ]);
  });

  it("ignores blank entries and surrounding whitespace", () => {
    configure("  ", " /srv/a.db ", "");
    expect(listPresets()).toEqual([
      { id: "a", name: "a.db", path: "/srv/a.db" },
    ]);
  });

  it("drops later entries whose id collides with an earlier one", () => {
    configure("/one/dup.db", "/two/dup.sqlite");
    const presets = listPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]).toEqual({
      id: "dup",
      name: "dup.db",
      path: "/one/dup.db",
    });
  });

  it("sorts by name", () => {
    configure("/x/zebra.db", "/x/apple.db");
    expect(listPresets().map((p) => p.name)).toEqual(["apple.db", "zebra.db"]);
  });
});

describe("findPreset", () => {
  it("finds a configured preset by id", () => {
    configure("/srv/sales.db");
    expect(findPreset("sales")).toEqual({
      id: "sales",
      name: "sales.db",
      path: "/srv/sales.db",
    });
  });

  it("returns undefined for an unknown id", () => {
    configure("/srv/sales.db");
    expect(findPreset("missing")).toBeUndefined();
  });
});
