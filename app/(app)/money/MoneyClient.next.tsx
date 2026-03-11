"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import { useAsk } from "@/components/ask/AskProvider";

type FinancialSnapshot = {
  asOf: string;
  liquidity: { availableCashCents: number; accountCount: number };
  income: { recurringMonthlyCents: number; sourceCount: number };
  commitments: { recurringMonthlyCents: number; billCount: number };
  discretionary: { last30DayOutflowCents: number };
  connections: { total: number; stale: number; maxAgeDays: number };
  pressure: {
    structural_pressure: { summary: string };
    discretionary_drift: { summary: string };
    timing_mismatch: { summary: string };
    stability_risk: { summary: string };
  };
};

type SnapshotExplanation = {
  headline: string;
  summary: string;
  insights: string[];
  pressure: {
    structural: string;
    discretionary: string;
    timing: string;
    stability: string;
  };
};

type OverviewResponse = {
  snapshot: FinancialSnapshot;
  explanation: SnapshotExplanation;
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? "Request failed");
  return json as T;
}

export default function MoneyClientNext() {
  const router = useRouter();
  const { showToast } = useToast();
  const { openAsk, setDraft } = useAsk();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);

  const snapshot = data?.snapshot;
  const explanation = data?.explanation;

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<OverviewResponse>("/api/money/overview");
      setData(res);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load money overview.");
      if (!silent) showToast({ message: e?.message ?? "Unable to load money overview." }, 2500);
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

  const askExamples = [
    "Are we okay this month?",
    "What changed recently?",
    "Where is our money leaking?",
    "What bills are coming up?",
  ];

  const openWithQuestion = (q: string) => {
    setDraft(q);
    openAsk();
  };

  return (
    <Page title="Money" subtitle="Calm orientation for the household flows.">
      <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chip title="As of">{snapshot?.asOf ? `As of ${snapshot.asOf}` : loading ? "Loading…" : "No date"}</Chip>
          <div className="flex flex-wrap items-center gap-2">
            <Chip onClick={() => void refresh(false)}>Refresh</Chip>
            <Chip onClick={() => router.push("/connections")}>Connect accounts</Chip>
            <Link href="/connections">
              <Chip>Connections</Chip>
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mt-4 text-sm text-red-600">{error}</div>
        ) : null}

        <div className="mt-5 grid gap-4">
          {/* Orientation */}
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">
                {explanation?.headline || (loading ? "Loading…" : "Money snapshot")}
              </div>
              <div className="text-xs text-zinc-600 leading-relaxed">
                {explanation?.summary || (loading ? "Loading…" : "No summary yet.")}
              </div>
              <div className="space-y-1">
                <div className="text-xs font-medium text-zinc-700">Insights</div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-600">
                  {(explanation?.insights ?? []).slice(0, 5).map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                  {!loading && (!explanation?.insights || explanation.insights.length === 0) ? (
                    <li>No insights yet.</li>
                  ) : null}
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Ask */}
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Ask about money</div>
                <div className="text-xs text-zinc-500">Use Ask for deeper questions or scenarios.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={openAsk} className="rounded-2xl">
                  Open Ask
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {askExamples.map((q) => (
                  <Chip key={q} className="text-xs" onClick={() => openWithQuestion(q)} title={q}>
                    {q}
                  </Chip>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Financial state grid */}
          <div className="grid gap-4 lg:grid-cols-3">
            <StateCard
              title="Available cash"
              subtitle="Ready to use"
              value={snapshot ? formatMoney(snapshot.liquidity.availableCashCents) : loading ? "Loading…" : "—"}
              detail={snapshot ? `${snapshot.liquidity.accountCount} account(s)` : ""}
            />
            <StateCard
              title="Recurring income"
              subtitle="Monthly"
              value={snapshot ? formatMoney(snapshot.income.recurringMonthlyCents) : loading ? "Loading…" : "—"}
              detail={snapshot ? `${snapshot.income.sourceCount} source(s)` : ""}
            />
            <StateCard
              title="Recurring commitments"
              subtitle="Monthly"
              value={snapshot ? formatMoney(snapshot.commitments.recurringMonthlyCents) : loading ? "Loading…" : "—"}
              detail={snapshot ? `${snapshot.commitments.billCount} bill(s)` : ""}
            />
            <StateCard
              title="Discretionary outflow"
              subtitle="Last 30 days"
              value={snapshot ? formatMoney(snapshot.discretionary.last30DayOutflowCents) : loading ? "Loading…" : "—"}
            />
            <StateCard
              title="Connections"
              subtitle="Data freshness"
              value={
                snapshot
                  ? `${snapshot.connections.total} total • ${snapshot.connections.stale} stale`
                  : loading
                    ? "Loading…"
                    : "—"
              }
              detail={snapshot ? `Max age ${snapshot.connections.maxAgeDays} day(s)` : ""}
            />
            <StateCard
              title="Snapshot"
              subtitle="As of date"
              value={snapshot?.asOf ? softDate(snapshot.asOf) : loading ? "Loading…" : "—"}
            />
          </div>

          {/* Pressure */}
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Pressure signals</div>
              <div className="space-y-1 text-xs text-zinc-700">
                <div>{explanation?.pressure.structural ?? "Structural signal pending."}</div>
                <div>{explanation?.pressure.discretionary ?? "Discretionary signal pending."}</div>
                <div>{explanation?.pressure.timing ?? "Timing signal pending."}</div>
                <div>{explanation?.pressure.stability ?? "Stability signal pending."}</div>
              </div>
            </CardContent>
          </Card>

          {/* Supporting links */}
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
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
                <Link href="/money/in">
                  <Chip>In</Chip>
                </Link>
                <Link href="/money/out">
                  <Chip>Out</Chip>
                </Link>
                <Link href="/money/categories">
                  <Chip>Categories</Chip>
                </Link>
                <Link href="/money/rules">
                  <Chip>Rules</Chip>
                </Link>
              </div>
              <div className="text-xs text-zinc-500">
                Depth lives in these pages; Money is for calm orientation.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function StateCard({
  title,
  subtitle,
  value,
  detail,
}: {
  title: string;
  subtitle?: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="space-y-2">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        {subtitle ? <div className="text-xs text-zinc-500">{subtitle}</div> : null}
        <div className="text-lg font-semibold text-zinc-900">{value}</div>
        {detail ? <div className="text-xs text-zinc-500">{detail}</div> : null}
      </CardContent>
    </Card>
  );
}
