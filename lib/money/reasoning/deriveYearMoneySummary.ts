import { deriveMoneyBuckets } from "./deriveMoneyBuckets";
import {
  SUPPORTED_CADENCES,
  advanceOccurrence,
  scheduledItemsFromTruth,
  type ScheduledItem,
} from "./scheduleCadence";
import type {
  HouseholdMoneyTruth,
  MoneyYearAmount,
  MoneyYearLargerPayment,
  MoneyYearMonthSummary,
  MoneyYearScheduledOccurrence,
  MoneyYearSeasonSummary,
  MoneyYearSummary,
  MoneyYearTimingNeededItem,
} from "./types";
import { formatMonthYear, parseDateOnly } from "@/lib/format/dates";

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// `date` is always a UTC month-start (see monthStart above), so its UTC
// calendar fields are the ones that matter -- parseDateOnly(toISOString())
// reads those literal digits rather than the runtime's local timezone,
// keeping this label stable regardless of where it renders.
function monthLabel(date: Date): string {
  const d = parseDateOnly(date.toISOString());
  return d ? formatMonthYear(d) : "";
}

function projectItem(
  item: ScheduledItem,
  windowStart: Date,
  windowEnd: Date
): { occurrences: MoneyYearScheduledOccurrence[]; timingNeeded: MoneyYearTimingNeededItem | null } {
  const nextMs = Date.parse(item.next_at || "");
  if (!Number.isFinite(nextMs)) {
    return {
      occurrences: [],
      timingNeeded: { ...item, reason: "missing_date" },
    };
  }
  if (!SUPPORTED_CADENCES.has(item.cadence)) {
    return {
      occurrences: [],
      timingNeeded: { ...item, reason: "unsupported_cadence" },
    };
  }

  let occurrence = new Date(nextMs);
  const anchorDay = occurrence.getUTCDate();
  const anchorMonth = occurrence.getUTCMonth();
  let guard = 0;

  while (occurrence < windowStart && guard < 1000) {
    const next = advanceOccurrence(occurrence, item.cadence, anchorDay, anchorMonth);
    if (!next) break;
    occurrence = next;
    guard += 1;
  }

  const occurrences: MoneyYearScheduledOccurrence[] = [];
  while (occurrence < windowEnd && guard < 1000) {
    occurrences.push({
      name: item.name,
      kind: item.kind,
      currency: item.currency,
      amount_cents: item.amount_cents,
      expected_at: occurrence.toISOString(),
      month_key: monthKey(occurrence),
      cadence: item.cadence,
    });
    const next = advanceOccurrence(occurrence, item.cadence, anchorDay, anchorMonth);
    if (!next) break;
    occurrence = next;
    guard += 1;
  }

  return { occurrences, timingNeeded: null };
}

