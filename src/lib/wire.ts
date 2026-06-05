/**
 * JSON wire format for SQLite values. Most values (number, string, null) are
 * JSON-safe as-is, but BLOBs (`Uint8Array`) are not — they're tagged and
 * base64-encoded so they survive the round trip between client and server.
 *
 * Used on the server to encode rows before responding, and on the client to
 * decode them back into `SqlValue`s the grid already knows how to render.
 */
import type { SqlValue } from "./schema";

/** A tagged, base64-encoded BLOB. */
type WireBlob = { $blob: string };

/** A `SqlValue` in its JSON-transportable form. */
export type WireValue = number | string | null | WireBlob;

function isWireBlob(value: unknown): value is WireBlob {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WireBlob).$blob === "string"
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encode a single SQLite value for transport. */
export function encodeValue(value: SqlValue): WireValue {
  return value instanceof Uint8Array ? { $blob: bytesToBase64(value) } : value;
}

/** Decode a single transported value back into a SQLite value. */
export function decodeValue(value: WireValue): SqlValue {
  return isWireBlob(value) ? base64ToBytes(value.$blob) : value;
}

/** Encode a row of values for transport. */
export function encodeRow(row: SqlValue[]): WireValue[] {
  return row.map(encodeValue);
}

/** Decode a transported row back into SQLite values. */
export function decodeRow(row: WireValue[]): SqlValue[] {
  return row.map(decodeValue);
}
