import type {
  HouseholdMoneyTruth,
  MoneyDataCoverage,
  MoneyHomeSummary,
  MoneyPrimaryGoalSummary,
  MoneyGoalsTruthRow,
  RecurringBillsTruthRow,
  TransactionPatternConfirmationTruthRow,
  TransactionsTruthRow,
} from "./types";

type DeriveHomeMoneySummaryParams = {
  truth: HouseholdMoneyTruth;
  dataCoverage: MoneyDataCoverage;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function currency(value: string | null | undefined): string {
  return String(value || "AUD").trim().toUpperCase() || "AUD";
}

function primaryCurrency(params: DeriveHomeMoneySummaryParams): string {
  return (
    params.dataCoverage.current_month_money_in[0]?.currency ||
    params.dataCoverage.current_month_money_out[0]?.currency ||
    params.truth.accounts[0]?.currency ||
    "AUD"
  ).toUpperCase();
}

function cashForCurrency(truth: HouseholdMoneyTruth, selectedCurrency: string): number {
  return truth.accounts.reduce((sum, account) => {
    if (currency(account.currency) !== selectedCurrency) return sum;
    return sum + (account.available_balance_cents ?? account.current_balance_cents ?? 0);
  }, 0);
}

function cadenceDays(value: string | null): number | null {
  switch (String(value || "").trim().toLowerCase()) {
    case "weekly":
      return 7;
    case "fortnightly":
      return 14;
    case "monthly":
      return 30;
    case "quarterly":
      return 91;
    case "annual":
    case "yearly":
      return 365;
    default:
      return null;
  }
}

function occurrencesInNext30Days(nextDueAt: string | null, cadence: string | null, nowMs: number) {
  const dueMs = Date.parse(nextDueAt || "");
  const endMs = nowMs + 30 * DAY_MS;
  if (!Number.isFinite(dueMs) || dueMs > endMs) return 0;
  const intervalDays = cadenceDays(cadence);
  if (!intervalDays) return dueMs >= nowMs ? 1 : 0;
  const firstDueMs = dueMs >= nowMs ? dueMs : dueMs + Math.ceil((nowMs - dueMs) / (intervalDays * DAY_MS)) * intervalDays * DAY_MS;
  if (firstDueMs > endMs) return 0;
  return Math.floor((endMs - firstDueMs) / (intervalDays * DAY_MS)) + 1;
}

function scheduledBillTotal(
  bills: RecurringBillsTruthRow[],
  selectedCurrency: string,
  nowMs: number
) {
  return bills.reduce((sum, bill) => {
    if (currency(bill.currency) !== selectedCurrency || !bill.amount_cents) return sum;
    return sum + bill.amount_cents * occurrencesInNext30Days(bill.next_due_at, bill.cadence, nowMs);
  }, 0);
}

function confirmedPatternEstimate(
  confirmations: TransactionPatternConfirmationTruthRow[],
  selectedCurrency: string
) {
  return confirmations.reduce((sum, confirmation) => {
    if (
      confirmation.kind !== "bill" ||
      currency(confirmation.currency) !== selectedCurrency ||
      !confirmation.amount_cents
    ) {
      return sum;
    }
    const intervalDays = cadenceDays(confirmation.cadence);
    const occurrences = intervalDays ? 30 / intervalDays : 1;
    return sum + Math.round(confirmation.amount_cents * occurrences);
  }, 0);
}

function upcomingBills(
  bills: RecurringBillsTruthRow[],
  selectedCurrency: string,
  nowMs: number
) {
  const endMs = nowMs + 30 * DAY_MS;
  return bills
    .filter((bill) => currency(bill.currency) === selectedCurrency)
    .map((bill) => {
      const dueMs = Date.parse(bill.next_due_at || "");
      return { bill, dueMs };
    })
    .filter(({ dueMs }) => Number.isFinite(dueMs) && dueMs >= nowMs && dueMs <= endMs)
    .sort((left, right) => left.dueMs - right.dueMs)
    .slice(0, 4)
    .map(({ bill, dueMs }) => ({
      name: String(bill.name || "Regular payment").trim() || "Regular payment",
      amount_cents: bill.amount_cents ?? 0,
      currency: currency(bill.currency),
      next_due_at: bill.next_due_at,
      days_until_due: Math.max(0, Math.ceil((dueMs - nowMs) / DAY_MS)),
    }));
}

function transactionCents(transaction: TransactionsTruthRow): number {
  if (typeof transaction.amount_cents === "number") return transaction.amount_cents;
  if (typeof transaction.amount === "number") return Math.round(transaction.amount * 100);
  return 0;
}

function groceryEstimate(
  transactions: TransactionsTruthRow[],
  selectedCurrency: string,
  nowMs: number
): number | null {
  const startMs = nowMs - 30 * DAY_MS;
  const cents = transactions.reduce((sum, transaction) => {
    const dateMs = Date.parse(transaction.date || "");
    const category = String(transaction.category || "");
    const amount = transactionCents(transaction);
    if (
      !Number.isFinite(dateMs) ||
      dateMs < startMs ||
      dateMs > nowMs ||
      currency(transaction.currency) !== selectedCurrency ||
      transaction.pending === true ||
      amount >= 0 ||
      !/grocer|supermarket/i.test(category)
    ) {
      return sum;
    }
    return sum + Math.abs(amount);
  }, 0);
  return cents > 0 ? cents : null;
}

function primaryGoal(goals: MoneyGoalsTruthRow[], selectedCurrency: string): MoneyPrimaryGoalSummary | null {
  const eligible = goals.filter((goal) => {
    const status = String(goal.status || "active").trim().toLowerCase();
    return currency(goal.currency) === selectedCurrency && Boolean(goal.target_cents && goal.target_cents > 0) && status !== "archived" && status !== "completed";
  });
  const goal = eligible.find((item) => item.is_primary === true) ?? eligible[0];
  if (!goal?.target_cents) return null;
  const currentCents = Math.max(0, goal.current_cents ?? 0);
  return {
    title: String(goal.title || "Goal").trim() || "Goal",
    currency: selectedCurrency,
    current_cents: currentCents,
    target_cents: goal.target_cents,
    progress_percent: Math.max(0, Math.min(100, Math.round((currentCents / goal.target_cents) * 100))),
  };
}

export function deriveHomeMoneySummary(params: DeriveHomeMoneySummaryParams): MoneyHomeSummary {
  const selectedCurrency = primaryCurrency(params);
  const nowMs = Date.parse(params.truth.windows.now_iso || params.truth.as_of_iso) || Date.now();
  const scheduledTotal = scheduledBillTotal(params.truth.recurring_bills, selectedCurrency, nowMs);
  const patternTotal = confirmedPatternEstimate(params.truth.transaction_pattern_confirmations, selectedCurrency);
  const plannedExpensesCents = scheduledTotal > 0 ? scheduledTotal : patternTotal;
  const availableCashCents = cashForCurrency(params.truth, selectedCurrency);

  return {
    version: 1,
    currency: selectedCurrency,
    money_in_cents:
      params.dataCoverage.current_month_money_in.find((row) => row.currency === selectedCurrency)?.cents ?? 0,
    available_cash_cents: availableCashCents,
    planned_expenses_cents: plannedExpensesCents,
    planned_expenses_is_estimate: true,
    planned_expenses_basis:
      scheduledTotal > 0 ? "scheduled_bills" : patternTotal > 0 ? "confirmed_patterns" : "none",
    upcoming_bills: upcomingBills(params.truth.recurring_bills, selectedCurrency, nowMs),
    grocery_estimate_cents: groceryEstimate(params.truth.rolling_transactions, selectedCurrency, nowMs),
    primary_goal: primaryGoal(params.truth.goals, selectedCurrency),
    likely_breathing_room_cents: availableCashCents - plannedExpensesCents,
  };
}