function amountRows(totals: Map<string, number>): MoneyYearAmount[] {
  return [...totals.entries()]
    .map(([currency, cents]) => ({ currency, cents: Math.round(cents) }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function totalsFor(
  occurrences: MoneyYearScheduledOccurrence[],
  kind: "income" | "bill"
): MoneyYearAmount[] {
  const totals = new Map<string, number>();
  for (const occurrence of occurrences) {
    if (occurrence.kind !== kind) continue;
    totals.set(
      occurrence.currency,
      (totals.get(occurrence.currency) ?? 0) + occurrence.amount_cents
    );
  }
  return amountRows(totals);
}

function differenceRows(income: MoneyYearAmount[], bills: MoneyYearAmount[]): MoneyYearAmount[] {
  const currencies = new Set([
    ...income.map((row) => row.currency),
    ...bills.map((row) => row.currency),
  ]);
  return [...currencies]
    .sort()
    .map((currency) => ({
      currency,
      cents:
        (income.find((row) => row.currency === currency)?.cents ?? 0) -
        (bills.find((row) => row.currency === currency)?.cents ?? 0),
    }));
}

function largerPayments(
  billOccurrences: MoneyYearScheduledOccurrence[]
): MoneyYearLargerPayment[] {
  const grouped = new Map<string, MoneyYearLargerPayment>();
  for (const occurrence of billOccurrences) {
    const key = `${occurrence.currency}:${occurrence.name.toLowerCase()}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...occurrence, occurrence_count: 1 });
      continue;
    }
    existing.occurrence_count += 1;
    if (occurrence.amount_cents > existing.amount_cents) {
      grouped.set(key, { ...occurrence, occurrence_count: existing.occurrence_count });
    }
  }

  const rows = [...grouped.values()].sort(
    (left, right) => right.amount_cents - left.amount_cents
  );
  const selected = rows.slice(0, 3);
  for (const row of rows) {
    if (selected.length >= 5) break;
    if (
      (row.cadence === "quarterly" || row.cadence === "annual" || row.cadence === "yearly") &&
      !selected.includes(row)
    ) {
      selected.push(row);
    }
  }
  for (const row of rows) {
    if (selected.length >= 5) break;
    if (!selected.includes(row)) selected.push(row);
  }
  return selected;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function seasons(
  months: MoneyYearMonthSummary[],
  currencies: string[]
): MoneyYearSeasonSummary[] {
  return currencies.map((currency) => {
    const totals = months.map(
      (month) => month.expected_bills.find((row) => row.currency === currency)?.cents ?? 0
    );
    const medianCents = median(totals);
    const materialDifference = Math.max(10000, medianCents * 0.15);
    const heavierMonths = months
      .filter((month, index) => totals[index] - medianCents >= materialDifference)
      .map((month) => month.month_key);
    const quieterMonths = months
      .filter((month, index) => medianCents - totals[index] >= materialDifference)
      .map((month) => month.month_key);
    return {
      currency,
      status:
        heavierMonths.length || quieterMonths.length ? "varied" : "fairly_even",
      median_planned_bills_cents: Math.round(medianCents),
      heavier_months: heavierMonths,
      quieter_months: quieterMonths,
    };
  });
}

export function deriveYearMoneySummary(
  truth: HouseholdMoneyTruth,
  nowIso = truth.windows.now_iso || truth.as_of_iso
): MoneyYearSummary {
  const parsedNow = Date.parse(nowIso);
  const now = Number.isFinite(parsedNow) ? new Date(parsedNow) : new Date();
  const windowStart = monthStart(now);
  const windowEnd = new Date(
    Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + 12, 1)
  );
  const monthStarts = Array.from({ length: 12 }, (_, index) =>
    new Date(Date.UTC(windowStart.getUTCFullYear(), windowStart.getUTCMonth() + index, 1))
  );

  const occurrences: MoneyYearScheduledOccurrence[] = [];
  const timingNeeded: MoneyYearTimingNeededItem[] = [];
  for (const item of scheduledItemsFromTruth(truth)) {
    const projected = projectItem(item, windowStart, windowEnd);
    occurrences.push(...projected.occurrences);
    if (projected.timingNeeded) timingNeeded.push(projected.timingNeeded);
  }

  const billOccurrences = occurrences.filter((item) => item.kind === "bill");
  const months = monthStarts.map((start): MoneyYearMonthSummary => {
    const key = monthKey(start);
    const monthOccurrences = occurrences.filter((item) => item.month_key === key);
    const income = totalsFor(monthOccurrences, "income");
    const bills = totalsFor(monthOccurrences, "bill");
    const monthLarger = [...monthOccurrences]
      .filter((item) => item.kind === "bill")
      .sort((left, right) => right.amount_cents - left.amount_cents)
      .slice(0, 2);
    return {
      month_key: key,
      label: monthLabel(start),
      expected_income: income,
      expected_bills: bills,
      difference: differenceRows(income, bills),
      larger_scheduled_payments: monthLarger,
    };
  });

  const currencies = [...new Set(occurrences.map((item) => item.currency))].sort();
  const seasonRows = seasons(months, currencies);

  return {
    version: 1,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    currencies,
    mixed_currencies: currencies.length > 1,
    expected_income_total: totalsFor(occurrences, "income"),
    expected_bills_total: totalsFor(occurrences, "bill"),
    months,
    larger_scheduled_payments: largerPayments(billOccurrences),
    goals: deriveMoneyBuckets(truth.goals).buckets.slice(0, 3),
    timing_needed: timingNeeded.sort((left, right) => left.name.localeCompare(right.name)),
    seasons: seasonRows,
    months_worth_closer_look: new Set(
      seasonRows.flatMap((row) => row.heavier_months)
    ).size,
  };
}
