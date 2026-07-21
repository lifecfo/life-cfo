import { deriveMoneyBuckets } from "./deriveMoneyBuckets";
import { isDemoMoneySource } from "./effectiveMoneySources";
import type {
  AccountsTruthRow,
  ExternalConnectionsTruthRow,
  HouseholdMoneyTruth,
  MoneyDataCoverage,
  MoneyHomeSummary,
  MoneyMapAccountGroup,
  MoneyMapAccountItem,
  MoneyMapPlannedItem,
  MoneyMapReviewItem,
  MoneyMapSummary,
  MoneyYearSummary,
} from "./types";

type DeriveMoneyMapParams = {
  truth: HouseholdMoneyTruth;
  dataCoverage: MoneyDataCoverage;
  homeSummary: MoneyHomeSummary;
  yearSummary: MoneyYearSummary;
  pendingReviewCount: number;
};

function currency(value: string | null | undefined): string {
  return String(value || "AUD").trim().toUpperCase() || "AUD";
}

// Exported: this is the single canonical account classifier. deriveCashPlan.ts
// used to duplicate this logic in its own classifyAccount() (confirmed via
// real account data that the two disagreed on ~10% of real rows); that
// duplicate has been removed and its call sites now import this directly.
export function accountGroup(account: AccountsTruthRow): MoneyMapAccountGroup["key"] {
  const type = String(account.type || "").trim().toLowerCase();
  if (/credit|loan|mortgage|liabilit/.test(type)) return "credit_debt";
  if (/cash|checking|cheque|savings|deposit|depository/.test(type)) return "cash";
  return "other";
}

function sourceLabel(
  account: AccountsTruthRow,
  connections: Map<string, ExternalConnectionsTruthRow>
): MoneyMapAccountItem["source_label"] {
  const connection = account.connection_id
    ? connections.get(account.connection_id)
    : undefined;
  if (connection && isDemoMoneySource(connection)) return "Demo data";
  if (
    connection?.metadata?.manual_csv === true &&
    connection.metadata?.source_type === "csv_upload"
  ) {
    return "Imported";
  }
  const provider = String(account.provider || "").trim().toLowerCase();
  if (!connection && (!provider || provider === "unknown" || provider === "manual")) {
    return "Manual";
  }
  if (provider === "manual") {
    return "Manual";
  }
  return "Connected";
}

