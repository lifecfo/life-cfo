// lib/lifecfo/homeTone.ts
// Home answers stay factual. Tone is not used to say a household is tight or clear.

export type HomeTone = "ok" | "tight" | "attention";

type MoneySummaryRaw = {
  balances_by_currency_cents?: Array<{ currency: string; cents: number }>;
  recurring_bills_totals_by_currency_cents?: Array<{ currency: string; cents: number }>;
};

export function decideHomeTone(_input: {
  question: string;
  suggested_next?: "none";
  action?: "open_money" | "open_decisions" | "open_chapters" | "none";
  facts?: {
    data_quality?: {
      accounts_count_active?: number;
      recurring_bills_count_active?: number;
      accounts_ok?: boolean;
      recurring_bills_ok?: boolean;
    };
    money_summary_raw?: MoneySummaryRaw;
  };
}): HomeTone {
  return "ok";
}

export function homeToneLabel(_tone: HomeTone): string {
  return "Life CFO";
}
