/**
 * Generate a self-contained coverage badge (SVG) from Vitest's coverage summary.
 *
 * Reads `coverage/coverage-summary.json` (produced by the `json-summary`
 * reporter) and writes a shields-style flat badge to `.github/badges/coverage.svg`,
 * which the README references. No network or third-party service is involved, so
 * the badge is only as fresh as the last `npm run coverage` that committed it.
 *
 * Run directly (`node scripts/coverage-badge.mjs`) or via `npm run coverage:badge`.
 * The pure helpers are exported for unit testing.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUMMARY_PATH = path.join(ROOT, "coverage", "coverage-summary.json");
const BADGE_PATH = path.join(ROOT, ".github", "badges", "coverage.svg");

/** shields.io's standard color ramp, brightest at full coverage. */
export function pickColor(pct) {
  if (pct >= 90) return "#4c1"; // brightgreen
  if (pct >= 80) return "#97ca00"; // green
  if (pct >= 70) return "#a4a61d"; // yellowgreen
  if (pct >= 60) return "#dfb317"; // yellow
  if (pct >= 50) return "#fe7d37"; // orange
  return "#e05d44"; // red
}

/** Escape the five characters that aren't allowed bare in XML text/attributes. */
function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Approximate a character's rendered width at the badge font size (~11px
 * Verdana). We don't have real font metrics, so these are rough buckets — wide
 * glyphs like `%` need noticeably more room than a digit, and undersizing them
 * is what makes `textLength` crush the text together.
 */
function charWidth(char) {
  if (char === "%") return 11;
  if (/[.,:'|!]/.test(char)) return 4;
  if (/[ilj]/.test(char)) return 4;
  if (/[0-9]/.test(char)) return 7.5;
  if (/[mw]/.test(char)) return 10;
  if (/[A-Z]/.test(char)) return 8;
  return 6.5; // typical lowercase letter
}

/** Approximate a label's rendered width in pixels by summing its glyphs. */
function estimateTextWidth(text) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return Math.ceil(width);
}

/**
 * Render a flat coverage badge as an SVG string. Layout follows shields.io's
 * flat style: a grey label box and a colored value box, each with ~10px of
 * horizontal padding; `textLength` scales the glyphs to fit so exact font
 * metrics aren't needed.
 */
export function renderBadge({ label, message, color }) {
  const labelW = estimateTextWidth(label) + 10;
  const msgW = estimateTextWidth(message) + 10;
  const totalW = labelW + msgW;
  // Inner text regions, in the 10x-scaled coordinate space the <text> uses.
  const labelTextLen = (labelW - 10) * 10;
  const msgTextLen = (msgW - 10) * 10;
  const labelX = (labelW / 2) * 10;
  const msgX = (labelW + msgW / 2) * 10;
  const a11y = `${label}: ${message}`;
  const [esLabel, esMsg, esA11y] = [label, message, a11y].map(escapeXml);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${esA11y}">
  <title>${esA11y}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${msgW}" height="20" fill="${color}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" lengthAdjust="spacingAndGlyphs" textLength="${labelTextLen}">${esLabel}</text>
    <text x="${labelX}" y="140" transform="scale(.1)" lengthAdjust="spacingAndGlyphs" textLength="${labelTextLen}">${esLabel}</text>
    <text aria-hidden="true" x="${msgX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" lengthAdjust="spacingAndGlyphs" textLength="${msgTextLen}">${esMsg}</text>
    <text x="${msgX}" y="140" transform="scale(.1)" lengthAdjust="spacingAndGlyphs" textLength="${msgTextLen}">${esMsg}</text>
  </g>
</svg>
`;
}

/** Build the badge SVG for a given line-coverage percentage. */
export function badgeForPct(pct) {
  const rounded = Math.round(pct);
  return renderBadge({
    label: "coverage",
    message: `${rounded}%`,
    color: pickColor(rounded),
  });
}

async function main() {
  let summary;
  try {
    summary = JSON.parse(await readFile(SUMMARY_PATH, "utf8"));
  } catch {
    console.error(
      `Could not read ${path.relative(ROOT, SUMMARY_PATH)}. ` +
        `Run \`npm run coverage\` first to generate it.`,
    );
    process.exitCode = 1;
    return;
  }

  const pct = summary?.total?.lines?.pct;
  if (typeof pct !== "number") {
    console.error("Coverage summary is missing total.lines.pct.");
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(BADGE_PATH), { recursive: true });
  await writeFile(BADGE_PATH, badgeForPct(pct));
  console.log(
    `Wrote ${path.relative(ROOT, BADGE_PATH)} (${Math.round(pct)}% lines).`,
  );
}

// Only run when invoked as a script, not when imported by the test.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
