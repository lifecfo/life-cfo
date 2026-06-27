import type { ExternalConnectionsTruthRow, TransactionsTruthRow } from "./types";

type MoneyRow = { currency: string; cents: number };

export type TransactionOutflowItem = {
  label: string;
  cents: number;
  currency: string;
  date: string | null;
  uncertain_label: boolean;
};

export type LikelyRegularOutflow = {
  pattern_key: string;
  label: string;
  occurrences: number;
  total_cents: number;
  average_cents: number;
  currency: string;
  uncertain_label: boolean;
  cadence: "weekly" | "fortnightly" | "monthly" | "repeated";
  confidence: "likely" | "low";
  source_provider: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

export type LikelyIncome = {
  pattern_key: string;
  label: string;
  occurrences: number;
  total_cents: number;
  average_cents: number;
  currency: string;
  cadence: "weekly" | "fortnightly" | "monthly" | "repeated";
  uncertain_label: boolean;
  confidence: "likely" | "low";
  source_provider: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

export type TransactionOutflowSummary = {
  transaction_count: number;
  inflow_transaction_count: number;
  month_outflow_by_currency: MoneyRow[];
  month_inflow_by_currency: MoneyRow[];
  largest_outflows: TransactionOutflowItem[];
  largest_inflows: TransactionOutflowItem[];
  likely_regular_outflows: LikelyRegularOutflow[];
  likely_income: LikelyIncome[];
  has_unlabelled_repeated_outflows: boolean;
  has_unlabelled_repeated_income: boolean;
  source_note: string | null;
  confirmation_note: string | null;
};

function centsFor(transaction: TransactionsTruthRow): number {
  if (typeof transaction.amount_cents === "number") return transaction.amount_cents;
  if (typeof transaction.amount === "number") return Math.round(transaction.amount * 100);
  return 0;
}

function currencyFor(transaction: TransactionsTruthRow): string {
  return String(transaction.currency || "AUD").trim().toUpperCase() || "AUD";
}

function labelFor(transaction: TransactionsTruthRow): string {
  return String(transaction.merchant || transaction.description || "Unlabelled transaction").trim() || "Unlabelled transaction";
}

function isUncertainLabel(label: string): boolean {
  const compact = label.replace(/\s+/g, "").toUpperCase();
  return (
    /^AU\d+$/.test(compact) ||
    /^[A-Z]{1,3}\d{4,}$/.test(compact) ||
    /^\d{5,}$/.test(compact) ||
    label === "Unlabelled transaction"
  );
}

function groupKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceProviderFor(providers: string[]): string | null {
  const unique = Array.from(
    new Set(providers.map((provider) => provider.trim().toLowerCase()).filter(Boolean))
  ).sort();
  return unique.length ? unique.join(",") : null;
}

function observedRange(dates: string[]): { first: string | null; last: string | null } {
  const values = dates
    .map((date) => Date.parse(date))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!values.length) return { first: null, last: null };
  return {
    first: new Date(values[0]).toISOString(),
    last: new Date(values[values.length - 1]).toISOString(),
  };
}

function cadenceFor(dates: string[]): "weekly" | "fortnightly" | "monthly" | "repeated" {
  const values = dates
    .map((date) => Date.parse(date))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (values.length < 2) return "repeated";

  const gaps: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    gaps.push(Math.round((values[index] - values[index - 1]) / (24 * 60 * 60 * 1000)));
  }
  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (averageGap >= 5 && averageGap <= 9) return "weekly";
  if (averageGap >= 11 && averageGap <= 18) return "fortnightly";
  if (averageGap >= 25 && averageGap <= 35) return "monthly";
  return "repeated";
}

function isWagesLike(label: string): boolean {
  return /\b(payroll|salary|wages?|payg|employer)\b/i.test(label);
}

function hasFreshActiveBasiq(connections: ExternalConnectionsTruthRow[], nowMs: number): boolean {
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  return connections.some((connection) => {
    if (String(connection.provider || "").trim().toLowerCase() !== "basiq") return false;
    if (String(connection.status || "").trim().toLowerCase() !== "active") return false;
    const updatedMs = Date.parse(connection.last_sync_at || connection.updated_at || "");
    return Number.isFinite(updatedMs) && nowMs - updatedMs <= maxAgeMs;
  });
}

