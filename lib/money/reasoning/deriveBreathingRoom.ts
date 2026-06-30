import { formatMoneyFromCents } from "../formatMoney";
import type {
  BreathingRoomSummary,
  HouseholdMoneyTruth,
  MoneyDataCoverage,
  TransactionsTruthRow,
} from "./types";

type DeriveBreathingRoomParams = {
  truth: HouseholdMoneyTruth;
  dataCoverage: MoneyDataCoverage;
};

type WindowTotals = {
  moneyIn: number;
  moneyOut: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function centsFor(transaction: TransactionsTruthRow): number {
  if (typeof transaction.amount_cents === "number") return transaction.amount_cents;
  if (typeof transaction.amount === "number") return Math.round(transaction.amount * 100);
  return 0;
}

function currencyFor(transaction: TransactionsTruthRow): string {
  return String(transaction.currency || "AUD").trim().toUpperCase() || "AUD";
}

function labelFor(transaction: TransactionsTruthRow): string {
  return String(transaction.merchant || transaction.description || "Payment").trim() || "Payment";
}

function groupKey(label: string): string {
  return label
    .toUpperCase()
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function outflowPatternKey(transaction: TransactionsTruthRow): string {
  return `outflow:${currencyFor(transaction)}:${groupKey(labelFor(transaction))}`;
}

function incomePatternKey(transaction: TransactionsTruthRow): string {
  const cents = centsFor(transaction);
  const key = groupKey(labelFor(transaction)) || `amount:${cents}`;
  return `income:${currencyFor(transaction)}:${key}`;
}

function looksLikeTransfer(transaction: TransactionsTruthRow): boolean {
  const text = `${transaction.category || ""} ${transaction.merchant || ""} ${transaction.description || ""}`;
  return /\b(transfer|internal|between accounts|to savings|from savings)\b/i.test(text);
}

function excludedPatternKeys(truth: HouseholdMoneyTruth): Set<string> {
  return new Set(
    truth.transaction_pattern_confirmations
      .filter((confirmation) => confirmation.kind === "ignore" || confirmation.kind === "transfer")
      .map((confirmation) => confirmation.pattern_key)
  );
}

function isIncludedMovement(
  transaction: TransactionsTruthRow,
  ignoredPatternKeys: Set<string>
): boolean {
  if (transaction.pending === true || looksLikeTransfer(transaction)) return false;
  const cents = centsFor(transaction);
  const patternKey = cents < 0 ? outflowPatternKey(transaction) : incomePatternKey(transaction);
  if (ignoredPatternKeys.has(patternKey)) {
    return false;
  }
  return true;
}

function primaryCurrency(params: DeriveBreathingRoomParams): string {
  const totals = new Map<string, number>();
  for (const row of [
    ...params.dataCoverage.current_month_money_in,
    ...params.dataCoverage.current_month_money_out,
  ]) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + Math.abs(row.cents));
  }
  if (totals.size > 0) {
    return [...totals.entries()].sort((left, right) => right[1] - left[1])[0][0];
  }

  const accountTotals = new Map<string, number>();
  for (const account of params.truth.accounts) {
    const currency = String(account.currency || "AUD").trim().toUpperCase() || "AUD";
    const balance = account.available_balance_cents ?? account.current_balance_cents ?? 0;
    accountTotals.set(currency, (accountTotals.get(currency) ?? 0) + Math.abs(balance));
  }
  return accountTotals.size > 0
    ? [...accountTotals.entries()].sort((left, right) => right[1] - left[1])[0][0]
    : "AUD";
}

function cashForCurrency(truth: HouseholdMoneyTruth, currency: string): number {
  return truth.accounts.reduce((sum, account) => {
    const accountCurrency = String(account.currency || "AUD").trim().toUpperCase() || "AUD";
    if (accountCurrency !== currency) return sum;
    return sum + (account.available_balance_cents ?? account.current_balance_cents ?? 0);
  }, 0);
}

function windowTotals(
  transactions: TransactionsTruthRow[],
  currency: string,
  startMs: number,
  endMs: number,
  ignoredPatternKeys: Set<string>
): WindowTotals {
  return transactions.reduce<WindowTotals>(
    (totals, transaction) => {
      const dateMs = Date.parse(transaction.date || "");
      if (!Number.isFinite(dateMs) || dateMs < startMs || dateMs > endMs) return totals;
      if (currencyFor(transaction) !== currency) return totals;
      if (!isIncludedMovement(transaction, ignoredPatternKeys)) return totals;

      const cents = centsFor(transaction);
      if (cents > 0) totals.moneyIn += cents;
      if (cents < 0) totals.moneyOut += Math.abs(cents);
      return totals;
    },
    { moneyIn: 0, moneyOut: 0 }
  );
}

function monthTotals(
  truth: HouseholdMoneyTruth,
  currency: string,
  ignoredPatternKeys: Set<string>
): WindowTotals {
  return truth.month_transactions.reduce<WindowTotals>(
    (totals, transaction) => {
      if (currencyFor(transaction) !== currency) return totals;
      if (!isIncludedMovement(transaction, ignoredPatternKeys)) return totals;
      const cents = centsFor(transaction);
      if (cents > 0) totals.moneyIn += cents;
      if (cents < 0) totals.moneyOut += Math.abs(cents);
      return totals;
    },
    { moneyIn: 0, moneyOut: 0 }
  );
}

