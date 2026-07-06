import assert from "node:assert/strict";
import test from "node:test";
import { deriveMoneyTimeline } from "./deriveMoneyTimeline";
import type { MoneyYearSummary } from "./types";

function yearSummary(): MoneyYearSummary {
  return {
    version: 1,
    window_start: "2026-07-01T00:00:00.000Z",
    window_end: "2027-07-01T00:00:00.000Z",
    currencies: ["AUD", "USD"],
    mixed_currencies: true,
    expected_income_total: [],
    expected_bills_total: [],
    months: [
      {
        month_key: "2026-07",
        label: "Jul 2026",
        expected_income: [
          { currency: "AUD", cents: 500000 },
          { currency: "USD", cents: 200000 },
        ],
        expected_bills: [
          { currency: "AUD", cents: 350000 },
          { currency: "USD", cents: 100000 },
        ],
        difference: [
          { currency: "AUD", cents: 125000 },
          { currency: "USD", cents: 100000 },
        ],
        larger_scheduled_payments: [
          {
            name: "Home loan",
            kind: "bill",
            currency: "AUD",
            amount_cents: 315000,
            expected_at: "2026-07-05T00:00:00.000Z",
            month_key: "2026-07",
            cadence: "monthly",
          },
        ],
      },
      {
        month_key: "2026-08",
        label: "Aug 2026",
        expected_income: [{ currency: "AUD", cents: 300000 }],
        expected_bills: [{ currency: "AUD", cents: 420000 }],
        difference: [{ currency: "AUD", cents: -95000 }],
        larger_scheduled_payments: [],
      },
    ],
    larger_scheduled_payments: [],
    goals: [],
    timing_needed: [
      {
        name: "Annual insurance",
        kind: "bill",
        currency: "AUD",
        amount_cents: 120000,
        cadence: "annual",
        reason: "missing_date",
      },
    ],
    seasons: [
      {
        currency: "AUD",
        status: "varied",
        median_planned_bills_cents: 385000,
        heavier_months: ["2026-08"],
        quieter_months: [],
      },
    ],
    months_worth_closer_look: 1,
  };
}

test("keeps currencies separate and derives monthly visual values", () => {
  const timeline = deriveMoneyTimeline(yearSummary());

  assert.equal(timeline.basis, "current_schedules");
  assert.equal(timeline.currencies.length, 2);
  assert.deepEqual(timeline.currencies[0].months[0], {
    month_key: "2026-07",
    label: "Jul 2026",
    known_money_in_cents: 500000,
    known_money_out_cents: 350000,
    difference_cents: 125000,
    needs_closer_look: false,
    closer_look_reasons: [],
    largest_payment: { name: "Home loan", amount_cents: 315000 },
  });
  assert.equal(timeline.currencies[0].months[1].needs_closer_look, true);
  assert.deepEqual(timeline.currencies[0].months[1].closer_look_reasons, [
    "bills_above_income",
    "heavier_scheduled_month",
  ]);
  assert.equal(timeline.currencies[1].months[1].known_money_in_cents, 0);
  assert.equal(timeline.currencies[1].months[1].known_money_out_cents, 0);
});

test("uses the projected difference instead of recalculating it", () => {
  const timeline = deriveMoneyTimeline(yearSummary());

  assert.equal(timeline.currencies[0].months[0].difference_cents, 125000);
  assert.notEqual(
    timeline.currencies[0].months[0].difference_cents,
    500000 - 350000
  );
  assert.equal(timeline.currencies[0].months[1].difference_cents, -95000);
});

test("adds calm commentary for shortfalls and incomplete timing", () => {
  const timeline = deriveMoneyTimeline(yearSummary());

  assert.match(timeline.commentary[0], /Aug 2026 has more scheduled money going out/);
  assert.match(timeline.commentary[1], /1 regular item needs timing/);
  assert.equal(
    timeline.commentary.at(-1),
    "This view only includes schedules currently added."
  );
});

test("does not expose internal identifiers", () => {
  const serialized = JSON.stringify(deriveMoneyTimeline(yearSummary()));
  for (const key of [
    "user_id",
    "household_id",
    "account_id",
    "provider_id",
    "connection_id",
    "fixture_id",
  ]) {
    assert.equal(serialized.includes(`\"${key}\"`), false);
  }
});
