import type {
  TransactionPatternConfirmationTruthRow,
  TransactionsTruthRow,
} from "./types";

export function centsFor(transaction: TransactionsTruthRow): number {
  if (typeof transaction.amount_cents === "number") return transaction.amount_cents;
  if (typeof transaction.amount === "number") return Math.round(transaction.amount * 100);
  return 0;
}

export function currencyFor(transaction: TransactionsTruthRow): string {
  return String(transaction.currency || "AUD").trim().toUpperCase() || "AUD";
}

export function labelFor(transaction: TransactionsTruthRow): string {
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

export function outflowPatternKey(transaction: TransactionsTruthRow): string {
  return `outflow:${currencyFor(transaction)}:${groupKey(labelFor(transaction))}`;
}

function incomePatternKey(transaction: TransactionsTruthRow): string {
  const cents = centsFor(transaction);
  const key = groupKey(labelFor(transaction)) || `amount:${cents}`;
  return `income:${currencyFor(transaction)}:${key}`;
}

export function looksLikeTransfer(transaction: TransactionsTruthRow): boolean {
  const text = `${transaction.category || ""} ${transaction.merchant || ""} ${transaction.description || ""}`;
  return /\b(transfer|internal|between accounts|to savings|from savings)\b/i.test(text);
}

export function excludedPatternKeys(
  confirmations: TransactionPatternConfirmationTruthRow[]
): Set<string> {
  return new Set(
    confirmations
      .filter((confirmation) => confirmation.kind === "ignore" || confirmation.kind === "transfer")
      .map((confirmation) => confirmation.pattern_key)
  );
}

export function isIncludedMovement(
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
