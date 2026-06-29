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
import type { MoneyDataCoverage } from "@/lib/money/reasoning/types";

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
  recent_transactions?: TransactionRow[];
  data_coverage?: MoneyDataCoverage;
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

type PatternConfirmationWrite = Omit<
  PatternConfirmation,
  "id" | "created_at" | "updated_at"
>;

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

function formatMoney(cents: number | undefined | null, currency = "AUD") {
  return formatMoneyFromCents(cents, currency);
}

function formatMoneyRows(rows: MoneyRow[]) {
  if (!rows.length) return "-";
  return rows.map((row) => formatMoney(row.cents, row.currency)).join(" | ");
}

function sourceNames(coverage: MoneyDataCoverage | undefined, key: "included_sources" | "reference_only_sources") {
  const names = (coverage?.[key] ?? []).map(
    (source) => source.provider.charAt(0).toUpperCase() + source.provider.slice(1)
  );
  return names.length ? names.join(" and ") : "none";
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
        "No single concern is standing out, so day-to-day money should feel more even.",
    };
  }

  if (main.key === "structural") {
    return {
      headline: "Regular commitments are taking up most of the room right now.",
      supporting: joinNonEmptyWithSpace([
        sentence(main.why_now),
        "That usually leaves less breathing room between pay cycles.",
      ]),
    };
  }

  if (main.key === "discretionary") {
    return {
      headline: "Recent spending has shifted the most right now.",
      supporting: joinNonEmptyWithSpace([
        sentence(main.why_now),
        "That can make leftover cash feel thinner week to week.",
      ]),
    };
  }

  if (main.key === "timing") {
    return {
      headline: "The timing of money in and bills matters most right now.",
      supporting: joinNonEmptyWithSpace([
        sentence(main.why_now),
        "That can make parts of the month feel tighter even when totals look manageable.",
      ]),
    };
  }

  return {
    headline: "Some income or connection details need a closer look.",
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

function ReviewedPatternItem({
  confirmation,
  displayLabel,
  saving,
  onSave,
  onReset,
}: {
  confirmation: PatternConfirmation;
  displayLabel: string;
  saving: boolean;
  onSave: (
    confirmation: PatternConfirmation,
    kind: PatternConfirmationKind,
    label?: string | null
  ) => Promise<boolean>;
  onReset: (confirmation: PatternConfirmation) => Promise<boolean>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const kindLabel =
    confirmation.kind === "bill"
      ? "Regular payment"
      : confirmation.kind === "income"
        ? "Income"
        : confirmation.kind === "ignore"
          ? "Ignored"
          : "Transfer";
  const status =
    confirmation.kind === "ignore"
      ? "Ignored"
      : confirmation.kind === "transfer"
        ? "Reviewed"
        : "Confirmed";

  const startRenaming = () => {
    setNameDraft(confirmation.label || displayLabel);
    setRenaming(true);
  };

  const saveName = () => {
    const label = nameDraft.trim();
    if (!label) return;
    void onSave(confirmation, confirmation.kind, label).then((saved) => {
      if (saved) setRenaming(false);
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-zinc-900">{displayLabel}</div>
          <div className="mt-1 text-xs text-zinc-600">
            {kindLabel}
            {typeof confirmation.amount_cents === "number"
              ? ` · ${formatMoney(confirmation.amount_cents, confirmation.currency)}`
              : ""}
          </div>
        </div>
        <div className="text-xs font-medium text-zinc-600">{status}</div>
      </div>

      {renaming ? (
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
            aria-label="Reviewed pattern name"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-brand-aqua"
          />
          <Chip onClick={saveName} disabled={saving || !nameDraft.trim()}>
            Save
          </Chip>
          <Chip onClick={() => setRenaming(false)} disabled={saving}>
            Cancel
          </Chip>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip onClick={startRenaming} disabled={saving}>
            Rename
          </Chip>
          <Chip
            onClick={() => void onSave(confirmation, "bill")}
            disabled={saving || confirmation.kind === "bill"}
          >
            Change to regular payment
          </Chip>
          <Chip
            onClick={() => void onSave(confirmation, "income")}
            disabled={saving || confirmation.kind === "income"}
          >
            Change to income
          </Chip>
          <Chip
            onClick={() => void onSave(confirmation, "ignore")}
            disabled={saving || confirmation.kind === "ignore"}
          >
            Ignore
          </Chip>
          <Chip onClick={() => void onReset(confirmation)} disabled={saving}>
            Put back for review
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
  const [savingPatternKey, setSavingPatternKey] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [reviewedPatternsOpen, setReviewedPatternsOpen] = useState(false);

  const snapshot = data?.snapshot;
  const explanation = data?.explanation;
  const interpretation = explanation?.interpretation;
  const transactionOutflows = data?.transaction_outflows;
  const dataCoverage = data?.data_coverage;
  const recentTransactions = data?.recent_transactions ?? [];
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
  const reviewedPatterns = data?.pattern_confirmations ?? [];
  const displayLabelForConfirmation = (confirmation: PatternConfirmation): string =>
    confirmation.label ||
    detectedPatternsByKey.get(confirmation.pattern_key)?.label ||
    (confirmation.kind === "bill"
      ? "Regular payment"
      : confirmation.kind === "income"
        ? "Income pattern"
        : confirmation.kind === "ignore"
          ? "Ignored pattern"
          : "Transfer");
  const confirmedBills = reviewedPatterns.filter(
    (confirmation) => confirmation.kind === "bill"
  );
  const confirmedIncome = reviewedPatterns.filter(
    (confirmation) => confirmation.kind === "income"
  );
  const reviewedIgnored = reviewedPatterns.filter(
    (confirmation) => confirmation.kind === "ignore" || confirmation.kind === "transfer"
  );
  const reviewedGroups = [
    { title: "Regular payments", items: confirmedBills },
    { title: "Income", items: confirmedIncome },
    { title: "Ignored", items: reviewedIgnored },
  ];
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
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Unable to load money overview.");
      setError(message);
      if (!silent) showToast({ message }, 2500);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  const upsertPatternConfirmation = async (
    input: PatternConfirmationWrite,
    successMessage: string
  ): Promise<boolean> => {
    setSavingPatternKey(input.pattern_key);
    setConfirmationError(null);

    try {
      const response = await fetch("/api/money/pattern-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
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
              (confirmation) => confirmation.pattern_key !== input.pattern_key
            ),
          ],
        };
      });

      showToast({ message: successMessage }, 1800);
      return true;
    } catch (saveError: unknown) {
      const message = getErrorMessage(saveError, "We could not save that just now.");
      setConfirmationError(message);
      return false;
    } finally {
      setSavingPatternKey(null);
    }
  };

  const savePatternConfirmation = (
    pattern: ReviewPattern,
    kind: PatternConfirmationKind,
    label?: string | null
  ): Promise<boolean> =>
    upsertPatternConfirmation(
      {
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
      },
      kind === "ignore" ? "Ignored" : label !== undefined ? "Name saved" : "Confirmed"
    );

  const saveReviewedPattern = (
    confirmation: PatternConfirmation,
    kind: PatternConfirmationKind,
    label?: string | null
  ): Promise<boolean> =>
    upsertPatternConfirmation(
      {
        pattern_key: confirmation.pattern_key,
        kind,
        label: label === undefined ? confirmation.label : label,
        amount_cents: confirmation.amount_cents,
        currency: confirmation.currency,
        cadence: confirmation.cadence,
        confidence: confirmation.confidence,
        source_provider: confirmation.source_provider,
        first_seen_at: confirmation.first_seen_at,
        last_seen_at: confirmation.last_seen_at,
      },
      label !== undefined ? "Name saved" : kind === "ignore" ? "Ignored" : "Saved"
    );

  const putPatternBackForReview = async (
    confirmation: PatternConfirmation
  ): Promise<boolean> => {
    setSavingPatternKey(confirmation.pattern_key);
    setConfirmationError(null);

    try {
      const response = await fetch("/api/money/pattern-confirmations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern_key: confirmation.pattern_key }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "We could not put that back for review just now.");
      }

      setData((current) =>
        current
          ? {
              ...current,
              pattern_confirmations: (current.pattern_confirmations ?? []).filter(
                (item) => item.pattern_key !== confirmation.pattern_key
              ),
            }
          : current
      );
      showToast({ message: "Put back for review" }, 1800);
      return true;
    } catch (resetError: unknown) {
      setConfirmationError(
        getErrorMessage(resetError, "We could not put that back for review just now.")
      );
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

  const askAboutDataQuestion =
    latestImported
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
                    label="Regular money picture"
                    level={toMiniSignalLevel(snapshot.pressure.structural_pressure.level)}
                    summary={snapshot.pressure.structural_pressure.summary}
                  />
                  <MiniSignal
                    label="Recent spending"
                    level={toMiniSignalLevel(snapshot.pressure.discretionary_drift.level)}
                    summary={snapshot.pressure.discretionary_drift.summary}
                  />
                  <MiniSignal
                    label="Upcoming timing"
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
              <div className="text-sm font-semibold text-zinc-900">What Life CFO can see</div>
              <div className="text-xs text-zinc-600">
                {dataCoverage && (dataCoverage.account_count > 0 || dataCoverage.transaction_count > 0)
                  ? dataCoverage.has_demo_sources
                    ? "Demo data is available."
                    : "Connected bank data is available."
                  : "Connect a bank to bring account balances and recent transactions into view."}
              </div>
              <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-600">
                <li>
                  Life CFO can see {dataCoverage?.account_count ?? 0} account(s) and{" "}
                  {dataCoverage?.transaction_count ?? 0} recent transaction(s) in this view.
                </li>
                <li>Money in this month: {formatMoneyRows(dataCoverage?.current_month_money_in ?? [])}.</li>
                <li>Money out this month: {formatMoneyRows(dataCoverage?.current_month_money_out ?? [])}.</li>
                <li>Included sources: {sourceNames(dataCoverage, "included_sources")}.</li>
                {dataCoverage?.has_reference_only_sources ? (
                  <li>
                    Older or unavailable sources ({sourceNames(dataCoverage, "reference_only_sources")}) are kept for reference and are not leading this view.
                  </li>
                ) : null}
              </ul>
              <div className="text-xs text-zinc-500">
                {dataCoverage?.label_quality_note || "Transaction name quality will appear here."}
              </div>
              {dataCoverage?.latest_transaction_date ? (
                <div className="text-xs text-zinc-500">
                  Latest transaction used: {softDate(dataCoverage.latest_transaction_date)}.
                </div>
              ) : null}
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
                    These items look regular from {dataCoverage?.has_demo_sources ? "your demo data" : "your connected bank data"}. Confirming them here does not change your bills or income.
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

          <Card className="border-zinc-200 bg-white">
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    Reviewed money patterns
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-zinc-600">
                    These are the regular payments and income patterns you’ve reviewed from {dataCoverage?.has_demo_sources ? "demo data" : "connected bank data"}.
                  </div>
                </div>
                <Chip onClick={() => setReviewedPatternsOpen((open) => !open)}>
                  {reviewedPatternsOpen ? "Hide reviewed patterns" : "View reviewed patterns"}
                </Chip>
              </div>

              {reviewedPatternsOpen ? (
                reviewedPatterns.length ? (
                  <div className="space-y-4">
                    {reviewedGroups.map((group) =>
                      group.items.length ? (
                        <div key={group.title} className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            {group.title}
                          </div>
                          {group.items.map((confirmation) => (
                            <ReviewedPatternItem
                              key={confirmation.pattern_key}
                              confirmation={confirmation}
                              displayLabel={displayLabelForConfirmation(confirmation)}
                              saving={savingPatternKey === confirmation.pattern_key}
                              onSave={saveReviewedPattern}
                              onReset={putPatternBackForReview}
                            />
                          ))}
                        </div>
                      ) : null
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
                    No reviewed money patterns yet.
                  </div>
                )
              ) : null}

              {reviewedPatternsOpen && confirmationError ? (
                <div className="text-xs text-red-600">{confirmationError}</div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <FlowCard
              title="In"
              rows={[
                transactionOutflows?.month_inflow_by_currency?.length
                  ? `Observed money in this month: ${formatMoneyRows(
                      transactionOutflows.month_inflow_by_currency
                    )}.`
                  : snapshot
                    ? `${snapshot.income.sourceCount} regular income source(s) set up.`
                    : "Income sources will show here.",
                confirmedPatternSummary(confirmedIncome, "income pattern", "income patterns"),
                `Regular income you’ve set up: ${snapshot ? formatMoney(snapshot.income.recurringMonthlyCents) : loading ? "Loading..." : "-"}`,
                reviewIncome[0]
                  ? `This looks regular: ${reviewIncome[0].label}, about ${formatMoney(
                      reviewIncome[0].average_cents,
                      reviewIncome[0].currency
                    )} each time.`
                  : "Repeated income will appear here when the transaction pattern is clear.",
                "Confirmed patterns and formal income setup stay separate.",
              ]}
              note={
                snapshot?.income.sourceCount === 0 && transactionOutflows?.inflow_transaction_count
                  ? dataCoverage?.has_demo_sources
                    ? "Demo money in is available. It stays observed until you confirm an income pattern."
                    : "Connected money in is available. It stays observed until you confirm an income pattern."
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
                transactionOutflows?.month_outflow_by_currency?.length
                  ? `Observed money out this month: ${formatMoneyRows(
                      transactionOutflows.month_outflow_by_currency
                    )}.`
                  : latestImported
                    ? `Latest imported payment: ${latestImportedName} (${latestImportedAmount}).`
                    : `Recent money out (30 days): ${snapshot ? formatMoney(snapshot.discretionary.last30DayOutflowCents) : loading ? "Loading..." : "-"}`,
                confirmedPatternSummary(confirmedBills, "regular payment", "regular payments"),
                `Regular payments you’ve set up: ${snapshot ? formatMoney(snapshot.commitments.recurringMonthlyCents) : loading ? "Loading..." : "-"}`,
                snapshot
                  ? snapshot.commitments.billCount > 0
                    ? `${snapshot.commitments.billCount} bill(s) set up.`
                    : "No bills are set up yet."
                  : "Bill coverage will show here.",
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
                  : "Recent money out and formally set up bills stay separate."
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
                `${dataCoverage?.account_count ?? 0} account(s) included from current sources.`,
                dataCoverage?.has_reference_only_sources
                  ? "Older linked sources are kept for reference and are not included here."
                  : dataCoverage?.has_demo_sources
                    ? "Manual demo data is leading this view."
                    : "Current connected sources are leading this view.",
              ]}
              note="Balances come from the current sources shown above."
              links={[
                { href: "/money/saved", label: "Open Saved" },
                { href: "/accounts", label: "Accounts" },
              ]}
            />

            <FlowCard
              title="Planned"
              rows={[
                `Observed money out this month: ${formatMoneyRows(dataCoverage?.current_month_money_out ?? [])}.`,
                `${confirmedBills.length} confirmed regular payment(s).`,
                `${snapshot?.commitments.billCount ?? 0} bill(s) formally set up.`,
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
