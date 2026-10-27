// The zoomable timeline: past/current buckets use real transaction history
// (kind: "actual"), future buckets use the same recurring-schedule
// projection deriveYearMoneySummary.ts uses (kind: "planned"). This is a
// separate, additive derivation from deriveYearMoneySummary/deriveMoneyTimeline
// -- those stay exactly as they are (deriveMoneyMap.ts also depends on them).
import { advanceOccurrence, scheduledItemsFromTruth, SUPPORTED_CADENCES, type ScheduledItem } from "./scheduleCadence";
import { buildTimelineBuckets, DEFAULT_BUCKET_SPAN } from "./moneyTimelineBuckets";
import { centsFor, currencyFor, excludedPatternKeys, isIncludedMovement, labelFor } from "./transactionInclusion";
import type {
  HouseholdMoneyTruth,
  MoneyZoomBreakdownItem,
  MoneyZoomCurrency,
  MoneyZoomPoint,
  MoneyZoomTimelineSummary,
  TimelineBucket,
  TimelineGranularity,
  TransactionPatternConfirmationTruthRow,
  TransactionsTruthRow,
} from "./types";

type PlannedOccurrence = {
  bucket_key: string;
  name: string;
  kind: "bill" | "income";
  currency: string;
  amount_cents: number;
};

function bucketFor(buckets: TimelineBucket[], iso: string): TimelineBucket | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return buckets.find((bucket) => ms >= Date.parse(bucket.start_iso) && ms < Date.parse(bucket.end_iso)) ?? null;
}

// Future buckets only -- past/current buckets are populated from real
// transactions (see aggregateActualTransactionsIntoBuckets), not projected
// schedule, so there is no need to walk a cadence backward in time here.
export function projectScheduledOccurrencesIntoBuckets(
  items: ScheduledItem[],
  buckets: TimelineBucket[]
): PlannedOccurrence[] {
  const futureBuckets = buckets.filter((bucket) => !bucket.is_past && !bucket.is_current);
  if (!futureBuckets.length) return [];
  const windowStartMs = Date.parse(futureBuckets[0].start_iso);
  const windowEndMs = Date.parse(futureBuckets[futureBuckets.length - 1].end_iso);

  const occurrences: PlannedOccurrence[] = [];
  for (const item of items) {
    const nextMs = Date.parse(item.next_at || "");
    if (!Number.isFinite(nextMs) || !SUPPORTED_CADENCES.has(item.cadence)) continue;

    let occurrence = new Date(nextMs);
    const anchorDay = occurrence.getUTCDate();
    const anchorMonth = occurrence.getUTCMonth();
    let guard = 0;

    while (occurrence.getTime() < windowStartMs && guard < 1000) {
      const next = advanceOccurrence(occurrence, item.cadence, anchorDay, anchorMonth);
      if (!next) break;
      occurrence = next;
      guard += 1;
    }

    while (occurrence.getTime() < windowEndMs && guard < 1000) {
      const bucket = bucketFor(futureBuckets, occurrence.toISOString());
      if (bucket) {
        occurrences.push({
          bucket_key: bucket.key,
          name: item.name,
          kind: item.kind,
          currency: item.currency,
          amount_cents: item.amount_cents,
        });
      }
      const next = advanceOccurrence(occurrence, item.cadence, anchorDay, anchorMonth);
      if (!next) break;
      occurrence = next;
      guard += 1;
    }
  }
  return occurrences;
}

type ActualBucketTotals = {
  money_in_cents: number;
  money_out_cents: number;
  by_category_out_cents: Map<string, number>;
};

export function aggregateActualTransactionsIntoBuckets(
  transactions: TransactionsTruthRow[],
  confirmations: TransactionPatternConfirmationTruthRow[],
  buckets: TimelineBucket[]
): Map<string, Map<string, ActualBucketTotals>> {
  // outer key: currency, inner key: bucket_key
  const ignored = excludedPatternKeys(confirmations);
  const actualBuckets = buckets.filter((bucket) => bucket.is_past || bucket.is_current);
  const result = new Map<string, Map<string, ActualBucketTotals>>();

  for (const row of transactions) {
    if (!row.date || !isIncludedMovement(row, ignored)) continue;
    const bucket = bucketFor(actualBuckets, `${row.date}T00:00:00.000Z`);
    if (!bucket) continue;

    const currency = currencyFor(row);
    const cents = centsFor(row);
    if (!result.has(currency)) result.set(currency, new Map());
    const byBucket = result.get(currency)!;
    if (!byBucket.has(bucket.key)) {
      byBucket.set(bucket.key, { money_in_cents: 0, money_out_cents: 0, by_category_out_cents: new Map() });
    }
    const totals = byBucket.get(bucket.key)!;
    if (cents >= 0) {
      totals.money_in_cents += cents;
    } else {
      const absCents = Math.abs(cents);
      totals.money_out_cents += absCents;
      const category = (row.category || labelFor(row) || "Other").trim() || "Other";
      totals.by_category_out_cents.set(category, (totals.by_category_out_cents.get(category) ?? 0) + absCents);
    }
  }
  return result;
}

