import assert from "node:assert/strict";
import test from "node:test";
import {
  hasOneOffBills,
  hasOneOffIncome,
  oneOffBillItems,
  oneOffBillsMonthlyCents,
  oneOffIncomeItems,
  oneOffIncomeMonthlyCents,
} from "./householdItemsSummary";
import type { SampleItem } from "@/lib/demo/sampleHousehold";

function item(overrides: Partial<SampleItem>): SampleItem {
  return {
    id: "item-1",
    title: "Item",
    kind: "bill",
    category: "Household",
    amount_cents: 10000,
    cadence: "monthly",
    due_on: "2026-11-01",
    owner: "Household",
    ...overrides,
  };
}

test("a one-off bill never contributes to the income total (no double counting across kinds)", () => {
  const items = [item({ id: "b1", kind: "bill", amount_cents: 10000 })];
  assert.equal(oneOffIncomeMonthlyCents(items), 0);
  assert.equal(oneOffBillsMonthlyCents(items), 10000);
  assert.equal(hasOneOffIncome(items), false);
  assert.equal(hasOneOffBills(items), true);
});

test("a one-off income item never contributes to the bills total", () => {
  const items = [item({ id: "i1", kind: "income", amount_cents: 300000 })];
  assert.equal(oneOffIncomeMonthlyCents(items), 300000);
  assert.equal(oneOffBillsMonthlyCents(items), 0);
  assert.equal(hasOneOffIncome(items), true);
  assert.equal(hasOneOffBills(items), false);
});

test("renewals count as bills, not income, and notes count as neither", () => {
  const items = [
    item({ id: "r1", kind: "renewal", amount_cents: 5000 }),
    item({ id: "n1", kind: "note", amount_cents: 999999 }),
  ];
  assert.equal(oneOffBillsMonthlyCents(items), 5000);
  assert.equal(oneOffIncomeMonthlyCents(items), 0);
  assert.deepEqual(oneOffBillItems(items).map((i) => i.id), ["r1"]);
  assert.deepEqual(oneOffIncomeItems(items), []);
});

test("mixed income and bills are summed independently, matching the sum of their own kind only", () => {
  const items = [
    item({ id: "i1", kind: "income", amount_cents: 300000 }),
    item({ id: "i2", kind: "income", amount_cents: 50000 }),
    item({ id: "b1", kind: "bill", amount_cents: 10000 }),
    item({ id: "b2", kind: "renewal", amount_cents: 2000 }),
  ];
  assert.equal(oneOffIncomeMonthlyCents(items), 350000);
  assert.equal(oneOffBillsMonthlyCents(items), 12000);
});

test("an empty list has neither one-off income nor bills", () => {
  assert.equal(hasOneOffIncome([]), false);
  assert.equal(hasOneOffBills([]), false);
  assert.equal(oneOffIncomeMonthlyCents([]), 0);
  assert.equal(oneOffBillsMonthlyCents([]), 0);
});

test("a non-monthly cadence is restated to a monthly equivalent, same as the rest of the app", () => {
  // fortnightly: amount * 26 / 12
  const items = [item({ id: "i1", kind: "income", amount_cents: 100000, cadence: "fortnightly" })];
  assert.equal(oneOffIncomeMonthlyCents(items), Math.round((100000 * 26) / 12));
});
