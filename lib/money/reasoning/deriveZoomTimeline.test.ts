import assert from "node:assert/strict";
import test from "node:test";
import { deriveMoneyZoomTimeline } from "./deriveZoomTimeline";
import type { HouseholdMoneyTruth, TransactionsTruthRow } from "./types";

const NOW_ISO = "2026-10-15T00:00:00.000Z";

function baseTruth(overrides: Partial<HouseholdMoneyTruth> = {}): HouseholdMoneyTruth {
  return {
    household_id: "h1",
    as_of_iso: NOW_ISO,
    windows: {
      now_iso: NOW_ISO,
      next30_iso: "2026-11-14T00:00:00.000Z",
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

function txn(overrides: Partial<TransactionsTruthRow>): TransactionsTruthRow {
  return {
    id: "tx-1",
    connection_id: null,
    external_connection_id: null,
    date: "2026-10-01",
    description: "Payment",
    merchant: "Payment",
    category: "Groceries",
    pending: false,
    amount: null,
    amount_cents: -5000,
    currency: "AUD",
    account_id: null,
    provider: "manual",
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

test("flags exactly one bucket as today's marker", () => {
  const timeline = deriveMoneyZoomTimeline(baseTruth(), [txn({})], "month", NOW_ISO);
  const points = timeline.currencies[0]?.points ?? [];
  assert.ok(points.length, "expected at least one currency series");
  const today = points.filter((p) => p.is_today_marker);
  assert.equal(today.length, 1);
  assert.equal(today[0].bucket_key, timeline.today_bucket_key);
  assert.equal(today[0].kind, "actual");
});

test("returns no currency series when there is nothing to show (matches the existing Year Ahead empty-state convention)", () => {
  const timeline = deriveMoneyZoomTimeline(baseTruth(), [], "month", NOW_ISO);
  assert.deepEqual(timeline.currencies, []);
});

test("future buckets are planned, built from recurring bills/income", () => {
  const truth = baseTruth({
    recurring_bills: [
      {
        id: "b1",
        name: "Rego",
        amount_cents: 74200,
        currency: "AUD",
        cadence: "quarterly",
        next_due_at: "2026-11-20T00:00:00.000Z",
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
        next_pay_at: "2026-11-05T00:00:00.000Z",
        active: true,
        notes: null,
      },
    ],
  });

  const timeline = deriveMoneyZoomTimeline(truth, [], "month", NOW_ISO);
  const november = timeline.currencies[0].points.find((p) => p.label.startsWith("Nov"));
  assert.ok(november, "expected a November bucket");
  assert.equal(november!.kind, "planned");
  assert.equal(november!.money_out_cents, 74200);
  assert.ok(november!.money_in_cents > 0);
  assert.ok(november!.breakdown.some((b) => b.name === "Rego" && b.kind === "bill"));
  assert.ok(november!.breakdown.some((b) => b.name === "Pay" && b.kind === "income"));
});

test("past/current buckets are actual, aggregated from real transactions by category", () => {
  const transactions = [
    txn({ id: "t1", date: "2026-10-04", amount_cents: -5000, category: "Groceries" }),
    txn({ id: "t2", date: "2026-10-10", amount_cents: -3000, category: "Groceries" }),
    txn({ id: "t3", date: "2026-10-12", amount_cents: -8900, category: "Utilities" }),
    txn({ id: "t4", date: "2026-10-02", amount_cents: 284000, category: "Income" }),
  ];

  const timeline = deriveMoneyZoomTimeline(baseTruth(), transactions, "month", NOW_ISO);
  const current = timeline.currencies[0].points.find((p) => p.is_today_marker);
  assert.ok(current);
  assert.equal(current!.kind, "actual");
  assert.equal(current!.money_out_cents, 5000 + 3000 + 8900);
  assert.equal(current!.money_in_cents, 284000);

  const groceries = current!.breakdown.find((b) => b.name === "Groceries");
  assert.equal(groceries?.amount_cents, 8000);
  const income = current!.breakdown.find((b) => b.name === "Income" && b.kind === "category");
  assert.equal(income?.amount_cents, 284000);
});

test("pending and transfer-like transactions are excluded from actuals", () => {
  const transactions = [
    txn({ id: "t1", date: "2026-10-04", amount_cents: -5000, pending: true }),
    txn({ id: "t2", date: "2026-10-05", amount_cents: -2000, description: "Transfer to savings", category: "Transfer" }),
    txn({ id: "t3", date: "2026-10-06", amount_cents: -1500, pending: false, category: "Groceries" }),
  ];

  const timeline = deriveMoneyZoomTimeline(baseTruth(), transactions, "month", NOW_ISO);
  const current = timeline.currencies[0].points.find((p) => p.is_today_marker);
  assert.equal(current?.money_out_cents, 1500);
});

test("separates currencies into their own point series", () => {
  const transactions = [
    txn({ id: "t1", date: "2026-10-04", amount_cents: -5000, currency: "AUD" }),
    txn({ id: "t2", date: "2026-10-05", amount_cents: -2000, currency: "USD" }),
  ];
  const timeline = deriveMoneyZoomTimeline(baseTruth(), transactions, "month", NOW_ISO);
  assert.equal(timeline.mixed_currencies, true);
  assert.deepEqual(
    timeline.currencies.map((c) => c.currency).sort(),
    ["AUD", "USD"]
  );
});
