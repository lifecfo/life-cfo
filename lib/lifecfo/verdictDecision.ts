// lib/lifecfo/verdictDecision.ts
// Deterministic verdict selection (OUTSIDE the model).
// Uses only safe deterministic signals: question intent + suggested_next + facts availability.

import type { Verdict } from "./verdict";

export type VerdictDecisionInput = {
  question: string;
  suggested_next?: "none" | "create_capture" | "open_thinking";
  action?: "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
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
  const q = (input.question || "").toLowerCase();
  const suggested = input.suggested_next ?? "none";

  // If we need more context to answer safely, we should not pretend we can conclude.
  if (suggested === "create_capture") return "INSUFFICIENT_DATA";

  const dq = input.facts?.data_quality;
  const accountsOk = dq?.accounts_ok !== false;
  const billsOk = dq?.recurring_bills_ok !== false;
  const accountsCount = typeof dq?.accounts_count_active === "number" ? dq.accounts_count_active : 0;
  const billsCount = typeof dq?.recurring_bills_count_active === "number" ? dq.recurring_bills_count_active : 0;

  if (!accountsOk || !billsOk) return "INSUFFICIENT_DATA";
  if (accountsCount === 0 && billsCount === 0) return "INSUFFICIENT_DATA";

  // For affordability / “should we” questions, we default conservative unless the app has richer timing.
  if (/(can we afford|can i afford|should we|safe to spend|is it safe to spend|can i spend|can we spend)\b/.test(q)) {
    return "INSUFFICIENT_DATA";
  }

  // Very light deterministic “attention” signal (negative balances)
  const raw = input.facts?.money_summary_raw;
  const balances = Array.isArray(raw?.balances_by_currency_cents) ? raw!.balances_by_currency_cents! : [];

  for (const b of balances) {
    const cents = typeof b?.cents === "number" && Number.isFinite(b.cents) ? b.cents : 0;
    if (cents < 0) return "NEEDS_ATTENTION";
  }

  // Otherwise we can’t safely assert YES/NO without contextual decision framing.
  return "INSUFFICIENT_DATA";
}
