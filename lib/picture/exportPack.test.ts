import assert from "node:assert/strict";
import test from "node:test";

import { buildExportPack, monthlyEquivalentCents } from "./exportPack";

test("monthlyEquivalentCents normalises every cadence to a month", () => {
  assert.equal(monthlyEquivalentCents(10000, "weekly"), 43333);
  assert.equal(monthlyEquivalentCents(10000, "fortnightly"), 21667);
  assert.equal(monthlyEquivalentCents(10000, "monthly"), 10000);
  assert.equal(monthlyEquivalentCents(30000, "quarterly"), 10000);
  assert.equal(monthlyEquivalentCents(120000, "yearly"), 10000);
});

test("builds totals, excludes archived accounts and inactive income/bills, and never recommends anything", () => {
  const pack = buildExportPack({
    now: new Date("2026-10-26T00:00:00.000Z"),
    accounts: [
      { name: "Everyday", type: "everyday", currency: "AUD", current_balance_cents: 500000, archived: false },
      { name: "Old closed account", type: "everyday", currency: "AUD", current_balance_cents: 100, archived: true },
    ],
    income: [
      { name: "Jade pay", amount_cents: 300000, currency: "AUD", cadence: "fortnightly", active: true },
      { name: "Old job", amount_cents: 999999, currency: "AUD", cadence: "monthly", active: false },
    ],
    bills: [
      { name: "Rent", amount_cents: 200000, currency: "AUD", cadence: "monthly", autopay: true, active: true },
      { name: "Cancelled gym", amount_cents: 5000, currency: "AUD", cadence: "monthly", autopay: false, active: false },
    ],
    goals: [
      { title: "Buffer", currency: "AUD", target_cents: 1000000, current_cents: 250000, status: "active", deadline_at: null },
      { title: "Old archived goal", currency: "AUD", target_cents: 100, current_cents: 100, status: "archived", deadline_at: null },
    ],
    transactions: [
      { date: "2026-10-20", category: "Groceries", amount_cents: -8000 },
      { date: "2026-10-01", category: "Groceries", amount_cents: -4000 },
      { date: "2026-09-01", category: "Groceries", amount_cents: -999999 }, // outside 30 days
      { date: "2026-10-15", category: "Income", amount_cents: 300000 }, // inflow, ignored
    ],
  });

  assert.equal(pack.accounts.length, 1);
  assert.equal(pack.accounts[0].name, "Everyday");
  assert.deepEqual(pack.total_balance_by_currency, [{ currency: "AUD", cents: 500000 }]);

  assert.equal(pack.income.length, 1);
  assert.equal(pack.monthly_income_total_cents, 650000);

  assert.equal(pack.bills.length, 1);
  assert.equal(pack.monthly_bills_total_cents, 200000);

  assert.equal(pack.goals.length, 1);
  assert.equal(pack.goals[0].percent, 25);

  assert.equal(pack.spending_last_30_days.total_cents, 12000);
  assert.deepEqual(pack.spending_last_30_days.by_category, [{ category: "Groceries", cents: 12000 }]);

  assert.match(pack.note, /not financial advice/i);
  assert.match(pack.note, /not a recommendation/i);
});

test("the note accurately scopes coverage and does not claim to include Add things items", () => {
  const pack = buildExportPack({
    now: new Date("2026-10-26T00:00:00.000Z"),
    accounts: [],
    income: [],
    bills: [],
    goals: [],
    transactions: [],
  });

  // Regression for the export's over-broad "lists what was typed, uploaded,
  // or imported" wording, which implied coverage of items added through
  // Add things (household_items) that the export never actually queries --
  // and for "transactions" wording, which implied a full transaction
  // listing when the export only ever includes a category-level spending
  // summary.
  assert.match(pack.note, /recurring income and bills/i);
  assert.match(pack.note, /does not include items added through add things/i);
  assert.match(pack.note, /not a complete transaction listing/i);
  assert.doesNotMatch(pack.note, /uploaded, or imported/i);
});

test("missing names and currencies fall back to safe defaults instead of blank output", () => {
  const pack = buildExportPack({
    now: new Date("2026-10-26T00:00:00.000Z"),
    accounts: [{ name: null, type: null, currency: null, current_balance_cents: null, archived: false }],
    income: [],
    bills: [],
    goals: [],
    transactions: [],
  });
  assert.equal(pack.accounts[0].name, "Account");
  assert.equal(pack.accounts[0].currency, "AUD");
  assert.equal(pack.accounts[0].balance_cents, 0);
});
