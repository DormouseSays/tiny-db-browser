/**
 * Shared helpers for exercising the database API route handlers directly (the
 * way Next would call them) against the real registry backed by a temporary
 * data directory.
 */
import { afterAll, beforeAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";

/**
 * Register a fresh temp data directory for the current test file via
 * `TINY_DB_DATA_DIR`, and return a getter for its path. Each test file is
 * isolated, so the registry and this directory don't leak between files.
 */
export function setupTempDataDir(): () => string {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "tdb-route-"));
    process.env.TINY_DB_DATA_DIR = dir;
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.TINY_DB_DATA_DIR;
  });
  return () => dir;
}

/** Build a SQLite file image from a setup function. */
export function bytesFrom(setup: (db: Database.Database) => void): Buffer {
  const db = new Database(":memory:");
  try {
    setup(db);
    return db.serialize();
  } finally {
    db.close();
  }
}

/** A small `users` table with one row — the common fixture. */
export function usersBytes(): Buffer {
  return bytesFrom((db) => {
    db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    db.exec("INSERT INTO users (id, name) VALUES (1, 'Ada')");
  });
}

/** Build a JSON request; handlers only read the body and method. */
export function jsonRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/databases/test", {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Build a multipart upload request with a single `file` field. */
export function uploadRequest(
  filename: string,
  bytes: Uint8Array,
): NextRequest {
  const form = new FormData();
  form.append("file", new File([bytes as BlobPart], filename));
  return new NextRequest("http://localhost/api/databases", {
    method: "POST",
    body: form,
  });
}

/** Wrap route params the way Next provides them (as a promise). */
export function params<T extends Record<string, string>>(
  value: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}
