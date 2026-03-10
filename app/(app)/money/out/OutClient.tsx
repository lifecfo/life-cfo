"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type MoneyRow = {
  currency: string;
  cents: number;
};

type CategoryRow = {
  category: string;
  cents: number;
};

type MerchantRow = {
  merchant: string;
  cents: number;
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
  created_at: string | null;
  updated_at: string | null;
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

type OutResponse = {
  ok: boolean;
  household_id: string | null;
  out_flow: {
    month_total_by_currency: MoneyRow[];
    top_categories: CategoryRow[];
    top_merchants: MerchantRow[];
    recent_out_transactions: TxRow[];
    recurring_bills_count: number;
    recurring_bills_total_by_currency: MoneyRow[];
    upcoming_bills_count_next_30_days: number;
    upcoming_bills_total_by_currency: MoneyRow[];
    upcoming_bills: UpcomingBillRow[];
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function OutClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<OutResponse | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);

    try {
      const out = await fetchJson<OutResponse>("/api/money/out");
      setData(out);
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load Out view." }, 2500);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const out = data?.out_flow;
  const upcomingBills = out?.upcoming_bills ?? [];
  const recentOut = out?.recent_out_transactions ?? [];
  const topCategories = out?.top_categories ?? [];
  const topMerchants = out?.top_merchants ?? [];

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page
      title="Out"
      subtitle="Where money is leaving the household."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">This month</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : renderMoneyRows(out?.month_total_by_currency ?? [])}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Recurring bills</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : out?.recurring_bills_count ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Upcoming next 30 days</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : out?.upcoming_bills_count_next_30_days ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-zinc-500">Recurring total</div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  {loading ? "Loading…" : renderMoneyRows(out?.recurring_bills_total_by_currency ?? [])}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Upcoming total</div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  {loading ? "Loading…" : renderMoneyRows(out?.upcoming_bills_total_by_currency ?? [])}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Top categories</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Biggest spending categories this month.
                  </div>
                </div>
                <Link href="/transactions">
                  <Chip>Transactions</Chip>
                </Link>
              </div>

              <div className="mt-4 divide-y divide-zinc-100">
                {!loading && topCategories.length === 0 ? (
                  <div className="py-3 text-sm text-zinc-500">No category patterns yet.</div>
                ) : null}

                {topCategories.map((item) => (
                  <div key={item.category} className="flex items-center justify-between gap-3 py-3">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {item.category}
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-zinc-900">
                      {moneyFromCents(item.cents, "AUD")}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Top merchants</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    Biggest merchant outflows this month.
                  </div>
                </div>
                <Link href="/transactions">
                  <Chip>Transactions</Chip>
                </Link>
              </div>

              <div className="mt-4 divide-y divide-zinc-100">
                {!loading && topMerchants.length === 0 ? (
                  <div className="py-3 text-sm text-zinc-500">No merchant patterns yet.</div>
                ) : null}

                {topMerchants.map((item) => (
                  <div key={item.merchant} className="flex items-center justify-between gap-3 py-3">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {item.merchant}
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-zinc-900">
                      {moneyFromCents(item.cents, "AUD")}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Upcoming bills</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Known outgoing commitments in the next 30 days.
                </div>
              </div>
              <Link href="/money/planned">
                <Chip>Planned</Chip>
              </Link>
            </div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && upcomingBills.length === 0 ? (
                <div className="py-3 text-sm text-zinc-500">No upcoming bills added yet.</div>
              ) : null}

              {upcomingBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {safeStr(bill.name) || "Bill"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {[
                        bill.next_due_at ? `Due ${softDate(bill.next_due_at)}` : null,
                        safeStr(bill.cadence) || null,
                        bill.autopay ? "Autopay" : "Manual",
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-zinc-900">
                    {moneyFromCents(
                      Number(bill.amount_cents || 0),
                      safeStr(bill.currency) || "AUD"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Recent outflows</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Latest money leaving the household.
                </div>
              </div>
              <Link href="/transactions">
                <Chip>See all</Chip>
              </Link>
            </div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && recentOut.length === 0 ? (
                <div className="py-3 text-sm text-zinc-500">No outflows yet.</div>
              ) : null}

              {recentOut.map((t) => {
                const cur = safeStr(t.currency) || "AUD";
                const cents =
                  typeof t.amount_cents === "number"
                    ? Math.abs(t.amount_cents)
                    : typeof t.amount === "number"
                      ? Math.abs(Math.round(t.amount * 100))
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
                      {moneyFromCents(cents, cur)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>
                Out is the household’s spending picture: what is leaving, where it is going, and what pressure is repeating.
              </div>
              <div>
                This becomes much stronger once categories, rules, and recurring patterns are filled out.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}