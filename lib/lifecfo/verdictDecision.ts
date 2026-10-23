// lib/lifecfo/verdictDecision.ts
// Deterministic verdict selection (OUTSIDE the model).
// Uses only safe deterministic signals: question intent + suggested_next + facts availability.

import type { Verdict } from "./verdict";

export type VerdictDecisionInput = {
  question: string;
  suggested_next?: "none";
  action?: "open_money" | "open_decisions" | "open_chapters" | "none";
  facts?: {
    data_quality?: {
      accounts_ok?: boolean;
      recurring_bills_ok?: boolean;
      accounts_count_active?: number;
      recurring_bills_count_active?: number;
    };
    money_summary_raw?: {
      balances_by_currency_cents?: Array<{ currency: string; cents: number }>;
      recurring_bills_totals_by_currency_cents?: Array<{ currency: string; cents: number }>;
    };
  };
};

export function decideVerdict(input: VerdictDecisionInput): Verdict {
  void input;
  return "INSUFFICIENT_DATA";
}
