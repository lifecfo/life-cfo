"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";

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
};

type UpcomingBillRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
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
  return formatMoneyFromCents(cents, currency);
}

function renderMoneyRows(rows: MoneyRow[]) {
  if (!rows.length) return "-";
  return rows.map((r) => moneyFromCents(r.cents, safeStr(r.currency) || "AUD")).join(" | ");
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
  const errorText =
    typeof (json as { error?: unknown })?.error === "string"
      ? (json as { error?: string }).error
      : "Request failed";
  if (!res.ok) throw new Error(errorText);
  return json as T;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function OutClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OutResponse | null>(null);

  const out = data?.out_flow;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const result = await fetchJson<OutResponse>("/api/money/out");
      setData(result);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not load Out view.");
      setError(message);
      if (!silent) showToast({ message }, 2500);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const right = (
    <div className="flex flex-wrap items-center gap-2">
      <Chip onClick={() => void load(false)}>Refresh</Chip>
      <Chip onClick={() => router.push("/money")}>Back to Money</Chip>
    </div>
  );

  return (
    <Page title="Out" subtitle="Bills, spending, and outgoing pressure." right={right}>
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 sm:px-6">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Out at a glance</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>This month outflow: {loading ? "Loading..." : renderMoneyRows(out?.month_total_by_currency ?? [])}</li>
              <li>Recurring bills: {loading ? "Loading..." : out?.recurring_bills_count ?? 0}</li>
              <li>Upcoming bills (30 days): {loading ? "Loading..." : out?.upcoming_bills_count_next_30_days ?? 0}</li>
            </ul>
            <div className="text-xs text-zinc-500">
              Recurring total: {loading ? "Loading..." : renderMoneyRows(out?.recurring_bills_total_by_currency ?? [])}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Highlights</div>
            <div className="text-xs text-zinc-500">Upcoming bills</div>
            <div className="space-y-2">
              {(out?.upcoming_bills ?? []).slice(0, 3).map((bill) => (
                <div key={bill.id} className="flex items-center justify-between gap-3 text-xs text-zinc-700">
                  <div className="min-w-0 truncate">
                    {safeStr(bill.name) || "Bill"}
                    {bill.next_due_at ? ` - Due ${softDate(bill.next_due_at)}` : ""}
                  </div>
                  <div className="shrink-0 font-medium text-zinc-900">
                    {moneyFromCents(Number(bill.amount_cents || 0), safeStr(bill.currency) || "AUD")}
                  </div>
                </div>
              ))}
              {!loading && (out?.upcoming_bills ?? []).length === 0 ? (
                <div className="text-xs text-zinc-500">No upcoming bills found.</div>
              ) : null}
            </div>

            <div className="text-xs text-zinc-500">Recent outflows</div>
            <div className="space-y-2">
              {(out?.recent_out_transactions ?? []).slice(0, 3).map((tx) => {
                const cents =
                  typeof tx.amount_cents === "number"
                    ? Math.abs(tx.amount_cents)
                    : typeof tx.amount === "number"
                      ? Math.abs(Math.round(tx.amount * 100))
                      : 0;
                const title = safeStr(tx.merchant) || safeStr(tx.description) || "Transaction";
                const meta = [tx.date ? softDate(tx.date) : null, safeStr(tx.category) || null]
                  .filter(Boolean)
                  .join(" | ");

                return (
                  <div key={tx.id} className="flex items-center justify-between gap-3 text-xs text-zinc-700">
                    <div className="min-w-0">
                      <div className="truncate text-zinc-900">{title}</div>
                      <div className="truncate text-zinc-500">{meta}</div>
                    </div>
                    <div className="shrink-0 font-medium text-zinc-900">
                      {moneyFromCents(cents, safeStr(tx.currency) || "AUD")}
                    </div>
                  </div>
                );
              })}
              {!loading && (out?.recent_out_transactions ?? []).length === 0 ? (
                <div className="text-xs text-zinc-500">No recent outflows found.</div>
              ) : null}
              {loading ? <div className="text-xs text-zinc-500">Loading highlights...</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Open related pages</div>
            <div className="space-y-1 text-xs text-zinc-500">
              <div>Top category: {(out?.top_categories ?? [])[0]?.category || "Not enough data yet."}</div>
              <div>Top merchant: {(out?.top_merchants ?? [])[0]?.merchant || "Not enough data yet."}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/money">
                <Chip>Money</Chip>
              </Link>
              <Link href="/bills">
                <Chip>Bills</Chip>
              </Link>
              <Link href="/transactions">
                <Chip>Transactions</Chip>
              </Link>
              <Link href="/money/planned">
                <Chip>Planned</Chip>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
