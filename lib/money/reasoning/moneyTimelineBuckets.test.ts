import assert from "node:assert/strict";
import test from "node:test";
import { buildTimelineBuckets } from "./moneyTimelineBuckets";

test("month buckets are calendar-aligned with exactly one current bucket", () => {
  const buckets = buildTimelineBuckets("month", "2026-10-15T00:00:00.000Z", 2, 2);
  assert.equal(buckets.length, 5);
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]
  );
  assert.equal(buckets.filter((b) => b.is_current).length, 1);
  assert.equal(buckets.find((b) => b.key === "2026-10")?.is_current, true);
  assert.equal(buckets.filter((b) => b.is_past).length, 2);
});

test("quarter buckets land in the right calendar quarter", () => {
  const buckets = buildTimelineBuckets("quarter", "2026-10-15T00:00:00.000Z", 1, 1);
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2026-Q3", "2026-Q4", "2027-Q1"]
  );
  assert.equal(buckets[1].is_current, true);
});

test("year buckets use the calendar year", () => {
  const buckets = buildTimelineBuckets("year", "2026-10-15T00:00:00.000Z", 1, 1);
  assert.deepEqual(
    buckets.map((b) => b.key),
    ["2025", "2026", "2027"]
  );
});

test("week buckets use ISO week numbers and start on Monday", () => {
  // 2026-10-15 is a Thursday.
  const buckets = buildTimelineBuckets("week", "2026-10-15T00:00:00.000Z", 1, 1);
  assert.equal(buckets.length, 3);
  assert.equal(buckets[1].is_current, true);
  for (const bucket of buckets) {
    const start = new Date(bucket.start_iso);
    assert.equal(start.getUTCDay(), 1, `${bucket.key} should start on a Monday`);
  }
});

test("bucket ranges are contiguous and non-overlapping", () => {
  const buckets = buildTimelineBuckets("week", "2026-10-15T00:00:00.000Z", 3, 3);
  for (let i = 1; i < buckets.length; i += 1) {
    assert.equal(buckets[i - 1].end_iso, buckets[i].start_iso);
  }
});
