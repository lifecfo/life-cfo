// Cadence-walking primitives for projecting a recurring bill/income item
// forward in time. Extracted from deriveYearMoneySummary.ts (the original,
// still-used 12-fixed-month derivation) so the new granularity-generic
// timeline (deriveZoomTimeline.ts) can reuse the exact same stepping logic
// rather than duplicating it -- this is the only cadence math in the app.
import type { HouseholdMoneyTruth, RecurringBillsTruthRow, RecurringIncomeTruthRow } from "./types";

export type ScheduledItem = {
  name: string;
  kind: "income" | "bill";
  currency: string;
  amount_cents: number;
  cadence: string;
  next_at: string | null;
};

export const SUPPORTED_CADENCES = new Set([
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "annual",
  "yearly",
]);

export function normalizeCurrency(value: string | null | undefined): string {
  return String(value || "AUD").trim().toUpperCase() || "AUD";
}

export function normalizeCadence(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function addCalendarMonths(date: Date, months: number, anchorDay: number): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  first.setUTCDate(Math.min(anchorDay, lastDay));
  return first;
}

export function advanceOccurrence(
  date: Date,
  cadence: string,
  anchorDay: number,
  anchorMonth: number
): Date | null {
  const next = new Date(date);
  if (cadence === "weekly" || cadence === "fortnightly") {
    next.setUTCDate(next.getUTCDate() + (cadence === "weekly" ? 7 : 14));
    return next;
  }
  if (cadence === "monthly") return addCalendarMonths(date, 1, anchorDay);
  if (cadence === "quarterly") return addCalendarMonths(date, 3, anchorDay);
  if (cadence === "annual" || cadence === "yearly") {
    const year = date.getUTCFullYear() + 1;
    const lastDay = new Date(Date.UTC(year, anchorMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, anchorMonth, Math.min(anchorDay, lastDay)));
  }
  return null;
}

export function scheduledItemsFromTruth(truth: HouseholdMoneyTruth): ScheduledItem[] {
  const income = truth.recurring_income.map((item: RecurringIncomeTruthRow) => ({
    name: String(item.name || "Regular income").trim() || "Regular income",
    kind: "income" as const,
    currency: normalizeCurrency(item.currency),
    amount_cents: Math.max(0, item.amount_cents ?? 0),
    cadence: normalizeCadence(item.cadence),
    next_at: item.next_pay_at,
  }));
  const bills = truth.recurring_bills.map((item: RecurringBillsTruthRow) => ({
    name: String(item.name || "Regular payment").trim() || "Regular payment",
    kind: "bill" as const,
    currency: normalizeCurrency(item.currency),
    amount_cents: Math.max(0, item.amount_cents ?? 0),
    cadence: normalizeCadence(item.cadence),
    next_at: item.next_due_at,
  }));
  return [...income, ...bills].filter((item) => item.amount_cents > 0);
}
