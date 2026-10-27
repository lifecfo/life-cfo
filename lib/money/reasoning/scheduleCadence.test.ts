import assert from "node:assert/strict";
import test from "node:test";
import { advanceOccurrence, scheduledItemsFromTruth } from "./scheduleCadence";
import type { HouseholdMoneyTruth } from "./types";

test("advanceOccurrence steps weekly by 7 days", () => {
  const next = advanceOccurrence(new Date("2026-10-06T00:00:00.000Z"), "weekly", 6, 9);
  assert.equal(next?.toISOString(), "2026-10-13T00:00:00.000Z");
});

test("advanceOccurrence steps fortnightly by 14 days", () => {
  const next = advanceOccurrence(new Date("2026-10-06T00:00:00.000Z"), "fortnightly", 6, 9);
  assert.equal(next?.toISOString(), "2026-10-20T00:00:00.000Z");
});

test("advanceOccurrence steps monthly, preserving the anchor day", () => {
  const next = advanceOccurrence(new Date("2026-10-15T00:00:00.000Z"), "monthly", 15, 9);
  assert.equal(next?.toISOString(), "2026-11-15T00:00:00.000Z");
});

test("advanceOccurrence clamps monthly to the shorter month when the anchor day doesn't exist", () => {
  // Anchor day 31 (e.g. Jan 31) stepping into February, a 28-day month.
  const next = advanceOccurrence(new Date("2026-01-31T00:00:00.000Z"), "monthly", 31, 0);
  assert.equal(next?.toISOString(), "2026-02-28T00:00:00.000Z");
});

test("advanceOccurrence steps quarterly by 3 calendar months", () => {
  const next = advanceOccurrence(new Date("2026-01-31T00:00:00.000Z"), "quarterly", 31, 0);
  assert.equal(next?.toISOString(), "2026-04-30T00:00:00.000Z");
});

test("advanceOccurrence steps annual/yearly by 1 year, clamped to the anchor month's length", () => {
  const annual = advanceOccurrence(new Date("2026-02-28T00:00:00.000Z"), "annual", 29, 1);
  assert.equal(annual?.toISOString(), "2027-02-28T00:00:00.000Z");
  const yearly = advanceOccurrence(new Date("2026-06-15T00:00:00.000Z"), "yearly", 15, 5);
  assert.equal(yearly?.toISOString(), "2027-06-15T00:00:00.000Z");
});

test("advanceOccurrence returns null for an unsupported cadence", () => {
  const next = advanceOccurrence(new Date("2026-10-06T00:00:00.000Z"), "daily", 6, 9);
  assert.equal(next, null);
});

function truthWith(
  overrides: Partial<Pick<HouseholdMoneyTruth, "recurring_bills" | "recurring_income">>
): HouseholdMoneyTruth {
  return {
    household_id: "h1",
    as_of_iso: "2026-10-06T00:00:00.000Z",
    windows: {
      now_iso: "2026-10-06T00:00:00.000Z",
      next30_iso: "2026-11-05T00:00:00.000Z",
      month_start_iso: "2026-10-01T00:00:00.000Z",
      month_end_iso: "2026-10-31T00:00:00.000Z",
    },
    accounts: [],
    recent_transactions: [],
    month_transactions: [],
    rolling_transactions: [],
    recurring_bills: [],
    recurring_income: [],
    goals: [],
    liabilities: [],
    external_connections: [],
    transaction_pattern_confirmations: [],
    counts: { budget_items: 0, investment_accounts: 0 },
    ...overrides,
  };
}

test("scheduledItemsFromTruth combines bills and income and drops zero/negative amounts", () => {
  const truth = truthWith({
    recurring_bills: [
      {
        id: "b1",
        name: "Internet",
        amount_cents: 8900,
        currency: "AUD",
        cadence: "monthly",
        next_due_at: "2026-10-18T00:00:00.000Z",
        autopay: true,
        active: true,
        notes: null,
      },
      {
        id: "b2",
        name: "Zeroed bill",
        amount_cents: 0,
        currency: "AUD",
        cadence: "monthly",
        next_due_at: "2026-10-18T00:00:00.000Z",
        autopay: false,
        active: true,
        notes: null,
      },
    ],
    recurring_income: [
      {
        id: "i1",
        name: "Pay",
        amount_cents: 284000,
        currency: "AUD",
        cadence: "fortnightly",
        next_pay_at: "2026-10-09T00:00:00.000Z",
        active: true,
        notes: null,
      },
    ],
  });

  const items = scheduledItemsFromTruth(truth);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.name).sort(),
    ["Internet", "Pay"]
  );
});
