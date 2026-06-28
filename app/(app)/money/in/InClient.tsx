"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import type { MoneyDataCoverage } from "@/lib/money/reasoning/types";

type FinancialSnapshot = {
  asOf: string;
  liquidity: { availableCashCents: number; accountCount: number };
  income: { recurringMonthlyCents: number; sourceCount: number };
  commitments: { recurringMonthlyCents: number; billCount: number };
  discretionary: { last30DayOutflowCents: number };
  connections: { total: number; stale: number; maxAgeDays: number };
};

type OverviewResponse = {
  snapshot: FinancialSnapshot;
  data_coverage?: MoneyDataCoverage;
};

function formatMoney(cents: number | undefined | null, currency = "AUD") {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const amt = n / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
}

function formatMoneyRows(rows: MoneyDataCoverage["current_month_money_in"]) {
  if (!rows.length) return "No money in recorded this month yet";
  return rows.map((row) => formatMoney(row.cents, row.currency)).join(" | ");
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

export default function InClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);

  const snapshot = data?.snapshot;
  const coverage = data?.data_coverage;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const result = await fetchJson<OverviewResponse>("/api/money/overview");
      setData(result);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not load In view.");
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
    <Page title="In" subtitle="Money coming into the household." right={right}>
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 sm:px-6">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Money in at a glance</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>Money in this month: {loading ? "Loading..." : formatMoneyRows(coverage?.current_month_money_in ?? [])}</li>
              <li>Confirmed income patterns: {loading ? "Loading..." : coverage?.confirmed_income_pattern_count ?? 0}</li>
              <li>Income formally set up: {snapshot ? `${snapshot.income.sourceCount} source(s), ${formatMoney(snapshot.income.recurringMonthlyCents)}` : loading ? "Loading..." : "-"}</li>
            </ul>
            <div className="text-xs text-zinc-500">
              Snapshot date: {snapshot?.asOf ? softDate(snapshot.asOf) : loading ? "Loading..." : "No date"}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Highlights</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>{coverage?.label_quality_note || (loading ? "Checking transaction names..." : "Transaction name quality will appear here.")}</li>
              <li>{coverage?.latest_transaction_date ? `Latest transaction used: ${softDate(coverage.latest_transaction_date)}.` : loading ? "Checking recent transactions..." : "No recent transaction date is available."}</li>
              {loading ? <li>Loading highlights...</li> : null}
            </ul>
            <div className="text-xs text-zinc-500">
              Connected money in is shown separately from income you have formally set up.
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Open related pages</div>
            <div className="flex flex-wrap gap-2">
              <Link href="/money">
                <Chip>Money</Chip>
              </Link>
              <Link href="/transactions">
                <Chip>Transactions</Chip>
              </Link>
              <Link href="/accounts">
                <Chip>Accounts</Chip>
              </Link>
              <Link href="/connections">
                <Chip>Connections</Chip>
              </Link>
            </div>
            <div className="text-xs text-zinc-500">
              Go deeper into money in, account coverage, and connected sources.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
