/**
 * Page-shaped adapters over the shared sample household (lib/demo/sampleHousehold.ts)
 * for pages that call a real API route for their data rather than rendering through
 * PageGlance. Same ground rule as the rest of sample mode: in-memory only, never
 * written anywhere, never sent to an AI provider.
 */
import { buildSampleHousehold, monthlyCents, type SampleItem } from "./sampleHousehold";

const CURRENCY = "AUD";

function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

// --- Money out (app/(app)/money/out/OutClient.tsx) ---

export type SampleOutResponse = {
  ok: true;
  household_id: null;
  out_flow: {
    month_total_by_currency: { currency: string; cents: number }[];
    top_categories: { category: string; cents: number }[];
    top_merchants: { merchant: string; cents: number }[];
    recent_out_transactions: {
      id: string;
      date: string | null;
      description: string | null;
      merchant: string | null;
      category: string | null;
      pending: boolean | null;
      amount: number | null;
      amount_cents: number | null;
      currency: string | null;
    }[];
    recurring_bills_count: number;
    recurring_bills_total_by_currency: { currency: string; cents: number }[];
    upcoming_bills_count_next_30_days: number;
    upcoming_bills_total_by_currency: { currency: string; cents: number }[];
    upcoming_bills: {
      id: string;
      name: string | null;
      amount_cents: number | null;
      currency: string | null;
      cadence: string | null;
      next_due_at: string | null;
      autopay: boolean | null;
    }[];
  };
};

export function buildSampleOutResponse(today = new Date()): SampleOutResponse {
  const household = buildSampleHousehold(today);
  const thisMonth = monthKey(iso(today));

  const monthOutflows = household.transactions.filter(
    (row) => row.amount_cents < 0 && monthKey(row.date) === thisMonth
  );
  const monthTotalCents = monthOutflows.reduce((sum, row) => sum + Math.abs(row.amount_cents), 0);

  const byCategory = new Map<string, number>();
  for (const row of monthOutflows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + Math.abs(row.amount_cents));
  }
  const topCategories = [...byCategory.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);

  const byMerchant = new Map<string, number>();
  for (const row of monthOutflows) {
    byMerchant.set(row.description, (byMerchant.get(row.description) ?? 0) + Math.abs(row.amount_cents));
  }
  const topMerchants = [...byMerchant.entries()]
    .map(([merchant, cents]) => ({ merchant, cents }))
    .sort((a, b) => b.cents - a.cents);

  const recentOut = household.transactions
    .filter((row) => row.amount_cents < 0)
    .slice(0, 8)
    .map((row, index) => ({
      id: `sample-tx-${index}`,
      date: row.date,
      description: row.description,
      merchant: row.description,
      category: row.category,
      pending: false,
      amount: row.amount_cents / 100,
      amount_cents: row.amount_cents,
      currency: CURRENCY,
    }));

  const bills = household.items.filter((item) => item.kind === "bill" || item.kind === "renewal");
  const recurringTotalCents = bills.reduce((sum, item) => sum + monthlyCents(item.amount_cents, item.cadence), 0);

  const in30Days = (item: SampleItem) => {
    const due = new Date(item.due_on);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    return diffDays >= 0 && diffDays <= 30;
  };
  const upcoming = bills
    .filter(in30Days)
    .sort((a, b) => a.due_on.localeCompare(b.due_on))
    .map((item) => ({
      id: item.id,
      name: item.title,
      amount_cents: item.amount_cents,
      currency: CURRENCY,
      cadence: item.cadence,
      next_due_at: item.due_on,
      autopay: false,
    }));
  const upcomingTotalCents = upcoming.reduce((sum, item) => sum + (item.amount_cents ?? 0), 0);

  return {
    ok: true,
    household_id: null,
    out_flow: {
      month_total_by_currency: monthTotalCents ? [{ currency: CURRENCY, cents: monthTotalCents }] : [],
      top_categories: topCategories,
      top_merchants: topMerchants,
      recent_out_transactions: recentOut,
      recurring_bills_count: bills.length,
      recurring_bills_total_by_currency: recurringTotalCents ? [{ currency: CURRENCY, cents: recurringTotalCents }] : [],
      upcoming_bills_count_next_30_days: upcoming.length,
      upcoming_bills_total_by_currency: upcomingTotalCents ? [{ currency: CURRENCY, cents: upcomingTotalCents }] : [],
      upcoming_bills: upcoming,
    },
  };
}