function totalRows(accounts: MoneyMapAccountItem[]) {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    totals.set(
      account.currency,
      (totals.get(account.currency) ?? 0) + account.balance_cents
    );
  }
  return [...totals.entries()]
    .map(([rowCurrency, cents]) => ({ currency: rowCurrency, cents }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function accountGroups(truth: HouseholdMoneyTruth): MoneyMapAccountGroup[] {
  const connections = new Map(
    truth.external_connections.map((connection) => [connection.id, connection])
  );
  const definitions: Array<{
    key: MoneyMapAccountGroup["key"];
    label: string;
  }> = [
    { key: "cash", label: "Cash accounts" },
    { key: "credit_debt", label: "Credit or debt accounts" },
    { key: "other", label: "Other accounts" },
  ];

  return definitions.map(({ key, label }) => {
    const accounts = truth.accounts
      .filter((account) => accountGroup(account) === key)
      .map((account) => ({
        name: String(account.name || "Account").trim() || "Account",
        balance_cents: account.current_balance_cents ?? 0,
        currency: currency(account.currency),
        account_type: String(account.type || "Other").trim() || "Other",
        source_label: sourceLabel(account, connections),
      }));
    return { key, label, accounts, totals_by_currency: totalRows(accounts) };
  });
}

function scheduledItems(truth: HouseholdMoneyTruth): MoneyMapPlannedItem[] {
  const income = truth.recurring_income.map((item) => ({
    name: String(item.name || "Regular income").trim() || "Regular income",
    amount_cents: Math.max(0, item.amount_cents ?? 0),
    currency: currency(item.currency),
    cadence: String(item.cadence || "").trim() || "Timing not set",
    next_at: item.next_pay_at,
    kind: "income" as const,
    source: "schedule" as const,
  }));
  const bills = truth.recurring_bills.map((item) => ({
    name: String(item.name || "Regular payment").trim() || "Regular payment",
    amount_cents: Math.max(0, item.amount_cents ?? 0),
    currency: currency(item.currency),
    cadence: String(item.cadence || "").trim() || "Timing not set",
    next_at: item.next_due_at,
    kind: "bill" as const,
    source: "schedule" as const,
  }));
  return [...income, ...bills].filter((item) => item.amount_cents > 0);
}

function confirmedPatterns(truth: HouseholdMoneyTruth): MoneyMapPlannedItem[] {
  return truth.transaction_pattern_confirmations
    .filter((item) => item.kind === "income" || item.kind === "bill")
    .filter((item) => typeof item.amount_cents === "number" && item.amount_cents > 0)
    .map((item) => ({
      name: String(item.label || "Confirmed pattern").trim() || "Confirmed pattern",
      amount_cents: item.amount_cents as number,
      currency: currency(item.currency),
      cadence: String(item.cadence || "").trim() || "Timing not set",
      next_at: null,
      kind: item.kind as "income" | "bill",
      source: "confirmed_pattern" as const,
    }));
}

function reviewItems(params: DeriveMoneyMapParams, groups: MoneyMapAccountGroup[]) {
  const items: MoneyMapReviewItem[] = params.yearSummary.timing_needed.map(
    (item, index) => ({
      key: `timing:${item.kind}:${index}`,
      label: "Needs timing",
      title: item.name,
      detail: `${item.kind === "income" ? "Regular income" : "Regular payment"} needs a valid next date.`,
      href: item.kind === "income" ? "/income" : "/bills",
    })
  );

  const buckets = deriveMoneyBuckets(params.truth.goals).buckets;
  if (buckets.length) {
    items.push({
      key: "tracked-goals",
      label: "Not linked yet",
      title: `${buckets.length} savings goal${buckets.length === 1 ? " is" : "s are"} tracked separately`,
      detail: "Goal amounts are not linked to account balances.",
      href: "/money/saved",
    });
  }

  if (params.pendingReviewCount > 0) {
    items.push({
      key: "pending-patterns",
      label: "For review",
      title: `${params.pendingReviewCount} money pattern${params.pendingReviewCount === 1 ? "" : "s"} to review`,
      detail: "Reviewing a pattern can make future summaries clearer.",
      href: "/money",
    });
  }

  if (params.dataCoverage.has_reference_only_sources) {
    items.push({
      key: "reference-sources",
      label: "Worth keeping visible",
      title: "Older sources are kept for reference",
      detail: "They are not leading the current money view.",
      href: "/connections",
    });
  }

  const cashGroup = groups.find((group) => group.key === "cash");
  const visibleCash =
    cashGroup?.totals_by_currency.find(
      (row) => row.currency === params.homeSummary.currency
    )?.cents ?? 0;
  if (
    params.homeSummary.planned_expenses_basis === "scheduled_bills" &&
    params.homeSummary.planned_expenses_cents > Math.max(0, visibleCash)
  ) {
    items.push({
      key: "planned-above-cash",
      label: "Worth keeping visible",
      title: "Expected bills are higher than visible cash-account balances",
      detail: `This comparison uses ${params.homeSummary.currency} schedules and cash accounts only.`,
      href: "/money/planned",
    });
  }

  return items.slice(0, 8);
}

export function deriveMoneyMap(params: DeriveMoneyMapParams): MoneyMapSummary {
  const groups = accountGroups(params.truth);
  const buckets = deriveMoneyBuckets(params.truth.goals).buckets;
  const next30End = Date.parse(params.truth.windows.next30_iso);
  const largerPayments = params.yearSummary.larger_scheduled_payments
    .filter((item) => {
      const expectedMs = Date.parse(item.expected_at);
      return !Number.isFinite(next30End) || expectedMs > next30End;
    })
    .slice(0, 3)
    .map((item) => ({
      name: item.name,
      amount_cents: item.amount_cents,
      currency: item.currency,
      expected_at: item.expected_at,
      kind: "larger_payment" as const,
      detail: "Expected from current schedules.",
    }));
  const upcomingBills = params.homeSummary.upcoming_bills.map((item) => ({
    name: item.name,
    amount_cents: item.amount_cents,
    currency: item.currency,
    expected_at: item.next_due_at,
    kind: "bill" as const,
    detail: "Expected in the next 30 days.",
  }));
  const everydayEstimate = params.homeSummary.grocery_estimate_cents
    ? [{
        name: "Everyday groceries",
        amount_cents: params.homeSummary.grocery_estimate_cents,
        currency: params.homeSummary.currency,
        expected_at: null,
        kind: "everyday_estimate" as const,
        detail: "Based on recent spending. Kept separate from scheduled bills.",
      }]
    : [];
  const currencies = new Set([
    ...groups.flatMap((group) => group.accounts.map((item) => item.currency)),
    ...buckets.map((item) => item.currency),
    ...scheduledItems(params.truth).map((item) => item.currency),
  ]);

  return {
    version: 1,
    mixed_currencies: currencies.size > 1,
    where_money_is: { groups },
    tracked_purposes: {
      items: buckets.map((item) => ({ ...item, status_label: "Tracked separately" })),
    },
    planned: {
      scheduled: scheduledItems(params.truth),
      confirmed_patterns: confirmedPatterns(params.truth),
    },
    coming_up: { items: [...upcomingBills, ...largerPayments, ...everydayEstimate].slice(0, 8) },
    review: { items: reviewItems(params, groups) },
  };
}
