// lib/picture/exportPack.ts
// Shapes already-typed household data into a factual summary a person can
// print or save as a PDF to take to a bank, broker, adviser, or accountant.
// Lists what was entered. Makes no recommendation and draws no conclusion.

export type Cadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export type ExportAccountRow = {
  name: string | null;
  type: string | null;
  currency: string | null;
  current_balance_cents: number | null;
  archived: boolean | null;
};

export type ExportIncomeRow = {
  name: string | null;
  amount_cents: number;
  currency: string | null;
  cadence: Cadence | string;
  active: boolean | null;
};

export type ExportBillRow = {
  name: string | null;
  amount_cents: number;
  currency: string | null;
  cadence: Cadence | string;
  autopay: boolean | null;
  active: boolean | null;
};

export type ExportGoalRow = {
  title: string | null;
  currency: string | null;
  target_cents: number | null;
  current_cents: number | null;
  status: string | null;
  deadline_at: string | null;
};

export type ExportTransactionRow = {
  date: string | null;
  category: string | null;
  amount_cents: number | null;
};

export function monthlyEquivalentCents(amountCents: number, cadence: string): number {
  switch (cadence) {
    case "weekly":
      return Math.round((amountCents * 52) / 12);
    case "fortnightly":
      return Math.round((amountCents * 26) / 12);
    case "quarterly":
      return Math.round(amountCents / 3);
    case "yearly":
      return Math.round(amountCents / 12);
    case "monthly":
    default:
      return amountCents;
  }
}

export type ExportPackAccount = {
  name: string;
  type: string;
  currency: string;
  balance_cents: number;
};

export type ExportPackIncomeSource = {
  name: string;
  currency: string;
  amount_cents: number;
  cadence: string;
  monthly_equivalent_cents: number;
};

export type ExportPackBill = {
  name: string;
  currency: string;
  amount_cents: number;
  cadence: string;
  monthly_equivalent_cents: number;
  autopay: boolean;
};

export type ExportPackGoal = {
  title: string;
  currency: string;
  target_cents: number;
  current_cents: number;
  percent: number;
  status: string;
  deadline: string | null;
};

export type ExportPackCategorySpend = {
  category: string;
  cents: number;
};

export type ExportPack = {
  generated_at: string;
  accounts: ExportPackAccount[];
  total_balance_by_currency: { currency: string; cents: number }[];
  income: ExportPackIncomeSource[];
  monthly_income_total_cents: number;
  bills: ExportPackBill[];
  monthly_bills_total_cents: number;
  goals: ExportPackGoal[];
  spending_last_30_days: {
    total_cents: number;
    by_category: ExportPackCategorySpend[];
  };
  note: string;
};

function safeStr(value: unknown, fallback = "Untitled"): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s || fallback;
}

export function buildExportPack(params: {
  now?: Date;
  accounts: ExportAccountRow[];
  income: ExportIncomeRow[];
  bills: ExportBillRow[];
  goals: ExportGoalRow[];
  transactions: ExportTransactionRow[];
}): ExportPack {
  const now = params.now ?? new Date();

  const accounts = params.accounts
    .filter((row) => !row.archived)
    .map((row) => ({
      name: safeStr(row.name, "Account"),
      type: safeStr(row.type, "other"),
      currency: safeStr(row.currency, "AUD"),
      balance_cents: typeof row.current_balance_cents === "number" ? row.current_balance_cents : 0,
    }));

  const totalByCurrency = new Map<string, number>();
  for (const account of accounts) {
    totalByCurrency.set(account.currency, (totalByCurrency.get(account.currency) ?? 0) + account.balance_cents);
  }

  const income = params.income
    .filter((row) => row.active !== false)
    .map((row) => {
      const cadence = safeStr(row.cadence, "monthly");
      return {
        name: safeStr(row.name, "Income"),
        currency: safeStr(row.currency, "AUD"),
        amount_cents: row.amount_cents,
        cadence,
        monthly_equivalent_cents: monthlyEquivalentCents(row.amount_cents, cadence),
      };
    });
  const monthlyIncomeTotal = income.reduce((sum, row) => sum + row.monthly_equivalent_cents, 0);

  const bills = params.bills
    .filter((row) => row.active !== false)
    .map((row) => {
      const cadence = safeStr(row.cadence, "monthly");
      return {
        name: safeStr(row.name, "Bill"),
        currency: safeStr(row.currency, "AUD"),
        amount_cents: row.amount_cents,
        cadence,
        monthly_equivalent_cents: monthlyEquivalentCents(row.amount_cents, cadence),
        autopay: row.autopay === true,
      };
    });
  const monthlyBillsTotal = bills.reduce((sum, row) => sum + row.monthly_equivalent_cents, 0);

  const goals = params.goals
    .filter((row) => (row.status ?? "active") !== "archived")
    .map((row) => {
      const target = typeof row.target_cents === "number" ? row.target_cents : 0;
      const current = typeof row.current_cents === "number" ? row.current_cents : 0;
      const percent = target > 0 ? Math.max(0, Math.min(999, Math.round((current / target) * 100))) : 0;
      return {
        title: safeStr(row.title, "Goal"),
        currency: safeStr(row.currency, "AUD"),
        target_cents: target,
        current_cents: current,
        percent,
        status: safeStr(row.status, "active"),
        deadline: row.deadline_at ? row.deadline_at.slice(0, 10) : null,
      };
    });

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recentOutflows = params.transactions.filter(
    (row) => typeof row.amount_cents === "number" && row.amount_cents < 0 && (row.date ?? "") >= cutoffIso
  );
  const byCategory = new Map<string, number>();
  for (const row of recentOutflows) {
    const category = safeStr(row.category, "Uncategorised");
    byCategory.set(category, (byCategory.get(category) ?? 0) + Math.abs(row.amount_cents ?? 0));
  }
  const spendingByCategory = [...byCategory.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
  const spendingTotal = spendingByCategory.reduce((sum, row) => sum + row.cents, 0);

  return {
    generated_at: now.toISOString(),
    accounts,
    total_balance_by_currency: [...totalByCurrency.entries()].map(([currency, cents]) => ({ currency, cents })),
    income,
    monthly_income_total_cents: monthlyIncomeTotal,
    bills,
    monthly_bills_total_cents: monthlyBillsTotal,
    goals,
    spending_last_30_days: {
      total_cents: spendingTotal,
      by_category: spendingByCategory,
    },
    note:
      "This is a factual summary of figures entered into Life CFO by this household. It lists what was typed, uploaded, or imported. It is not financial advice, has not been reviewed by a licensed adviser, and is not a recommendation.",
  };
}