function currenciesInvolved(items: ScheduledItem[], transactions: TransactionsTruthRow[]): string[] {
  const set = new Set<string>();
  for (const item of items) set.add(item.currency);
  for (const row of transactions) set.add(currencyFor(row));
  return [...set].sort();
}

function plannedBreakdown(occurrences: PlannedOccurrence[], bucketKey: string, currency: string): MoneyZoomBreakdownItem[] {
  return occurrences
    .filter((occ) => occ.bucket_key === bucketKey && occ.currency === currency)
    .sort((left, right) => right.amount_cents - left.amount_cents)
    .slice(0, 6)
    .map((occ) => ({ name: occ.name, kind: occ.kind, amount_cents: occ.amount_cents, currency }));
}

function actualBreakdown(totals: ActualBucketTotals | undefined, currency: string): MoneyZoomBreakdownItem[] {
  if (!totals) return [];
  const categories: MoneyZoomBreakdownItem[] = [...totals.by_category_out_cents.entries()]
    .map(([category, cents]) => ({ name: category, kind: "category" as const, amount_cents: cents, currency }))
    .sort((left, right) => right.amount_cents - left.amount_cents)
    .slice(0, 6);
  if (totals.money_in_cents > 0) {
    categories.unshift({ name: "Income", kind: "category", amount_cents: totals.money_in_cents, currency });
  }
  return categories;
}

export function deriveMoneyZoomTimeline(
  truth: HouseholdMoneyTruth,
  actualTransactions: TransactionsTruthRow[],
  granularity: TimelineGranularity,
  nowIso = truth.windows.now_iso || truth.as_of_iso
): MoneyZoomTimelineSummary {
  const span = DEFAULT_BUCKET_SPAN[granularity];
  const buckets = buildTimelineBuckets(granularity, nowIso, span.past, span.future);
  const todayBucket = buckets.find((bucket) => bucket.is_current) ?? buckets[buckets.length - 1];

  const items = scheduledItemsFromTruth(truth);
  const plannedOccurrences = projectScheduledOccurrencesIntoBuckets(items, buckets);
  const actualTotals = aggregateActualTransactionsIntoBuckets(
    actualTransactions,
    truth.transaction_pattern_confirmations,
    buckets
  );

  const currencies = currenciesInvolved(items, actualTransactions);
  const currencyRows: MoneyZoomCurrency[] = currencies.map((currency) => {
    const byBucket = actualTotals.get(currency) ?? new Map<string, ActualBucketTotals>();

    const points: MoneyZoomPoint[] = buckets.map((bucket) => {
      const isActual = bucket.is_past || bucket.is_current;
      let moneyInCents = 0;
      let moneyOutCents = 0;
      let breakdown: MoneyZoomBreakdownItem[] = [];

      if (isActual) {
        const totals = byBucket.get(bucket.key);
        moneyInCents = totals?.money_in_cents ?? 0;
        moneyOutCents = totals?.money_out_cents ?? 0;
        breakdown = actualBreakdown(totals, currency);
      } else {
        const bucketOccurrences = plannedOccurrences.filter(
          (occ) => occ.bucket_key === bucket.key && occ.currency === currency
        );
        moneyInCents = bucketOccurrences
          .filter((occ) => occ.kind === "income")
          .reduce((sum, occ) => sum + occ.amount_cents, 0);
        moneyOutCents = bucketOccurrences
          .filter((occ) => occ.kind === "bill")
          .reduce((sum, occ) => sum + occ.amount_cents, 0);
        breakdown = plannedBreakdown(plannedOccurrences, bucket.key, currency);
      }

      return {
        bucket_key: bucket.key,
        label: bucket.label,
        start_iso: bucket.start_iso,
        end_iso: bucket.end_iso,
        kind: isActual ? "actual" : "planned",
        is_today_marker: bucket.key === todayBucket.key,
        money_in_cents: moneyInCents,
        money_out_cents: moneyOutCents,
        difference_cents: moneyInCents - moneyOutCents,
        breakdown,
      };
    });

    const values = points.flatMap((point) => [point.money_in_cents, point.money_out_cents, point.difference_cents]);
    return {
      currency,
      scale_min_cents: Math.min(0, ...values),
      scale_max_cents: Math.max(0, ...values),
      points,
    };
  });

  return {
    version: 1,
    granularity,
    now_iso: nowIso,
    today_bucket_key: todayBucket.key,
    currencies: currencyRows,
    timing_needed_count: items.filter(
      (item) => !Number.isFinite(Date.parse(item.next_at || "")) || !SUPPORTED_CADENCES.has(item.cadence)
    ).length,
    mixed_currencies: currencies.length > 1,
  };
}
