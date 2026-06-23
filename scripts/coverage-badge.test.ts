import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM script, no type declarations.
import { pickColor, renderBadge, badgeForPct } from "./coverage-badge.mjs";

describe("pickColor", () => {
  it("maps percentages to the shields color ramp", () => {
    expect(pickColor(100)).toBe("#4c1");
    expect(pickColor(90)).toBe("#4c1");
    expect(pickColor(85)).toBe("#97ca00");
    expect(pickColor(75)).toBe("#a4a61d");
    expect(pickColor(65)).toBe("#dfb317");
    expect(pickColor(55)).toBe("#fe7d37");
    expect(pickColor(0)).toBe("#e05d44");
  });

  it("uses the boundary value as the inclusive lower bound", () => {
    expect(pickColor(80)).toBe("#97ca00");
    expect(pickColor(79.9)).toBe("#a4a61d");
  });
});

describe("renderBadge", () => {
  it("produces a valid svg carrying the label and message", () => {
    const svg = renderBadge({
      label: "coverage",
      message: "92%",
      color: "#4c1",
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).toContain(">coverage<");
    expect(svg).toContain(">92%<");
    expect(svg).toContain('fill="#4c1"');
    expect(svg).toContain('aria-label="coverage: 92%"');
  });

  it("escapes XML-significant characters in the text", () => {
    const svg = renderBadge({ label: "a&b", message: "<x>", color: "#4c1" });
    expect(svg).toContain("a&amp;b");
    expect(svg).toContain("&lt;x&gt;");
    expect(svg).not.toContain("a&b");
  });
});

describe("badgeForPct", () => {
  it("rounds the percentage and picks the matching color", () => {
    const svg = badgeForPct(91.6);
    expect(svg).toContain(">92%<");
    expect(svg).toContain('fill="#4c1"');
  });

  it("renders low coverage in red", () => {
    const svg = badgeForPct(42);
    expect(svg).toContain(">42%<");
    expect(svg).toContain('fill="#e05d44"');
  });
});