export function deriveTransactionOutflowSummary(params: {
  monthTransactions: TransactionsTruthRow[];
  rollingTransactions: TransactionsTruthRow[];
  connections: ExternalConnectionsTruthRow[];
  nowIso?: string;
}): TransactionOutflowSummary {
  const nowMs = Date.parse(params.nowIso || "") || Date.now();
  const monthOutflows = params.monthTransactions.filter((transaction) => centsFor(transaction) < 0);
  const monthInflows = params.monthTransactions.filter((transaction) => centsFor(transaction) > 0);
  const totals = new Map<string, number>();
  const inflowTotals = new Map<string, number>();

  for (const transaction of monthOutflows) {
    const currency = currencyFor(transaction);
    totals.set(currency, (totals.get(currency) ?? 0) + Math.abs(centsFor(transaction)));
  }

  for (const transaction of monthInflows) {
    const currency = currencyFor(transaction);
    inflowTotals.set(currency, (inflowTotals.get(currency) ?? 0) + centsFor(transaction));
  }

  const largestOutflows = monthOutflows
    .map((transaction) => ({
      label: labelFor(transaction),
      cents: Math.abs(centsFor(transaction)),
      currency: currencyFor(transaction),
      date: transaction.date,
      uncertain_label: isUncertainLabel(labelFor(transaction)),
    }))
    .sort((left, right) => right.cents - left.cents)
    .slice(0, 5);

  const largestInflows = monthInflows
    .map((transaction) => ({
      label: labelFor(transaction),
      cents: centsFor(transaction),
      currency: currencyFor(transaction),
      date: transaction.date,
      uncertain_label: isUncertainLabel(labelFor(transaction)),
    }))
    .sort((left, right) => right.cents - left.cents)
    .slice(0, 5);

  const grouped = new Map<
    string,
    {
      patternKey: string;
      label: string;
      cents: number[];
      currency: string;
      uncertain: boolean;
      dates: string[];
      providers: string[];
    }
  >();
  for (const transaction of params.rollingTransactions) {
    const cents = centsFor(transaction);
    if (cents >= 0) continue;
    const label = labelFor(transaction);
    const keyPart = groupKey(label);
    if (!keyPart) continue;
    const key = `${currencyFor(transaction)}:${keyPart}`;
    const existing = grouped.get(key) ?? {
      patternKey: `outflow:${key}`,
      label,
      cents: [],
      currency: currencyFor(transaction),
      uncertain: isUncertainLabel(label),
      dates: [],
      providers: [],
    };
    existing.cents.push(Math.abs(cents));
    if (transaction.date) existing.dates.push(transaction.date);
    if (transaction.provider) existing.providers.push(transaction.provider);
    grouped.set(key, existing);
  }

  const likelyRegularOutflows = Array.from(grouped.values())
    .filter((group) => group.cents.length >= 2)
    .map((group): LikelyRegularOutflow => {
      const total = group.cents.reduce((sum, cents) => sum + cents, 0);
      const cadence = cadenceFor(group.dates);
      const observed = observedRange(group.dates);
      return {
        pattern_key: group.patternKey,
        label: group.label,
        occurrences: group.cents.length,
        total_cents: total,
        average_cents: Math.round(total / group.cents.length),
        currency: group.currency,
        uncertain_label: group.uncertain,
        cadence,
        confidence: group.uncertain || cadence === "repeated" ? "low" : "likely",
        source_provider: sourceProviderFor(group.providers),
        first_seen_at: observed.first,
        last_seen_at: observed.last,
      };
    })
    .sort((left, right) => right.total_cents - left.total_cents)
    .slice(0, 5);

  const incomeGroups = new Map<
    string,
    {
      patternKey: string;
      label: string;
      cents: number[];
      currency: string;
      uncertain: boolean;
      dates: string[];
      providers: string[];
    }
  >();
  for (const transaction of params.rollingTransactions) {
    const cents = centsFor(transaction);
    if (cents <= 0) continue;
    const label = labelFor(transaction);
    const keyPart = groupKey(label) || `amount:${cents}`;
    const key = `${currencyFor(transaction)}:${keyPart}`;
    const existing = incomeGroups.get(key) ?? {
      patternKey: `income:${key}`,
      label,
      cents: [],
      currency: currencyFor(transaction),
      uncertain: isUncertainLabel(label),
      dates: [],
      providers: [],
    };
    existing.cents.push(cents);
    if (transaction.date) existing.dates.push(transaction.date);
    if (transaction.provider) existing.providers.push(transaction.provider);
    incomeGroups.set(key, existing);
  }

  const likelyIncome = Array.from(incomeGroups.values())
    .filter((group) => group.cents.length >= 2)
    .map((group): LikelyIncome | null => {
      const total = group.cents.reduce((sum, cents) => sum + cents, 0);
      const cadence = cadenceFor(group.dates);
      const wagesLike = isWagesLike(group.label);
      if (cadence === "repeated" && group.cents.length < 3 && !wagesLike) return null;
      const observed = observedRange(group.dates);
      return {
        pattern_key: group.patternKey,
        label: group.label,
        occurrences: group.cents.length,
        total_cents: total,
        average_cents: Math.round(total / group.cents.length),
        currency: group.currency,
        cadence,
        uncertain_label: group.uncertain,
        confidence: group.uncertain || cadence === "repeated" ? "low" : "likely",
        source_provider: sourceProviderFor(group.providers),
        first_seen_at: observed.first,
        last_seen_at: observed.last,
      };
    })
    .filter((pattern): pattern is LikelyIncome => pattern !== null)
    .filter((pattern) => {
      const observedThisMonth = inflowTotals.get(pattern.currency) ?? 0;
      return (
        pattern.cadence !== "repeated" &&
        observedThisMonth > 0 &&
        observedThisMonth >= Math.round(pattern.average_cents * 0.6)
      );
    })
    .sort((left, right) => right.total_cents - left.total_cents)
    .slice(0, 5);

  return {
    transaction_count: monthOutflows.length,
    inflow_transaction_count: monthInflows.length,
    month_outflow_by_currency: Array.from(totals.entries())
      .map(([currency, cents]) => ({ currency, cents }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    month_inflow_by_currency: Array.from(inflowTotals.entries())
      .map(([currency, cents]) => ({ currency, cents }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    largest_outflows: largestOutflows,
    largest_inflows: largestInflows,
    likely_regular_outflows: likelyRegularOutflows,
    likely_income: likelyIncome,
    has_unlabelled_repeated_outflows: likelyRegularOutflows.some(
      (pattern) => pattern.uncertain_label
    ),
    has_unlabelled_repeated_income: likelyIncome.some((pattern) => pattern.uncertain_label),
    source_note: hasFreshActiveBasiq(params.connections, nowMs)
      ? "A fresh Basiq connection is available. Older linked sources may need review."
      : null,
    confirmation_note:
      likelyRegularOutflows.length || likelyIncome.length
        ? "Likely patterns are based on observed transactions, not confirmed bills or income records."
        : null,
  };
}
