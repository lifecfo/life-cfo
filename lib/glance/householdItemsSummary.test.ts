import assert from "node:assert/strict";
import test from "node:test";
import {
  addThingsBillItems,
  addThingsIncomeItems,
  hasAddThingsBills,
  hasAddThingsIncome,
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

test("a bill item never appears in the income list (no double counting across kinds)", () => {
  const items = [item({ id: "b1", kind: "bill", amount_cents: 10000 })];
  assert.deepEqual(addThingsIncomeItems(items), []);
  assert.deepEqual(addThingsBillItems(items).map((i) => i.id), ["b1"]);
  assert.equal(hasAddThingsIncome(items), false);
  assert.equal(hasAddThingsBills(items), true);
});

test("an income item never appears in the bills list", () => {
  const items = [item({ id: "i1", kind: "income", amount_cents: 300000 })];
  assert.deepEqual(addThingsBillItems(items), []);
  assert.deepEqual(addThingsIncomeItems(items).map((i) => i.id), ["i1"]);
  assert.equal(hasAddThingsIncome(items), true);
  assert.equal(hasAddThingsBills(items), false);
});

test("renewals count as bills, not income; receipts count as neither", () => {
  const items = [
    item({ id: "r1", kind: "renewal", amount_cents: 5000 }),
    item({ id: "n1", kind: "receipt", amount_cents: 999999 }),
  ];
  assert.deepEqual(addThingsBillItems(items).map((i) => i.id), ["r1"]);
  assert.deepEqual(addThingsIncomeItems(items), []);
  assert.equal(hasAddThingsIncome(items), false);
  assert.equal(hasAddThingsBills(items), true);
});

test("items are returned exactly as entered -- no monthly restatement, no derived totals", () => {
  const items = [
    item({ id: "i1", kind: "income", amount_cents: 300000, cadence: "fortnightly", due_on: "2026-11-03" }),
    item({ id: "b1", kind: "bill", amount_cents: 10000, cadence: "monthly", due_on: "2026-11-05" }),
  ];
  const [income] = addThingsIncomeItems(items);
  const [bill] = addThingsBillItems(items);
  // The raw entered amount and date pass through unchanged -- these
  // helpers must never compute a monthly-equivalent cents figure (that
  // would imply a recurrence the household_items table never recorded).
  assert.equal(income.amount_cents, 300000);
  assert.equal(income.due_on, "2026-11-03");
  assert.equal(bill.amount_cents, 10000);
  assert.equal(bill.due_on, "2026-11-05");
});

test("an empty list has neither income nor bill items added through Add things", () => {
  assert.equal(hasAddThingsIncome([]), false);
  assert.equal(hasAddThingsBills([]), false);
  assert.deepEqual(addThingsIncomeItems([]), []);
  assert.deepEqual(addThingsBillItems([]), []);
});

test("mixed income and bill items are each returned in full, independently of each other", () => {
  const items = [
    item({ id: "i1", kind: "income", amount_cents: 300000 }),
    item({ id: "i2", kind: "income", amount_cents: 50000 }),
    item({ id: "b1", kind: "bill", amount_cents: 10000 }),
    item({ id: "b2", kind: "renewal", amount_cents: 2000 }),
  ];
  assert.deepEqual(addThingsIncomeItems(items).map((i) => i.id).sort(), ["i1", "i2"]);
  assert.deepEqual(addThingsBillItems(items).map((i) => i.id).sort(), ["b1", "b2"]);
});
