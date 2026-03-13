"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Button, Card, CardContent, Chip, useToast } from "@/components/ui";
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

export default function MoneyClientNext() {
  const router = useRouter();
  const { showToast } = useToast();
  const { openAsk, setDraft } = useAsk();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);

  const snapshot = data?.snapshot;
  const explanation = data?.explanation;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetchJson<OverviewResponse>("/api/money/overview");
      setData(res);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Unable to load money overview.");
      setError(message);
      if (!silent) showToast({ message }, 2500);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const askExamples = [
    "Are we okay this month?",
    "Why does money feel tight right now?",
    "What is coming up this month?",
    "Can we afford this?",
  ];

  const openWithQuestion = (q: string) => {
    setDraft(q);
    openAsk();
  };

  return (
    <Page title="Money" subtitle="A calm view of money coming in, going out, saved, and planned.">
      <div className="mx-auto w-full max-w-[980px] px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Chip title="As of">
            {snapshot?.asOf ? `As of ${softDate(snapshot.asOf)}` : loading ? "Loading..." : "No date"}
          </Chip>
          <div className="flex flex-wrap items-center gap-2">
            <Chip onClick={() => void refresh(false)}>Refresh</Chip>
            <Chip onClick={() => router.push("/connections")}>Connect accounts</Chip>
          </div>
        </div>

        {error ? <div className="mt-4 text-sm text-red-600">{error}</div> : null}

        <div className="mt-5 grid gap-4">
          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Start with a money question</div>
                <div className="text-xs text-zinc-500">
                  Ask first for a quick read, then use In, Out, Saved, and Planned below for detail.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={openAsk} className="rounded-2xl">
                  Ask about money
                </Button>
                <Link href="/money/planned">
                  <Chip>Planned</Chip>
                </Link>
                <Link href="/connections">
                  <Chip>Connections</Chip>
                </Link>
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

          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">
                {explanation?.headline || (loading ? "Loading..." : "Money at a glance")}
              </div>
              <div className="text-xs leading-relaxed text-zinc-600">
                {explanation?.summary ||
                  (loading
                    ? "Loading..."
                    : "This page gives a short view of your household money right now.")}
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-600">
                {(explanation?.insights ?? []).slice(0, 2).map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
                {!loading && (!explanation?.insights || explanation.insights.length === 0) ? (
                  <li>No highlights yet.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <FlowCard
              title="In"
              rows={[
                `Recurring income: ${snapshot ? formatMoney(snapshot.income.recurringMonthlyCents) : loading ? "Loading..." : "-"}`,
                snapshot
                  ? `${snapshot.income.sourceCount} recurring source(s) tracked.`
                  : "Income sources will show here.",
                explanation?.pressure.timing || "Income timing notes will appear here.",
              ]}
              note="See income details and recent inflows."
              links={[
                { href: "/money/in", label: "Open In" },
                { href: "/transactions", label: "Transactions" },
              ]}
            />

            <FlowCard
              title="Out"
              rows={[
                `Recurring commitments: ${snapshot ? formatMoney(snapshot.commitments.recurringMonthlyCents) : loading ? "Loading..." : "-"}`,
                snapshot
                  ? `${snapshot.commitments.billCount} bill(s) mapped.`
                  : "Bill coverage will show here.",
                `Flexible spending (30 days): ${snapshot ? formatMoney(snapshot.discretionary.last30DayOutflowCents) : loading ? "Loading..." : "-"}`,
              ]}
              note={explanation?.pressure.structural || "Spending pressure notes will appear here."}
              links={[
                { href: "/money/out", label: "Open Out" },
                { href: "/bills", label: "Bills" },
              ]}
            />

            <FlowCard
              title="Saved"
              rows={[
                `Available cash: ${snapshot ? formatMoney(snapshot.liquidity.availableCashCents) : loading ? "Loading..." : "-"}`,
                snapshot
                  ? `${snapshot.liquidity.accountCount} account(s) included.`
                  : "Saved position will show here.",
                snapshot
                  ? `${snapshot.connections.stale} of ${snapshot.connections.total} connection(s) are stale.`
                  : "Connection freshness will show here.",
              ]}
              note={explanation?.pressure.stability || "Stability notes will appear here."}
              links={[
                { href: "/money/saved", label: "Open Saved" },
                { href: "/accounts", label: "Accounts" },
              ]}
            />

            <FlowCard
              title="Planned"
              rows={[
                snapshot
                  ? `Snapshot date: ${softDate(snapshot.asOf)}`
                  : loading
                    ? "Loading..."
                    : "No snapshot date yet.",
                explanation?.pressure.timing || "Upcoming timing notes will appear here.",
                explanation?.pressure.discretionary || "Plan updates will appear here.",
              ]}
              note="Use planned pages for goals, commitments, and next steps."
              links={[
                { href: "/money/planned", label: "Open Planned" },
                { href: "/money/goals", label: "Goals" },
              ]}
            />
          </div>
        </div>
      </div>
    </Page>
  );
}

function FlowCard({
  title,
  rows,
  note,
  links,
}: {
  title: string;
  rows: string[];
  note?: string;
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="space-y-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <ul className="space-y-1 text-xs text-zinc-700">
          {rows.slice(0, 3).map((row, idx) => (
            <li key={idx}>{row}</li>
          ))}
        </ul>
        {note ? <div className="text-xs text-zinc-500">{note}</div> : null}
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link key={`${title}_${link.href}_${link.label}`} href={link.href}>
              <Chip>{link.label}</Chip>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
