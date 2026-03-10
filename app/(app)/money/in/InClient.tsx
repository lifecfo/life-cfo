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

type UpcomingIncomeRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_pay_at: string | null;
};

type InResponse = {
  ok: boolean;
  household_id: string | null;
  in_flow: {
    month_total_by_currency: MoneyRow[];
    recurring_income_count: number;
    upcoming_income_count_next_30_days: number;
    upcoming_income_total_by_currency: MoneyRow[];
    upcoming_income: UpcomingIncomeRow[];
  };
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function moneyFromCents(cents: number, currency: string) {
  const amt = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amt);
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
    const ms2 = Date.parse(`${isoOrDate}T00:00:00Z`);
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

export default function InClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InResponse | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);

    try {
      const result = await fetchJson<InResponse>("/api/money/overview");
      setData(result);
    } catch (e: any) {
      if (!silent) {
        showToast({ message: e?.message ?? "Couldn’t load In view." }, 2500);
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

  const flow = data?.in_flow;
  const upcomingIncome = flow?.upcoming_income ?? [];

  const right = (
    <div className="flex items-center gap-2 flex-wrap">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page
      title="In"
      subtitle="Money coming into the household."
      right={right}
    >
      <div className="mx-auto w-full max-w-[860px] px-4 sm:px-6 space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">This month</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : renderMoneyRows(flow?.month_total_by_currency ?? [])}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Recurring income</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : flow?.recurring_income_count ?? 0}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Upcoming next 30 days</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">
                  {loading ? "Loading…" : flow?.upcoming_income_count_next_30_days ?? 0}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-zinc-500">Upcoming income total</div>
              <div className="mt-1 text-sm font-medium text-zinc-900">
                {loading ? "Loading…" : renderMoneyRows(flow?.upcoming_income_total_by_currency ?? [])}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Upcoming income</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  Known income expected in the next 30 days.
                </div>
              </div>
              <Link href="/money">
                <Chip>Money</Chip>
              </Link>
            </div>

            <div className="mt-4 divide-y divide-zinc-100">
              {!loading && upcomingIncome.length === 0 ? (
                <div className="py-3 text-sm text-zinc-500">
                  No recurring income added yet.
                </div>
              ) : null}

              {upcomingIncome.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {safeStr(item.name) || "Income"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {[
                        item.next_pay_at ? `Expected ${softDate(item.next_pay_at)}` : null,
                        safeStr(item.cadence) || null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-zinc-900">
                    {moneyFromCents(
                      Number(item.amount_cents || 0),
                      safeStr(item.currency) || "AUD"
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>
                In is the household’s incoming flow: expected money, recurring income, and near-term timing.
              </div>
              <div>
                This becomes stronger as pay sources, timing, and recurring income are filled out.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}