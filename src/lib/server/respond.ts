import { NextResponse } from "next/server";
import { DatabaseNotFoundError } from "./registry";

/**
 * Turn a thrown error into a JSON error response. A missing database maps to
 * 404; everything else (e.g. a SQLite constraint violation or bad SQL) maps to
 * 400 with the engine's message, which the client surfaces to the user.
 */
export function errorResponse(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof DatabaseNotFoundError ? 404 : 400;
  return NextResponse.json({ error: message }, { status });
}
