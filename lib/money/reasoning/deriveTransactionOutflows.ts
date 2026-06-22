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
  label: string;
  occurrences: number;
  total_cents: number;
  average_cents: number;
  currency: string;
  uncertain_label: boolean;
};

export type TransactionOutflowSummary = {
  transaction_count: number;
  month_outflow_by_currency: MoneyRow[];
  largest_outflows: TransactionOutflowItem[];
  likely_regular_outflows: LikelyRegularOutflow[];
  source_note: string | null;
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
  return /^AU\d+$/.test(compact) || /^\d{5,}$/.test(compact) || label === "Unlabelled transaction";
}

function groupKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const totals = new Map<string, number>();

  for (const transaction of monthOutflows) {
    const currency = currencyFor(transaction);
    totals.set(currency, (totals.get(currency) ?? 0) + Math.abs(centsFor(transaction)));
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

  const grouped = new Map<
    string,
    { label: string; cents: number[]; currency: string; uncertain: boolean }
  >();
  for (const transaction of params.rollingTransactions) {
    const cents = centsFor(transaction);
    if (cents >= 0) continue;
    const label = labelFor(transaction);
    const keyPart = groupKey(label);
    if (!keyPart) continue;
    const key = `${currencyFor(transaction)}:${keyPart}`;
    const existing = grouped.get(key) ?? {
      label,
      cents: [],
      currency: currencyFor(transaction),
      uncertain: isUncertainLabel(label),
    };
    existing.cents.push(Math.abs(cents));
    grouped.set(key, existing);
  }

  const likelyRegularOutflows = Array.from(grouped.values())
    .filter((group) => group.cents.length >= 2)
    .map((group) => {
      const total = group.cents.reduce((sum, cents) => sum + cents, 0);
      return {
        label: group.label,
        occurrences: group.cents.length,
        total_cents: total,
        average_cents: Math.round(total / group.cents.length),
        currency: group.currency,
        uncertain_label: group.uncertain,
      };
    })
    .sort((left, right) => right.total_cents - left.total_cents)
    .slice(0, 5);

  return {
    transaction_count: monthOutflows.length,
    month_outflow_by_currency: Array.from(totals.entries())
      .map(([currency, cents]) => ({ currency, cents }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
    largest_outflows: largestOutflows,
    likely_regular_outflows: likelyRegularOutflows,
    source_note: hasFreshActiveBasiq(params.connections, nowMs)
      ? "A fresh Basiq connection is available. Older linked sources may need review."
      : null,
  };
}
