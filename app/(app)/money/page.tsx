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

const MONEY_SMART_INSIGHT_PREVIEW_KEY = "lifecfo:money-smart-insight-preview";

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
  transaction_outflows?: TransactionOutflowSummary;
  pattern_confirmations?: PatternConfirmation[];
};

type MoneyRow = {
  currency: string;
  cents: number;
};

type DetectedPattern = {
  pattern_key: string;
  label: string;
  occurrences: number;
  average_cents: number;
  currency: string;
  uncertain_label: boolean;
  cadence: string;
  confidence: "likely" | "low";
  source_provider: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};

type PatternConfirmationKind = "bill" | "income" | "transfer" | "ignore";

type PatternConfirmation = {
  id: string;
  pattern_key: string;
  kind: PatternConfirmationKind;
  label: string | null;
  amount_cents: number | null;
  currency: string;
  cadence: string | null;
  confidence: string | null;
  source_provider: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewPattern = DetectedPattern & {
  detected_kind: "bill" | "income";
  confirmation: PatternConfirmation | null;
};

type PatternConfirmationResponse = {
  confirmation: PatternConfirmation;
};

type TransactionOutflowSummary = {
  transaction_count: number;
  inflow_transaction_count: number;
  month_outflow_by_currency: MoneyRow[];
  month_inflow_by_currency: MoneyRow[];
  largest_outflows: Array<{ label: string; cents: number; currency: string; uncertain_label: boolean }>;
  largest_inflows: Array<{ label: string; cents: number; currency: string; uncertain_label: boolean }>;
  likely_regular_outflows: DetectedPattern[];
  likely_income: DetectedPattern[];
  has_unlabelled_repeated_outflows: boolean;
  has_unlabelled_repeated_income: boolean;
  source_note: string | null;
  confirmation_note: string | null;
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

function formatMoneyRows(rows: MoneyRow[]) {
  if (!rows.length) return "-";
  return rows.map((row) => formatMoney(row.cents, row.currency)).join(" | ");
}

function confirmedPatternSummary(
  patterns: PatternConfirmation[],
  singular: string,
  plural: string
): string {
  const count = patterns.length;
  if (!count) return `No ${plural} confirmed yet.`;
  const labels = patterns
    .map((pattern) => pattern.label?.trim())
    .filter((label): label is string => Boolean(label))
    .slice(0, 2);
  const lead = `You’ve confirmed ${count} ${count === 1 ? singular : plural}.`;
  return labels.length ? `${lead.slice(0, -1)}: ${labels.join(" and ")}.` : lead;
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

function sentence(input: string | null | undefined): string {
  const text = String(input || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function buildSmartInsight(
  explanation: SnapshotExplanation | undefined,
  interpretation: PressureInterpretation | undefined
): { headline: string; supporting: string } {
  if (!interpretation) {
    return {
      headline: explanation?.headline || "Pulling together your latest household money picture...",
      supporting: explanation?.summary || "Already reading your latest income, commitments, and timing so this view lands grounded.",
    };
  }

  const main = interpretation.main_pressure;
  if (main.key === "none") {
    return {
      headline: "Your money picture looks fairly steady right now.",
      supporting:
        "No single pressure point is standing out, so day-to-day money should feel more even.",
    };
  }

  if (main.key === "structural") {
    return {
      headline: "Regular commitments are creating most of the pressure right now.",
      supporting: joinNonEmptyWithSpace([
        sentence(main.why_now),
        "That usually leaves less breathing room between pay cycles.",
      ]),
    };
  }

  if (main.key === "discretionary") {
    return {
      headline: "Recent spending drift is the main pressure right now.",
      supporting: joinNonEmptyWithSpace([
        sentence(main.why_now),
        "That can make leftover cash feel thinner week to week.",
      ]),
    };
  }

  if (main.key === "timing") {
    return {
      headline: "Cash-flow timing is the main pressure point right now.",
      supporting: joinNonEmptyWithSpace([
        sentence(main.why_now),
        "That can make parts of the month feel tighter even when totals look manageable.",
      ]),
    };
  }

  return {
    headline: "Data freshness or income stability is the main uncertainty right now.",
    supporting: joinNonEmptyWithSpace([
      sentence(main.why_now),
      "That can make the overall picture feel less certain from one week to the next.",
    ]),
  };
}

function ReviewPatternCard({
  pattern,
  saving,
  onSave,
}: {
  pattern: ReviewPattern;
  saving: boolean;
  onSave: (
    pattern: ReviewPattern,
    kind: PatternConfirmationKind,
    label?: string | null
  ) => Promise<boolean>;
}) {
  const [naming, setNaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const confirmed =
    pattern.confirmation?.kind === "bill" ||
    pattern.confirmation?.kind === "income" ||
    pattern.confirmation?.kind === "transfer";

  const startNaming = () => {
    setNameDraft(pattern.confirmation?.label || pattern.label);
    setNaming(true);
  };

  const saveName = () => {
    const label = nameDraft.trim();
    if (!label) return;
    const kind =
      pattern.confirmation && pattern.confirmation.kind !== "ignore"
        ? pattern.confirmation.kind
        : pattern.detected_kind;
    void onSave(pattern, kind, label).then((saved) => {
      if (saved) setNaming(false);
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm font-medium text-zinc-900">{pattern.label}</div>
        {confirmed ? (
          <div className="text-xs font-medium text-emerald-700">Confirmed</div>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-zinc-600">
        This looks regular: about {formatMoney(pattern.average_cents, pattern.currency)}{" "}
        {pattern.cadence}.
      </div>

      {naming ? (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveName();
          }}
        >
          <input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            maxLength={160}
            autoFocus
            aria-label="Pattern name"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-brand-aqua"
          />
          <Chip onClick={saveName} disabled={saving || !nameDraft.trim()}>
            Save
          </Chip>
          <Chip onClick={() => setNaming(false)} disabled={saving}>
            Cancel
          </Chip>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip
            active={pattern.confirmation?.kind === "bill"}
            onClick={() => void onSave(pattern, "bill")}
            disabled={saving}
          >
            Confirm as bill
          </Chip>
          <Chip
            active={pattern.confirmation?.kind === "income"}
            onClick={() => void onSave(pattern, "income")}
            disabled={saving}
          >
            Confirm as income
          </Chip>
          <Chip onClick={() => void onSave(pattern, "ignore")} disabled={saving}>
            Ignore
          </Chip>
          <Chip onClick={startNaming} disabled={saving}>
            Give this a name
          </Chip>
        </div>
      )}
    </div>
  );
}

export default function MoneyClientNext() {
  const router = useRouter();
  const { showToast } = useToast();
  const { openAsk, setDraft } = useAsk();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);
  const [savingPatternKey, setSavingPatternKey] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const snapshot = data?.snapshot;
  const explanation = data?.explanation;
  const interpretation = explanation?.interpretation;
  const transactionOutflows = data?.transaction_outflows;
  const confirmationsByPatternKey = new Map(
    (data?.pattern_confirmations ?? []).map((confirmation) => [
      confirmation.pattern_key,
      confirmation,
    ])
  );
  const detectedPatternsByKey = new Map(
    [
      ...(transactionOutflows?.likely_regular_outflows ?? []),
      ...(transactionOutflows?.likely_income ?? []),
    ].map((pattern) => [pattern.pattern_key, pattern])
  );
  const confirmedPatterns = (data?.pattern_confirmations ?? []).map((confirmation) => ({
    ...confirmation,
    label:
      confirmation.label || detectedPatternsByKey.get(confirmation.pattern_key)?.label || null,
  }));
  const confirmedBills = confirmedPatterns.filter(
    (confirmation) => confirmation.kind === "bill"
  );
  const confirmedIncome = confirmedPatterns.filter(
    (confirmation) => confirmation.kind === "income"
  );
  const mergePatterns = (
    patterns: DetectedPattern[],
    detectedKind: "bill" | "income"
  ): ReviewPattern[] =>
    patterns
      .map((pattern) => {
        const confirmation = confirmationsByPatternKey.get(pattern.pattern_key) ?? null;
        return {
          ...pattern,
          label: confirmation?.label || pattern.label,
          detected_kind: detectedKind,
          confirmation,
        };
      })
      .filter((pattern) => pattern.confirmation === null);
  const reviewPayments = mergePatterns(
    transactionOutflows?.likely_regular_outflows ?? [],
    "bill"
  );
  const reviewIncome = mergePatterns(transactionOutflows?.likely_income ?? [], "income");
  const hasPendingReviewItems = reviewPayments.length > 0 || reviewIncome.length > 0;

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

  const savePatternConfirmation = async (
    pattern: ReviewPattern,
    kind: PatternConfirmationKind,
    label?: string | null
  ): Promise<boolean> => {
    setSavingPatternKey(pattern.pattern_key);
    setConfirmationError(null);

    try {
      const response = await fetch("/api/money/pattern-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern_key: pattern.pattern_key,
          kind,
          label: label === undefined ? pattern.confirmation?.label ?? null : label,
          amount_cents: pattern.average_cents,
          currency: pattern.currency,
          cadence: pattern.cadence,
          confidence: pattern.confidence,
          source_provider: pattern.source_provider,
          first_seen_at: pattern.first_seen_at,
          last_seen_at: pattern.last_seen_at,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as Partial<
        PatternConfirmationResponse & { error: string }
      >;

      if (!response.ok || !json.confirmation) {
        throw new Error(json.error || "We could not save that just now.");
      }

      setData((current) => {
        if (!current) return current;
        const previous = current.pattern_confirmations ?? [];
        return {
          ...current,
          pattern_confirmations: [
            json.confirmation as PatternConfirmation,
            ...previous.filter(
              (confirmation) => confirmation.pattern_key !== pattern.pattern_key
            ),
          ],
        };
      });

      const message = kind === "ignore" ? "Ignored" : label !== undefined ? "Name saved" : "Confirmed";
      showToast({ message }, 1800);
      return true;
    } catch (saveError: unknown) {
      const message = getErrorMessage(saveError, "We could not save that just now.");
      setConfirmationError(message);
      return false;
    } finally {
      setSavingPatternKey(null);
    }
  };

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

  const smartInsight = buildSmartInsight(explanation, interpretation);
  const openAskFromMoney = useCallback(() => {
    try {
      if (smartInsight.headline && smartInsight.headline !== "Your money picture is loading.") {
        window.sessionStorage.setItem(
          MONEY_SMART_INSIGHT_PREVIEW_KEY,
          JSON.stringify({
            headline: smartInsight.headline,
            supporting: smartInsight.supporting,
          })
        );
      }
    } catch {
      // ignore storage availability issues
    }
    openAsk();
  }, [openAsk, smartInsight.headline, smartInsight.supporting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!smartInsight.headline || smartInsight.headline === "Your money picture is loading.") {
        window.sessionStorage.removeItem(MONEY_SMART_INSIGHT_PREVIEW_KEY);
        return;
      }
      window.sessionStorage.setItem(
        MONEY_SMART_INSIGHT_PREVIEW_KEY,
        JSON.stringify({
          headline: smartInsight.headline,
          supporting: smartInsight.supporting,
        })
      );
    } catch {
      // ignore storage availability issues
    }
  }, [smartInsight.headline, smartInsight.supporting]);

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
              <button
                type="button"
                onClick={openAskFromMoney}
                className="w-full text-left text-sm leading-relaxed text-zinc-800 transition-colors hover:text-zinc-900"
              >
                {smartInsight.headline}
              </button>
              <button
                type="button"
                onClick={openAskFromMoney}
                className="w-full text-left text-xs leading-relaxed text-zinc-500 transition-colors hover:text-zinc-600"
              >
                {smartInsight.supporting}
              </button>
              <button
                type="button"
                onClick={openAskFromMoney}
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
              {transactionOutflows?.source_note ? (
                <div className="text-xs text-zinc-500">{transactionOutflows.source_note}</div>
              ) : null}
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

          {transactionOutflows ? (
            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Review what Life CFO found</div>
                  <div className="mt-1 text-xs leading-relaxed text-zinc-600">
                    These items look regular from your connected bank data. Confirming them here does not change your bills or income.
                  </div>
                </div>

                {hasPendingReviewItems ? (
                  <>
                    {reviewPayments.slice(0, 3).map((pattern) => (
                      <ReviewPatternCard
                        key={pattern.pattern_key}
                        pattern={pattern}
                        saving={savingPatternKey === pattern.pattern_key}
                        onSave={savePatternConfirmation}
                      />
                    ))}

                    {reviewIncome.slice(0, 3).map((pattern) => (
                      <ReviewPatternCard
                        key={pattern.pattern_key}
                        pattern={pattern}
                        saving={savingPatternKey === pattern.pattern_key}
                        onSave={savePatternConfirmation}
                      />
                    ))}
                  </>
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm leading-relaxed text-zinc-700">
                    You’re all caught up. Life CFO will keep watching for regular money patterns.
                  </div>
                )}

                {confirmationError ? (
                  <div className="text-xs text-red-600">{confirmationError}</div>
                ) : null}

                <div className="text-xs leading-relaxed text-zinc-500">
                  Confirmed patterns are remembered and can be used in future summaries.
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <FlowCard
              title="In"
              rows={[
                confirmedPatternSummary(confirmedIncome, "income pattern", "income patterns"),
                `Regular income you’ve set up: ${snapshot ? formatMoney(snapshot.income.recurringMonthlyCents) : loading ? "Loading..." : "-"}`,
                transactionOutflows?.month_inflow_by_currency?.length
                  ? `Observed money in this month: ${formatMoneyRows(
                      transactionOutflows.month_inflow_by_currency
                    )}.`
                  : snapshot
                    ? `${snapshot.income.sourceCount} regular income source(s) set up.`
                    : "Income sources will show here.",
                reviewIncome[0]
                  ? `This looks regular: ${reviewIncome[0].label}, about ${formatMoney(
                      reviewIncome[0].average_cents,
                      reviewIncome[0].currency
                    )} each time.`
                  : "Repeated income will appear here when the transaction pattern is clear.",
                explanation?.pressure.timing || "Income timing notes will appear here.",
              ]}
              note={
                snapshot?.income.sourceCount === 0 && transactionOutflows?.inflow_transaction_count
                  ? "Connected money in is available. It stays observed until you confirm an income pattern."
                  : "See income details and recent money in."
              }
              links={[
                { href: "/money/in", label: "Open In" },
                { href: "/transactions", label: "Transactions" },
              ]}
            />

            <FlowCard
              title="Out"
              rows={[
                confirmedPatternSummary(confirmedBills, "regular payment", "regular payments"),
                `Regular payments you’ve set up: ${snapshot ? formatMoney(snapshot.commitments.recurringMonthlyCents) : loading ? "Loading..." : "-"}`,
                snapshot
                  ? snapshot.commitments.billCount > 0
                    ? `${snapshot.commitments.billCount} bill(s) set up.`
                    : "No bills are set up yet."
                  : "Bill coverage will show here.",
                transactionOutflows?.month_outflow_by_currency?.length
                  ? `Observed money out this month: ${formatMoneyRows(
                      transactionOutflows.month_outflow_by_currency
                    )}.`
                  : latestImported
                    ? `Latest imported payment: ${latestImportedName} (${latestImportedAmount}).`
                    : `Flexible spending (30 days): ${snapshot ? formatMoney(snapshot.discretionary.last30DayOutflowCents) : loading ? "Loading..." : "-"}`,
                reviewPayments[0]
                  ? `This looks regular: ${reviewPayments[0].label}, about ${formatMoney(
                      reviewPayments[0].average_cents,
                      reviewPayments[0].currency
                    )} each time.`
                  : "Repeated payments will appear here when the transaction labels are clear.",
              ]}
              note={
                snapshot?.commitments.billCount === 0 && transactionOutflows?.transaction_count
                  ? "Connected transactions are available. No bills are set up yet, so this starts with recent money out."
                  : explanation?.pressure.structural || "Spending pressure notes will appear here."
              }
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
