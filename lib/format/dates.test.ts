import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  formatDate,
  formatDateShort,
  formatDateWithDay,
  formatMonthYear,
  formatTime,
  formatDateTime,
  parseDateOnly,
} from "./dates";

const REAL_TIMESTAMP = new Date(2026, 10, 29, 9, 0, 0); // local 29 Nov 2026, 9:00am

test("formatDate produces day-month-year, no comma, no time", () => {
  assert.equal(formatDate(REAL_TIMESTAMP), "29 Nov 2026");
});

test("formatDateShort produces DD/MM/YYYY", () => {
  assert.equal(formatDateShort(REAL_TIMESTAMP), "29/11/2026");
});

test("formatDateWithDay produces weekday without a comma", () => {
  const d = new Date(2027, 2, 13); // Saturday 13 Mar 2027
  assert.equal(formatDateWithDay(d), "Sat 13 Mar 2027");
  assert.ok(!formatDateWithDay(d).includes(","));
});

test("formatMonthYear produces month-year only", () => {
  assert.equal(formatMonthYear(REAL_TIMESTAMP), "Nov 2026");
});

test("formatTime produces lowercase am/pm, no seconds", () => {
  const t = formatTime(REAL_TIMESTAMP);
  assert.equal(t, "9:00 am");
  assert.ok(!/:\d\d:\d\d/.test(t), "must not include seconds");
});

test("formatDateTime combines date and time with a comma", () => {
  assert.equal(formatDateTime(REAL_TIMESTAMP), "29 Nov 2026, 9:00 am");
});

test("every formatter returns an empty string for an invalid input", () => {
  assert.equal(formatDate("not a date"), "");
  assert.equal(formatDateShort("not a date"), "");
  assert.equal(formatDateWithDay("not a date"), "");
  assert.equal(formatMonthYear("not a date"), "");
  assert.equal(formatTime("not a date"), "");
  assert.equal(formatDateTime("not a date"), "");
});

test("parseDateOnly reads a bare YYYY-MM-DD string as that exact calendar date", () => {
  const d = parseDateOnly("2026-11-29");
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 10);
  assert.equal(d!.getDate(), 29);
  assert.equal(formatDate(d!), "29 Nov 2026");
});

test("parseDateOnly on a stored midnight-UTC timestamp never shifts a day, near midnight", () => {
  // A deadline entered as "13 March 2027" and stored as UTC midnight --
  // the literal date digits are what's intended, regardless of the
  // viewer's timezone offset either side of that midnight instant.
  const d = parseDateOnly("2027-03-13T00:00:00.000Z");
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2027);
  assert.equal(d!.getMonth(), 2);
  assert.equal(d!.getDate(), 13);
  assert.equal(formatDateWithDay(d!), "Sat 13 Mar 2027");
});

test("parseDateOnly handles a leap day", () => {
  const d = parseDateOnly("2028-02-29");
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2028);
  assert.equal(d!.getMonth(), 1);
  assert.equal(d!.getDate(), 29);
  assert.equal(formatDate(d!), "29 Feb 2028");
});

test("parseDateOnly on a numeric UTC-midnight timestamp reads the UTC calendar date, deterministic regardless of host timezone", () => {
  const ms = Date.UTC(2027, 2, 13, 0, 0, 0);
  const d = parseDateOnly(ms);
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2027);
  assert.equal(d!.getMonth(), 2);
  assert.equal(d!.getDate(), 13);
});

test("parseDateOnly on a Date instance normalizes to local midnight for that same calendar date", () => {
  const input = new Date(2026, 5, 1, 23, 45, 0); // local 1 Jun 2026, 11:45pm
  const d = parseDateOnly(input);
  assert.ok(d);
  assert.equal(d!.getFullYear(), 2026);
  assert.equal(d!.getMonth(), 5);
  assert.equal(d!.getDate(), 1);
  assert.equal(d!.getHours(), 0);
});

test("parseDateOnly returns null for unparseable input", () => {
  assert.equal(parseDateOnly("not a date"), null);
  assert.equal(parseDateOnly(""), null);
});

// -------------------------------------------------------------------------
// Sweep: no raw toLocaleDateString/toLocaleTimeString/toLocaleString/
// Intl.DateTimeFormat should remain anywhere under app/, components/, lib/
// outside this module -- every date display should route through the
// formatters above. A short allowlist covers spots that are deliberately
// not display formatting (an internal rate-limit bucket key, a captured
// timezone id, chart-bucket labels with shapes the six formatters don't
// cover that are already en-AU and already timezone-safe).
// -------------------------------------------------------------------------

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];
const SKIP_DIR_NAMES = new Set(["node_modules", ".next", ".git"]);
const FILE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SELF_PATH = relative(ROOT, join(__dirname, "dates.ts")).replace(/\\/g, "/");

// path (relative to repo root, forward slashes) -> why it's exempt.
const ALLOWLIST: Record<string, string> = {
  "lib/ai/usageLimit.ts":
    "sydneyDay() is an internal Australia/Sydney-pinned day-bucket key for AI rate limiting, not display text.",
  "app/(app)/fine-print/FinePrintClient.tsx":
    "Intl.DateTimeFormat().resolvedOptions().timeZone captures the viewer's IANA timezone id for consent metadata, not a formatted date.",
  "lib/money/reasoning/moneyTimelineBuckets.ts":
    "bucketLabel() mixes four distinct shapes (day+month, month+year, quarter+year, bare year) in one switch; already en-AU and UTC-pinned for deterministic chart bucket math, left as one cohesive function.",
  "app/(app)/money/year/YearClient.tsx":
    "monthName() uses a full ('long') month name; already en-AU and UTC-pinned, no matching shared formatter shape.",
  "app/(app)/money/saved/SavedClient.tsx":
    "monthName() uses a full ('long') month name; already en-AU and UTC-pinned, no matching shared formatter shape.",
  "components/glance/PageGlance.tsx":
    "dayLabel()/chart axis labels use day-only or month-only (no year) shapes; already en-AU and built from locally-constructed dates, no matching shared formatter shape.",
};

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (FILE_EXTENSIONS.has(entry.slice(entry.lastIndexOf("."))) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
}

test("no raw toLocaleDateString/toLocaleTimeString/toLocaleString/Intl.DateTimeFormat remains outside lib/format/dates.ts, except the documented allowlist", () => {
  const pattern = /\.toLocaleDateString\(|\.toLocaleTimeString\(|\.toLocaleString\(|Intl\.DateTimeFormat\(/;
  const offenders: string[] = [];

  for (const dir of SCAN_DIRS) {
    const files: string[] = [];
    walk(join(ROOT, dir), files);
    for (const file of files) {
      const relPath = relative(ROOT, file).replace(/\\/g, "/");
      if (relPath === SELF_PATH) continue;
      if (relPath in ALLOWLIST) continue;
      const text = readFileSync(file, "utf8");
      if (pattern.test(text)) {
        const lineNo = text.slice(0, text.search(pattern)).split("\n").length;
        offenders.push(`${relPath}:${lineNo}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `Raw locale date formatting found outside lib/format/dates.ts:\n${offenders.join("\n")}`);
});