function biggestPayment(
  truth: HouseholdMoneyTruth,
  currency: string,
  ignoredPatternKeys: Set<string>
): { label: string; cents: number } | null {
  const reviewedLabels = new Map(
    truth.transaction_pattern_confirmations
      .filter((confirmation) => confirmation.label?.trim())
      .map((confirmation) => [confirmation.pattern_key, confirmation.label?.trim() as string])
  );
  const payments = truth.month_transactions
    .filter((transaction) => currencyFor(transaction) === currency)
    .filter((transaction) => centsFor(transaction) < 0)
    .filter((transaction) => isIncludedMovement(transaction, ignoredPatternKeys))
    .map((transaction) => ({
      label: reviewedLabels.get(outflowPatternKey(transaction)) || labelFor(transaction),
      cents: Math.abs(centsFor(transaction)),
    }))
    .sort((left, right) => right.cents - left.cents);
  return payments[0] ?? null;
}

function materialDrop(recent: number, prior: number, minimumCents: number): boolean {
  return prior > 0 && prior - recent >= minimumCents && recent / prior <= 0.9;
}

function materialRise(recent: number, prior: number, minimumCents: number): boolean {
  return prior > 0 && recent - prior >= minimumCents && recent / prior >= 1.1;
}

function money(cents: number, currency: string): string {
  return formatMoneyFromCents(cents, currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function deriveBreathingRoom(
  params: DeriveBreathingRoomParams
): BreathingRoomSummary {
  const { truth, dataCoverage } = params;
  const hasCurrentData = dataCoverage.account_count > 0 || dataCoverage.transaction_count > 0;
  if (!hasCurrentData) {
    return {
      version: 1,
      status: "closer_look",
      label: "Needs a closer look.",
      reasons: [
        dataCoverage.has_reference_only_sources
          ? "A money source may need refreshing."
          : "Add accounts or transactions when you’re ready.",
      ],
      ask_prompt: "What would help Life CFO understand our money better?",
    };
  }

  const currency = primaryCurrency(params);
  const ignoredPatternKeys = excludedPatternKeys(truth);
  const nowMs = Date.parse(truth.windows.now_iso || truth.as_of_iso) || Date.now();
  const recent = windowTotals(
    truth.rolling_transactions,
    currency,
    nowMs - 30 * DAY_MS,
    nowMs,
    ignoredPatternKeys
  );
  const prior = windowTotals(
    truth.rolling_transactions,
    currency,
    nowMs - 60 * DAY_MS,
    nowMs - 30 * DAY_MS - 1,
    ignoredPatternKeys
  );
  const month = monthTotals(truth, currency, ignoredPatternKeys);
  const cash = cashForCurrency(truth, currency);
  const largest = biggestPayment(truth, currency, ignoredPatternKeys);

  const incomeLower = materialDrop(recent.moneyIn, prior.moneyIn, 30000);
  const spendingLower = materialDrop(recent.moneyOut, prior.moneyOut, 20000);
  const spendingHigher = materialRise(recent.moneyOut, prior.moneyOut, 20000);
  const monthBehind = month.moneyOut > month.moneyIn;
  const cashBelowOneMonth = recent.moneyOut > 0 && cash < recent.moneyOut;
  const cashBelowTwoMonths = recent.moneyOut > 0 && cash < recent.moneyOut * 2;

  const status: BreathingRoomSummary["status"] =
    cash <= 0 || (monthBehind && cashBelowOneMonth)
      ? "tight"
      : (incomeLower && !spendingLower) || spendingHigher || monthBehind || cashBelowTwoMonths
        ? "watch"
        : "okay";
  const label =
    status === "tight"
      ? "This month looks tight."
      : status === "watch"
        ? "Worth watching."
        : "Looks okay right now.";

  const reasons: string[] = [];
  if (incomeLower && spendingLower) {
    reasons.push("Money in is lower than the previous 30 days, but spending is also down.");
  } else {
    if (incomeLower) reasons.push("Money in is lower than the previous 30 days.");
    if (spendingHigher) reasons.push("Spending is higher than the previous 30 days.");
    if (spendingLower) reasons.push("Spending is lower than the previous 30 days.");
  }
  if (cash <= 0) {
    reasons.push("The visible cash balance is below zero.");
  } else if (cashBelowOneMonth) {
    reasons.push(`Cash buffer: ${money(cash, currency)}.`);
  } else if (cashBelowTwoMonths && reasons.length < 2) {
    reasons.push(`Cash buffer: ${money(cash, currency)}.`);
  } else if (monthBehind && reasons.length < 2) {
    reasons.push("More has gone out than come in this month.");
  }
  if (largest && reasons.length < 3) {
    reasons.push(`Biggest payment: ${largest.label}, ${money(largest.cents, currency)}.`);
  }
  if (reasons.length === 0) {
    reasons.push(
      month.moneyIn >= month.moneyOut
        ? "Money in is ahead of money out this month."
        : `Cash buffer: ${money(cash, currency)}.`
    );
  }

  return {
    version: 1,
    status,
    label,
    reasons: reasons.slice(0, 3),
    ask_prompt: "Why does this month feel tighter?",
  };
}
