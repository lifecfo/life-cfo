// lib/lifecfo/homeTone.ts
// Home check-in tone ONLY.
// This is a lightweight posture signal for Home Ask,
// NOT a decision verdict (see verdict.ts for that).

export type HomeTone = "ok" | "tight" | "attention";

type MoneySummaryRaw = {
  balances_by_currency_cents?: Array<{ currency: string; cents: number }>;
  recurring_bills_totals_by_currency_cents?: Array<{ currency: string; cents: number }>;
};

export function decideHomeTone(input: {
  question: string;
  // deterministic routing signal from Home Ask
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
  const q = (input.question || "").toLowerCase();

  const dq = input.facts?.data_quality;
  const accountsOk = dq?.accounts_ok !== false;
  const billsOk = dq?.recurring_bills_ok !== false;
  const accountsCount = typeof dq?.accounts_count_active === "number" ? dq.accounts_count_active : 0;
  const billsCount = typeof dq?.recurring_bills_count_active === "number" ? dq.recurring_bills_count_active : 0;

  // 2) If key sources are missing or empty, default to "tight"
  // (calmly: not enough confidence).
  if (!accountsOk || !billsOk) return "tight";
  if (accountsCount === 0 && billsCount === 0) return "tight";

  const raw = input.facts?.money_summary_raw;
  const balances = Array.isArray(raw?.balances_by_currency_cents) ? raw.balances_by_currency_cents : [];
  const recurring = Array.isArray(raw?.recurring_bills_totals_by_currency_cents)
    ? raw.recurring_bills_totals_by_currency_cents
    : [];

  // 3) Attention signals (deterministic financial reality):
  // - any negative total balance in a currency
  // - balances clearly below recurring commitments (same currency)
  const balMap = new Map<string, number>();
  for (const b of balances) {
    const cur = String(b.currency || "").toUpperCase();
    const cents = typeof b.cents === "number" && Number.isFinite(b.cents) ? b.cents : 0;
    balMap.set(cur, (balMap.get(cur) ?? 0) + cents);
  }

  for (const [, cents] of balMap.entries()) {
    if (cents < 0) return "attention";
  }

  const recMap = new Map<string, number>();
  for (const r of recurring) {
    const cur = String(r.currency || "").toUpperCase();
    const cents = typeof r.cents === "number" && Number.isFinite(r.cents) ? r.cents : 0;
    recMap.set(cur, (recMap.get(cur) ?? 0) + cents);
  }

  // If recurring > balance in any shared currency → attention
  // (language stays calm in UI).
  for (const [cur, recCents] of recMap.entries()) {
    const balCents = balMap.get(cur);
    if (
      typeof balCents === "number" &&
      Number.isFinite(balCents) &&
      recCents > 0 &&
      balCents < recCents
    ) {
      return "attention";
    }
  }

  // 4) Certain question types default to "tight" unless
  // richer timing/context is available.
  if (
    /(can we afford|can i afford|should we|safe to spend|is it safe to spend|can i spend|can we spend)\b/.test(
      q
    )
  ) {
    return "tight";
  }

  // 5) Default: calm, stable
  return "ok";
}

export function homeToneLabel(t: HomeTone): string {
  if (t === "attention") return "Needs attention";
  if (t === "tight") return "Keep an eye";
  return "All clear";
}
