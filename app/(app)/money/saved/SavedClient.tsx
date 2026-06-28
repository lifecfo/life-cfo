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

function sourceNames(sources: MoneyDataCoverage["included_sources"]) {
  if (!sources.length) return "No current connected sources";
  return sources
    .map((source) => source.provider.charAt(0).toUpperCase() + source.provider.slice(1))
    .join(" and ");
}

function formatMoney(cents: number | undefined | null, currency = "AUD") {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const amt = n / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `${currency} ${amt.toFixed(2)}`;
  }
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

export default function SavedClient() {
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
      const saved = await fetchJson<OverviewResponse>("/api/money/overview");
      setData(saved);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Could not load Saved view.");
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
    <Page title="Saved" subtitle="Balances and money already set aside." right={right}>
      <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 sm:px-6">
        {error ? <div className="text-sm text-red-600">{error}</div> : null}

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Balances at a glance</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>
                Available cash: {snapshot ? formatMoney(snapshot.liquidity.availableCashCents) : loading ? "Loading..." : "-"}
              </li>
              <li>
                Accounts included: {coverage ? coverage.account_count : loading ? "Loading..." : "-"}
              </li>
              <li>
                Current sources: {coverage ? sourceNames(coverage.included_sources) : loading ? "Loading..." : "-"}
              </li>
            </ul>
            <div className="text-xs text-zinc-500">
              {coverage?.has_reference_only_sources
                ? "Older linked sources are kept for reference and are not included in these balances."
                : "These balances use the current connected sources in this view."}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Highlights</div>
            <ul className="space-y-1 text-xs text-zinc-700">
              <li>{coverage?.label_quality_note || (loading ? "Checking connected data..." : "Connected data details will appear here.")}</li>
              <li>{coverage?.transaction_count ?? 0} recent transaction(s) support this view.</li>
              {loading ? <li>Loading highlights...</li> : null}
            </ul>
            <div className="text-xs text-zinc-500">
              Snapshot date: {snapshot?.asOf ? softDate(snapshot.asOf) : loading ? "Loading..." : "No date"}
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
              <Link href="/accounts">
                <Chip>Accounts</Chip>
              </Link>
              <Link href="/connections">
                <Chip>Connections</Chip>
              </Link>
              <Link href="/money/goals">
                <Chip>Goals</Chip>
              </Link>
            </div>
            <div className="text-xs text-zinc-500">
              Go deeper into account balances, savings goals, and connected sources.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
