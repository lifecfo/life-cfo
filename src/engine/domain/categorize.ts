// src/engine/domain/categorize.ts
import type { Transaction } from "./types";
import { normalizeMerchant } from "./merchant";

export type CategoryRule = {
  category: string;
  // match against normalized merchant key (preferred)
  merchantIncludes?: string[];
  // or match against raw description text
  descriptionIncludes?: string[];
};

export function categorizeTransaction(
  tx: Transaction,
  rules: CategoryRule[]
): string | null {
  const merchantKey = normalizeMerchant(tx.merchant ?? tx.description);

  for (const rule of rules) {
    if (rule.merchantIncludes?.some((s) => merchantKey.includes(s.toLowerCase()))) {
      return rule.category;
    }

    const desc = (tx.description ?? "").toLowerCase();
    if (rule.descriptionIncludes?.some((s) => desc.includes(s.toLowerCase()))) {
      return rule.category;
    }
  }

  return null;
}
