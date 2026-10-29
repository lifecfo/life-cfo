// Pure summary helpers for the one-off / shared items captured via the
// "Add things" flow (the household_items table, surfaced through
// /api/picture). These are deliberately kept separate from the
// household's recurring commitments (recurring_income/recurring_bills),
// which live in their own tables and have their own authoritative
// summaries on Income/Bills/Budget. Never merge the two models or infer
// a cadence that wasn't entered -- a one-off item stays one-off.
import { monthlyCents, type SampleItem } from "@/lib/demo/sampleHousehold";

export function oneOffIncomeItems(items: SampleItem[]): SampleItem[] {
  return items.filter((item) => item.kind === "income");
}

export function oneOffBillItems(items: SampleItem[]): SampleItem[] {
  return items.filter((item) => item.kind === "bill" || item.kind === "renewal");
}

export function hasOneOffIncome(items: SampleItem[]): boolean {
  return oneOffIncomeItems(items).length > 0;
}

export function hasOneOffBills(items: SampleItem[]): boolean {
  return oneOffBillItems(items).length > 0;
}

export function oneOffIncomeMonthlyCents(items: SampleItem[]): number {
  return oneOffIncomeItems(items).reduce((sum, item) => sum + monthlyCents(item.amount_cents, item.cadence), 0);
}

export function oneOffBillsMonthlyCents(items: SampleItem[]): number {
  return oneOffBillItems(items).reduce((sum, item) => sum + monthlyCents(item.amount_cents, item.cadence), 0);
}
