"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, MeterBar, MiniSignal, useToast } from "@/components/ui";
import { useAsk } from "@/components/ask/AskProvider";
import type { PressureInterpretation } from "@/lib/money/reasoning/interpretPressure";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { joinNonEmptyWithSpace } from "@/lib/ask/responseComposition";
import type { MiniSignalLevel } from "@/components/ui/MiniSignal";

type FinancialSnapshot = {
  asOf: string;
  liquidity: { availableCashCents: number; accountCount: number };
  income: { recurringMonthlyCents: number; sourceCount: number };
  commitments: { recurringMonthlyCents: number; billCount: number };
  discretionary: { last30DayOutflowCents: number };
  connections: { total: number; stale: number; maxAgeDays: number };
  pressure: {
    structural_pressure: { level: "none" | "low" | "medium" | "high"; summary: string };
    discretionary_drift: { level: "none" | "low" | "medium" | "high"; summary: string };
    timing_mismatch: { level: "none" | "low" | "medium" | "high"; summary: string };
    stability_risk: { level: "none" | "low" | "medium" | "high"; summary: string };
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
  interpretation?: PressureInterpretation;
};

type OverviewResponse = {
  snapshot: FinancialSnapshot;
  explanation: SnapshotExplanation;
};

type TransactionRow = {
  id: string;
  date: string | null;
  description: string | null;
  merchant: string | null;
  amount_cents: number | null;
  currency: string | null;
  provider: string | null;
};

type TransactionsResponse = {
  transactions?: TransactionRow[];
};

function formatMoney(cents: number | undefined | null, currency = "AUD") {
  return formatMoneyFromCents(cents, currency);
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

function toMiniSignalLevel(level: "none" | "low" | "medium" | "high"): MiniSignalLevel {
  if (level === "none") return "steady";
  if (level === "low") return "low";
  if (level === "medium") return "moderate";
  return "high";
}

export default function MoneyClientNext() {
  const router = useRouter();
  const { showToast } = useToast();
  const { openAsk, setDraft } = useAsk();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);

  const snapshot = data?.snapshot;
  const explanation = data?.explanation;
  const interpretation = explanation?.interpretation;

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const overview = await fetchJson<OverviewResponse>("/api/money/overview");
      setData(overview);

      try {
        const tx = await fetchJson<TransactionsResponse>("/api/money/transactions?limit=6");
        setRecentTransactions((tx.transactions ?? []).slice(0, 6));
      } catch {
        setRecentTransactions([]);
      }
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

  const openWithQuestion = (q: string) => {
    setDraft(q);
    openAsk();
  };

  const importedRecent = recentTransactions.filter((t) => {
    const provider = String(t.provider || "").toLowerCase();
    return provider !== "" && provider !== "manual";
  });

  const latestImported = importedRecent[0] ?? null;
  const latestImportedName =
    latestImported?.merchant || latestImported?.description || "Recent transaction";
  const latestImportedAmount = formatMoney(
    Math.abs(Number(latestImported?.amount_cents ?? 0)),
    latestImported?.currency || "AUD"
  );

  const connectionFreshnessLine = snapshot
    ? snapshot.connections.total === 0
      ? "No live connections yet."
      : snapshot.connections.stale === 0
        ? `All ${snapshot.connections.total} connection(s) look recent.`
        : `${snapshot.connections.stale} of ${snapshot.connections.total} connection(s) may need a refresh.`
    : "Connection freshness will show here.";

  const askAboutDataQuestion =
    snapshot?.connections.total && snapshot.connections.stale > 0
      ? "How much could stale connection data be affecting this view?"
      : latestImported
        ? "What changed in our recent imported spending?"
        : "Are we okay this month?";

  const committedIncomePercent =
    snapshot && snapshot.income.recurringMonthlyCents > 0
      ? Math.round(
          (Math.max(0, snapshot.commitments.recurringMonthlyCents) /
            snapshot.income.recurringMonthlyCents) *
            100
        )
      : null;

  const smartInsightLine = interpretation
    ? interpretation.main_pressure.key === "none"
      ? explanation?.summary || "Your latest data looks fairly balanced overall."
      : joinNonEmptyWithSpace([
          interpretation.main_pressure.summary,
          interpretation.main_pressure.why_now || "",
        ])
    : explanation?.summary || "Your latest data is loading.";

  const smartInsightSubtle = "Based on your latest data.";

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
            <CardContent className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                How things are looking right now
              </div>
              <div className="text-sm leading-relaxed text-zinc-800">{smartInsightLine}</div>
              <div className="text-xs text-zinc-500">{smartInsightSubtle}</div>
              <button
                type="button"
                onClick={openAsk}
                className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline"
              >
                If you want to go deeper, just ask.
              </button>
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
              <MeterBar
                label="Committed income"
                value={snapshot?.commitments.recurringMonthlyCents ?? 0}
                total={snapshot?.income.recurringMonthlyCents ?? 0}
                valueLabel={snapshot ? formatMoney(snapshot.commitments.recurringMonthlyCents) : undefined}
                totalLabel={snapshot ? formatMoney(snapshot.income.recurringMonthlyCents) : undefined}
              />
              <div className="text-xs leading-relaxed text-zinc-600">
                {committedIncomePercent === null
                  ? "Monthly commitments use 0% of recurring income"
                  : `Monthly commitments use ${committedIncomePercent}% of recurring income`}
              </div>
              {snapshot ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniSignal
                    label="Structural pressure"
                    level={toMiniSignalLevel(snapshot.pressure.structural_pressure.level)}
                    summary={snapshot.pressure.structural_pressure.summary}
                  />
                  <MiniSignal
                    label="Discretionary pressure"
                    level={toMiniSignalLevel(snapshot.pressure.discretionary_drift.level)}
                    summary={snapshot.pressure.discretionary_drift.summary}
                  />
                  <MiniSignal
                    label="Timing pressure"
                    level={toMiniSignalLevel(snapshot.pressure.timing_mismatch.level)}
                    summary={snapshot.pressure.timing_mismatch.summary}
                  />
                  <MiniSignal
                    label="Income stability"
                    level={toMiniSignalLevel(snapshot.pressure.stability_risk.level)}
                    summary={snapshot.pressure.stability_risk.summary}
                  />
                </div>
              ) : null}
              {interpretation ? (
                <div className="text-xs leading-relaxed text-zinc-600">
                  {`Main pressure now: ${interpretation.main_pressure.summary} ${interpretation.main_pressure.why_now}`}
                </div>
              ) : null}
              <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-600">
                {(explanation?.insights ?? []).slice(0, 3).map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
                {!loading && (!explanation?.insights || explanation.insights.length === 0) ? (
                  <li>No highlights yet.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Connected data</div>
              <div className="text-xs text-zinc-600">
                {latestImported
                  ? `Latest imported activity: ${latestImportedName} ${softDate(
                      latestImported.date
                    )} (${latestImportedAmount}).`
                  : snapshot?.connections.total
                    ? "Connected data is available. New imported activity will appear here."
                    : "Connect a bank to bring in recent account and transaction activity."}
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-600">
                <li>{connectionFreshnessLine}</li>
                <li>
                  Showing {Math.min(6, recentTransactions.length)} recent transaction(s), with{" "}
                  {importedRecent.length} imported from connected providers.
                </li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <Chip onClick={() => openWithQuestion(askAboutDataQuestion)}>
                  Ask about this data
                </Chip>
                <Link href="/transactions">
                  <Chip>Open transactions</Chip>
                </Link>
                <Link href="/connections">
                  <Chip>Manage connections</Chip>
                </Link>
              </div>
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
                latestImported
                  ? `Latest imported outflow cue: ${latestImportedName} (${latestImportedAmount}).`
                  : `Flexible spending (30 days): ${snapshot ? formatMoney(snapshot.discretionary.last30DayOutflowCents) : loading ? "Loading..." : "-"}`,
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
