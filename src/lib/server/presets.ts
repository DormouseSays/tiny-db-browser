/**
 * Pre-set list of SQLite database files on disk that the server is allowed to
 * open directly, configured via the `TINY_DB_PRESET_FILES` environment
 * variable: file paths separated by the OS path delimiter (":" on POSIX,
 * ";" on Windows). Unlike uploads, these files live wherever they already are
 * and are never copied into the data directory.
 *
 * Each preset's id is its file name without the extension — the same scheme
 * uploads use — so a preset can be opened, queried, and closed through the
 * existing id-addressed API. Entries with a blank or duplicate id are dropped.
 */
import path from "node:path";

export type Preset = { id: string; name: string; path: string };

/** Derive a preset id from a path: the base name without its final extension. */
function idFromPath(filePath: string): string {
  return path.parse(path.basename(filePath)).name;
}

/** Parse the configured pre-set files, sorted by name with duplicates removed. */
export function listPresets(): Preset[] {
  const raw = process.env.TINY_DB_PRESET_FILES;
  if (!raw) return [];

  const seen = new Set<string>();
  const presets: Preset[] = [];
  for (const entry of raw.split(path.delimiter)) {
    const filePath = entry.trim();
    if (!filePath) continue;
    const id = idFromPath(filePath);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    presets.push({
      id,
      name: path.basename(filePath),
      path: path.resolve(filePath),
    });
  }
  return presets.sort((a, b) => a.name.localeCompare(b.name));
}

/** Find a configured preset by id, or undefined if none matches. */
export function findPreset(id: string): Preset | undefined {
  return listPresets().find((preset) => preset.id === id);
}
