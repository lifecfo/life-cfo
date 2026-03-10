"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast, Button } from "@/components/ui";
import { useAsk } from "@/components/ask/AskProvider";

type MoneyRow = {
  currency: string;
  cents: number;
};

type UpcomingIncomeRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_pay_at: string | null;
};

type UpcomingBillRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
  notes?: string | null;
};

type GoalRow = {
  id: string;
  title: string | null;
  currency: string | null;
  current_cents: number;
  target_cents: number;
  status: string | null;
  is_primary?: boolean | null;
};

type AccountRow = {
  id: string;
  name: string | null;
  provider: string | null;
  type?: string | null;
  status?: string | null;
  archived?: boolean | null;
  currency: string | null;
  current_balance_cents: number | null;
  updated_at: string | null;
  created_at?: string | null;
};

type TxRow = {
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
};

type Overview = {
  ok: boolean;
  household_id: string | null;
  live: {
    status: "live" | "offline";
    total_connections: number;
    active_connections: number;
    last_sync_at: string | null;
  };
  totals: {
    balance_by_currency: MoneyRow[];
    accounts_count: number;
    transactions_count: number;
  };
  in_flow: {
    month_total_by_currency: MoneyRow[];
    recurring_income_count: number;
    upcoming_income_count_next_30_days: number;
    upcoming_income_total_by_currency: MoneyRow[];
    upcoming_income: UpcomingIncomeRow[];
  };
  out_flow: {
    month_total_by_currency: MoneyRow[];
    top_spending_categories: Array<{ category: string; cents: number }>;
    recurring_bills_count: number;
    upcoming_bills_count_next_30_days: number;
    upcoming_bills_total_by_currency: MoneyRow[];
    upcoming_bills: UpcomingBillRow[];
  };
  saved_flow: {
    saved_total_by_currency: MoneyRow[];
    positive_balance_accounts: AccountRow[];
    goals_count: number;
    goals_preview: GoalRow[];
    investment_accounts_count: number;
  };
  planned_flow: {
    upcoming_bills_count: number;
    upcoming_bills: UpcomingBillRow[];
    liabilities_count: number;
    liabilities_total_by_currency: MoneyRow[];
    budget_items_count: number;
  };
  supporting: {
    accounts: AccountRow[];
    recent_transactions: TxRow[];
  };
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency: string) {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function renderMoneyRows(rows: MoneyRow[]) {
  if (!rows.length) return "—";
  return rows
    .map((r) => moneyFromCents(r.cents, safeStr(r.currency) || "AUD"))
    .join(" • ");
}

function softDate(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return "";
  const ms = Date.parse(isoOrDate);
  if (!Number.isFinite(ms)) {
    const ms2 = Date.parse(isoOrDate + "T00:00:00Z");
    if (!Number.isFinite(ms2)) return "";
    return new Date(ms2).toLocaleDateString();
  }
  return new Date(ms).toLocaleDateString();
}

function softWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function MoneyClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const { openAsk, setDraft } = useAsk();

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);

    try {
      const data = await fetchJson<Overview>("/api/money/overview");
      setOverview(data);
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load money overview." }, 2500);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
  }, []);

  useEffect(() => {
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const liveChipClass =
    overview?.live.status === "live"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const householdContext = overview?.household_id
    ? `Household • ${overview.household_id.slice(0, 6)}…`
    : "No household";

  const askExamples = [
    "Are we okay this month?",
    "What changed recently?",
    "Where is our money leaking?",
    "What bills are coming up?",
  ];

  const openWithQuestion = (question: string) => {
    setDraft(question);
    openAsk();
  };

  const supportingAccounts = overview?.supporting.accounts ?? [];
  const recentTransactions = overview?.supporting.recent_transactions ?? [];
  const topCategories = overview?.out_flow.top_spending_categories ?? [];
  const goals = overview?.saved_flow.goals_preview ?? [];
  const upcomingBills = overview?.planned_flow.upcoming_bills ?? [];
  const upcomingIncome = overview?.in_flow.upcoming_income ?? [];

  const primaryGoal = useMemo(() => {
    return goals.find((g) => g.is_primary) ?? goals[0] ?? null;
  }, [goals]);

  return (
    <Page title="Money" subtitle="A calm view of the four household money flows.">
      <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={liveChipClass}>
              {overview?.live.status === "live" ? "Live" : "Offline"}
            </Chip>

            <Chip title="Workspace context">{householdContext}</Chip>

            <div className="text-xs text-zinc-500">
              {overview?.live.last_sync_at
                ? `Last updated ${softWhen(overview.live.last_sync_at)}`
                : loading
                  ? "Loading…"
                  : "No live sync yet."}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip title="Refresh" onClick={() => void refresh(false)}>
              Refresh
            </Chip>

            <Chip title="Connect accounts" onClick={() => router.push("/connections")}>
              Connect accounts
            </Chip>

            <Link href="/connections">
              <Chip>Connections</Chip>
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Ask about money</div>
                <div className="text-xs text-zinc-500">
                  The shared Ask panel can reason across all four flows.
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={openAsk} className="rounded-2xl">
                  Open Ask
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {askExamples.map((question) => (
                  <Chip
                    key={question}
                    className="text-xs"
                    title={question}
                    onClick={() => openWithQuestion(question)}
                  >
                    {question}
                  </Chip>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">IN</div>
                    <div className="mt-0.5 text-xs text-zinc-500">Money coming into the household.</div>
                  </div>
                  <Link href="/transactions">
                    <Chip>Open</Chip>
                  </Link>
                </div>

                <div>
                  <div className="text-xs text-zinc-500">This month</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">
                    {overview ? renderMoneyRows(overview.in_flow.month_total_by_currency) : "Loading…"}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-zinc-500">Recurring income</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.in_flow.recurring_income_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Upcoming next 30 days</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview ? renderMoneyRows(overview.in_flow.upcoming_income_total_by_currency) : "—"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-700">Next income</div>
                  {upcomingIncome.length > 0 ? (
                    upcomingIncome.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate text-zinc-900">{safeStr(item.name) || "Income"}</div>
                          <div className="truncate text-xs text-zinc-500">
                            {item.next_pay_at ? `Expected ${softDate(item.next_pay_at)}` : "Scheduled"}
                          </div>
                        </div>
                        <div className="shrink-0 font-medium text-zinc-900">
                          {moneyFromCents(Number(item.amount_cents || 0), safeStr(item.currency) || "AUD")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-500">No recurring income added yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">OUT</div>
                    <div className="mt-0.5 text-xs text-zinc-500">Money leaving the household.</div>
                  </div>
                  <Link href="/transactions">
                    <Chip>Open</Chip>
                  </Link>
                </div>

                <div>
                  <div className="text-xs text-zinc-500">This month</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">
                    {overview ? renderMoneyRows(overview.out_flow.month_total_by_currency) : "Loading…"}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-zinc-500">Recurring bills</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.out_flow.recurring_bills_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Upcoming next 30 days</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview ? renderMoneyRows(overview.out_flow.upcoming_bills_total_by_currency) : "—"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-700">Top categories</div>
                  {topCategories.length > 0 ? (
                    topCategories.slice(0, 3).map((item) => (
                      <div key={item.category} className="flex items-center justify-between gap-3 text-sm">
                        <div className="truncate text-zinc-900">{item.category}</div>
                        <div className="shrink-0 font-medium text-zinc-900">
                          {moneyFromCents(item.cents, "AUD")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-500">No category patterns yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">SAVED</div>
                    <div className="mt-0.5 text-xs text-zinc-500">Money already set aside.</div>
                  </div>
                  <Link href="/accounts">
                    <Chip>Open</Chip>
                  </Link>
                </div>

                <div>
                  <div className="text-xs text-zinc-500">Currently set aside</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">
                    {overview ? renderMoneyRows(overview.saved_flow.saved_total_by_currency) : "Loading…"}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-zinc-500">Positive-balance accounts</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.saved_flow.positive_balance_accounts.length ?? 0}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Goals</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.saved_flow.goals_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Investments</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.saved_flow.investment_accounts_count ?? 0}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-700">Primary savings focus</div>
                  {primaryGoal ? (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-sm font-medium text-zinc-900">
                        {safeStr(primaryGoal.title) || "Goal"}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {moneyFromCents(primaryGoal.current_cents, safeStr(primaryGoal.currency) || "AUD")}
                        {" of "}
                        {moneyFromCents(primaryGoal.target_cents, safeStr(primaryGoal.currency) || "AUD")}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-500">No savings goals set yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">PLANNED</div>
                    <div className="mt-0.5 text-xs text-zinc-500">Committed or expected future pressure.</div>
                  </div>
                  <Link href="/net-worth">
                    <Chip>Open</Chip>
                  </Link>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-zinc-500">Upcoming bills</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.planned_flow.upcoming_bills_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Liabilities</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.planned_flow.liabilities_count ?? 0}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500">Budget items</div>
                    <div className="mt-1 text-sm font-medium text-zinc-900">
                      {overview?.planned_flow.budget_items_count ?? 0}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-zinc-500">Liabilities total</div>
                  <div className="mt-1 text-sm font-medium text-zinc-900">
                    {overview ? renderMoneyRows(overview.planned_flow.liabilities_total_by_currency) : "—"}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-zinc-700">Coming up</div>
                  {upcomingBills.length > 0 ? (
                    upcomingBills.slice(0, 3).map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="truncate text-zinc-900">{safeStr(bill.name) || "Bill"}</div>
                          <div className="truncate text-xs text-zinc-500">
                            {bill.next_due_at ? `Due ${softDate(bill.next_due_at)}` : "Scheduled"}
                          </div>
                        </div>
                        <div className="shrink-0 font-medium text-zinc-900">
                          {moneyFromCents(Number(bill.amount_cents || 0), safeStr(bill.currency) || "AUD")}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-zinc-500">No upcoming bills added yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-4">
              <div className="text-sm font-semibold text-zinc-900">Supporting pages</div>

              <div className="flex flex-wrap gap-2">
                <Link href="/accounts">
                  <Chip>Accounts</Chip>
                </Link>
                <Link href="/transactions">
                  <Chip>Transactions</Chip>
                </Link>
                <Link href="/connections">
                  <Chip>Connections</Chip>
                </Link>
                <Link href="/net-worth">
                  <Chip>Net Worth</Chip>
                </Link>
              </div>

              <div className="text-xs text-zinc-500">
                These pages hold the detail. Money is the calm orientation layer.
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">Accounts</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {loading ? "Loading…" : supportingAccounts.length ? "Latest active accounts" : "No accounts yet."}
                    </div>
                  </div>
                  <Link href="/accounts">
                    <Chip>See all</Chip>
                  </Link>
                </div>

                <div className="mt-3 divide-y divide-zinc-100">
                  {supportingAccounts.map((a) => {
                    const cur = safeStr(a.currency) || "AUD";
                    const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : 0;

                    return (
                      <div key={a.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">
                            {safeStr(a.name) || "Untitled account"}
                          </div>
                          <div className="truncate text-xs text-zinc-500">
                            {[safeStr(a.provider) || "Manual", a.updated_at ? `Updated ${softDate(a.updated_at)}` : null]
                              .filter(Boolean)
                              .join(" • ")}
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-zinc-900">
                          {moneyFromCents(cents, cur)}
                        </div>
                      </div>
                    );
                  })}

                  {!loading && supportingAccounts.length === 0 ? (
                    <div className="py-3 text-sm text-zinc-500">No accounts yet.</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-zinc-200 bg-white">
              <CardContent>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">Recent activity</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {loading ? "Loading…" : recentTransactions.length ? "Latest transactions" : "No transactions yet."}
                    </div>
                  </div>
                  <Link href="/transactions">
                    <Chip>See all</Chip>
                  </Link>
                </div>

                <div className="mt-3 divide-y divide-zinc-100">
                  {recentTransactions.map((t) => {
                    const cur = safeStr(t.currency) || "AUD";
                    const cents =
                      typeof t.amount_cents === "number"
                        ? t.amount_cents
                        : typeof t.amount === "number"
                          ? Math.round(t.amount * 100)
                          : 0;

                    const title = safeStr(t.merchant) || safeStr(t.description) || "Transaction";
                    const meta = [
                      t.date ? softDate(t.date) : null,
                      safeStr(t.category) || null,
                      t.pending ? "Pending" : null,
                    ]
                      .filter(Boolean)
                      .join(" • ");

                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-zinc-900">{title}</div>
                          <div className="truncate text-xs text-zinc-500">{meta}</div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-zinc-900">
                          {moneyFromCents(Math.abs(cents), cur)}
                        </div>
                      </div>
                    );
                  })}

                  {!loading && recentTransactions.length === 0 ? (
                    <div className="py-3 text-sm text-zinc-500">No transactions yet.</div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-1 text-xs text-zinc-500">
                <div>
                  Money now reflects the four household flows: In, Out, Saved, and Planned.
                </div>
                <div>
                  Depth lives in the supporting pages and in the shared Ask panel.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}