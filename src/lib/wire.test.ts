import { describe, it, expect } from "vitest";
import { decodeRow, decodeValue, encodeRow, encodeValue } from "./wire";

describe("encodeValue / decodeValue", () => {
  it("passes JSON-safe scalars through unchanged", () => {
    for (const value of [42, 3.14, "hello", "", null]) {
      const round = decodeValue(encodeValue(value));
      expect(round).toBe(value);
    }
  });

  it("round-trips a BLOB through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
    const encoded = encodeValue(bytes);
    // Encoded form is a JSON-serializable tagged object.
    expect(JSON.parse(JSON.stringify(encoded))).toEqual(encoded);
    expect(encoded).toMatchObject({ $blob: expect.any(String) });

    const decoded = decodeValue(encoded);
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded as Uint8Array)).toEqual(Array.from(bytes));
  });

  it("round-trips an empty BLOB", () => {
    const decoded = decodeValue(encodeValue(new Uint8Array()));
    expect(decoded).toBeInstanceOf(Uint8Array);
    expect((decoded as Uint8Array).length).toBe(0);
  });
});

describe("encodeRow / decodeRow", () => {
  it("round-trips a mixed row", () => {
    const row = [1, "two", null, new Uint8Array([9, 8, 7])];
    const decoded = decodeRow(encodeRow(row));
    expect(decoded[0]).toBe(1);
    expect(decoded[1]).toBe("two");
    expect(decoded[2]).toBeNull();
    expect(Array.from(decoded[3] as Uint8Array)).toEqual([9, 8, 7]);
  });
});
