// Pure filters for the items captured via the "Add things" flow (the
// household_items table, surfaced through /api/picture). Being stored in
// that table says nothing about whether an item recurs -- it's a shared
// capture record, not a recurring commitment. These helpers deliberately
// do NOT compute a monthly-equivalent or any other derived total: items
// are shown exactly as entered (amount + date), never restated onto a
// cadence that wasn't recorded. The household's recurring commitments
// live in recurring_income/recurring_bills and have their own
// authoritative summaries elsewhere -- never merge the two models here.
import type { SampleItem } from "@/lib/demo/sampleHousehold";

export function addThingsIncomeItems(items: SampleItem[]): SampleItem[] {
  return items.filter((item) => item.kind === "income");
}

export function addThingsBillItems(items: SampleItem[]): SampleItem[] {
  return items.filter((item) => item.kind === "bill" || item.kind === "renewal");
}

export function hasAddThingsIncome(items: SampleItem[]): boolean {
  return addThingsIncomeItems(items).length > 0;
}

export function hasAddThingsBills(items: SampleItem[]): boolean {
  return addThingsBillItems(items).length > 0;
}