// --- Accounts (app/(app)/accounts/AccountsPage.tsx) ---

export type SampleAccountRow = {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: string;
  archived: boolean;
  currency: string;
  current_balance_cents: number;
  updated_at: string;
  created_at: string;
};

export function buildSampleAccounts(today = new Date()): SampleAccountRow[] {
  const now = today.toISOString();
  const openedAgo = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };
  return [
    {
      id: "sample-everyday",
      name: "Everyday account",
      provider: "manual",
      type: "everyday",
      status: "active",
      archived: false,
      currency: CURRENCY,
      current_balance_cents: 342000,
      updated_at: now,
      created_at: openedAgo(400),
    },
    {
      id: "sample-savings",
      name: "Savings",
      provider: "manual",
      type: "savings",
      status: "active",
      archived: false,
      currency: CURRENCY,
      current_balance_cents: 1850000,
      updated_at: now,
      created_at: openedAgo(700),
    },
    {
      id: "sample-credit",
      name: "Credit card",
      provider: "manual",
      type: "credit_card",
      status: "active",
      archived: false,
      currency: CURRENCY,
      current_balance_cents: -128000,
      updated_at: now,
      created_at: openedAgo(900),
    },
  ];
}

// --- Transactions (app/(app)/transactions/TransactionsClient.tsx) ---

export type SampleTransactionRow = {
  id: string;
  date: string | null;
  description: string | null;
  merchant: string | null;
  category: string | null;
  pending: boolean | null;
  amount: number | null;
  amount_cents: number | null;
  currency: string | null;
  account_id: string | null;
  provider: string | null;
  source_label: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export function buildSampleTransactions(today = new Date()): SampleTransactionRow[] {
  const household = buildSampleHousehold(today);
  const accounts = buildSampleAccounts(today);
  return household.transactions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((row, index) => {
      const accountId = row.amount_cents < 0 && row.category !== "Housing" ? accounts[0].id : accounts[1].id;
      return {
        id: `sample-tx-${index}`,
        date: row.date,
        description: row.description,
        merchant: row.description,
        category: row.category,
        pending: false,
        amount: row.amount_cents / 100,
        amount_cents: row.amount_cents,
        currency: CURRENCY,
        account_id: accountId,
        provider: "manual",
        source_label: "Sample household",
        created_at: `${row.date}T00:00:00.000Z`,
        updated_at: `${row.date}T00:00:00.000Z`,
      };
    });
}

// --- Goals (app/(app)/money/goals/page.tsx) ---

export type SampleGoal = {
  id: string;
  title: string;
  currency: string;
  target_cents: number;
  current_cents: number;
  status: "active" | "done";
  deadline_at: string | null;
  notes: string | null;
  purpose_type: "build_toward" | "maintain" | "pay_by_date";
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export function buildSampleGoals(today = new Date()): SampleGoal[] {
  const now = today.toISOString();
  const by = (daysAhead: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString();
  };
  return [
    {
      id: "sample-goal-buffer",
      title: "Emergency buffer",
      currency: CURRENCY,
      target_cents: 1000000,
      current_cents: 620000,
      status: "active",
      deadline_at: null,
      notes: "Three months of core bills set aside.",
      purpose_type: "build_toward",
      is_primary: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: "sample-goal-holiday",
      title: "Family holiday",
      currency: CURRENCY,
      target_cents: 450000,
      current_cents: 180000,
      status: "active",
      deadline_at: by(220),
      notes: "Saving a bit each pay toward next year's trip.",
      purpose_type: "pay_by_date",
      is_primary: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: "sample-goal-car",
      title: "Car replacement fund",
      currency: CURRENCY,
      target_cents: 800000,
      current_cents: 95000,
      status: "active",
      deadline_at: null,
      notes: "Topping this up when there's room left over.",
      purpose_type: "build_toward",
      is_primary: false,
      created_at: now,
      updated_at: now,
    },
  ];
}
