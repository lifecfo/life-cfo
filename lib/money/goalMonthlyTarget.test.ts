import assert from "node:assert/strict";
import test from "node:test";

import { computeGoalMonthlyTarget } from "./goalMonthlyTarget";

const NOW = "2026-10-01T09:00:00.000Z";

test("target already reached reports 'reached', even if the date has also passed", () => {
  const reachedFuture = computeGoalMonthlyTarget({
    targetCents: 100000,
    currentCents: 100000,
    deadlineIso: "2027-01-01T00:00:00.000Z",
    nowIso: NOW,
  });
  assert.deepEqual(reachedFuture, { kind: "reached" });

  const reachedPastDeadline = computeGoalMonthlyTarget({
    targetCents: 100000,
    currentCents: 120000,
    deadlineIso: "2026-01-01T00:00:00.000Z",
    nowIso: NOW,
  });
  assert.deepEqual(reachedPastDeadline, { kind: "reached" });
});

test("a deadline strictly before now, with the target not yet reached, reports 'date_passed'", () => {
  const result = computeGoalMonthlyTarget({
    targetCents: 100000,
    currentCents: 50000,
    deadlineIso: "2026-09-01T00:00:00.000Z",
    nowIso: NOW,
  });
  assert.deepEqual(result, { kind: "date_passed" });
});

test("a deadline with zero whole months remaining reports 'less_than_month'", () => {
  const sameInstant = computeGoalMonthlyTarget({
    targetCents: 100000,
    currentCents: 50000,
    deadlineIso: NOW,
    nowIso: NOW,
  });
  assert.deepEqual(sameInstant, { kind: "less_than_month" });

  const threeWeeksOut = computeGoalMonthlyTarget({
    targetCents: 100000,
    currentCents: 50000,
    deadlineIso: "2026-10-22T09:00:00.000Z",
    nowIso: NOW,
  });
  assert.deepEqual(threeWeeksOut, { kind: "less_than_month" });
});

test("exactly one whole month remaining reports per_month with months: 1", () => {
  const result = computeGoalMonthlyTarget({
    targetCents: 100000,
    currentCents: 50000,
    deadlineIso: "2026-11-01T09:00:00.000Z",
    nowIso: NOW,
  });
  assert.deepEqual(result, { kind: "per_month", dollarsPerMonth: 500, months: 1 });
});

test("several whole months remaining divides evenly when the remainder allows it", () => {
  const result = computeGoalMonthlyTarget({
    targetCents: 120000, // $1,200 remaining over 6 months = $200/month exactly
    currentCents: 0,
    deadlineIso: "2027-04-01T09:00:00.000Z", // 6 whole months from NOW
    nowIso: NOW,
  });
  assert.deepEqual(result, { kind: "per_month", dollarsPerMonth: 200, months: 6 });
});

test("a remainder that doesn't divide evenly rounds up to the next whole dollar", () => {
  const result = computeGoalMonthlyTarget({
    targetCents: 100000, // $1,000 remaining over 3 months = $333.33... -> $334
    currentCents: 0,
    deadlineIso: "2027-01-01T09:00:00.000Z", // 3 whole months from NOW
    nowIso: NOW,
  });
  assert.deepEqual(result, { kind: "per_month", dollarsPerMonth: 334, months: 3 });
});
