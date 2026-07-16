"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { useAsk } from "@/components/ask/AskProvider";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import type {
  BreathingRoomSummary,
  MoneyDataCoverage,
  MoneyPrimaryGoalSummary,
  MoneySetupStatus,
} from "@/lib/money/reasoning/types";

type FinancialSnapshot = {
  asOf: string;
  liquidity: { availableCashCents: number; accountCount: number };
};

type OverviewResponse = {
  snapshot: FinancialSnapshot;
  transaction_outflows?: TransactionOutflowSummary;
  pattern_confirmations?: PatternConfirmation[];
  data_coverage?: MoneyDataCoverage;
  setup_status?: MoneySetupStatus;
  breathing_room?: BreathingRoomSummary;
  cash_by_currency?: MoneyRow[];
  primary_goal?: MoneyPrimaryGoalSummary | null;
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

function formatMoney(cents: number | undefined | null, currency = "AUD") {
  return formatMoneyFromCents(cents, currency);
}

function formatMoneyRows(rows: MoneyRow[]) {
  if (!rows.length) return "-";
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

function nextStepCopy(setupStatus: MoneySetupStatus | undefined): string | null {
  const key = setupStatus?.next_step?.key;
  if (!key) return null;
  if (key === "add_bill_dates") return "Add bill dates when you can.";
  if (key === "add_income_timing") return "Check income timing when you can.";
  if (key === "review_patterns") return "Review one money pattern when you can.";
  if (key === "refresh_sources") return "Refresh a money source when you can.";
  if (key === "add_source") return "Add your money when you’re ready.";
  if (key === "add_goal") return "Add one goal when you can.";
  return setupStatus?.next_step?.title || null;
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
  const transactionOutflows = data?.transaction_outflows;
  const dataCoverage = data?.data_coverage;
  const setupStatus = data?.setup_status;
  const breathingRoom = data?.breathing_room;
  const cashByCurrency = data?.cash_by_currency ?? [];
  const primaryGoal = data?.primary_goal ?? null;
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
      const attempt = async (confirmDespiteActivity: boolean) => {
        const response = await fetch("/api/money/pattern-confirmations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pattern_key: confirmation.pattern_key,
            confirm_despite_activity: confirmDespiteActivity,
          }),
        });
        const json = (await response.json().catch(() => ({}))) as {
          error?: string;
          needs_confirmation?: boolean;
          warning?: string;
        };
        return { response, json };
      };

      let { response, json } = await attempt(false);

      if (!response.ok && json.needs_confirmation) {
        const proceed = window.confirm(
          json.warning || "This will also pause the bill or income it created. Continue?"
        );
        if (!proceed) return false;
        ({ response, json } = await attempt(true));
      }

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

  const monthIn = dataCoverage?.current_month_money_in ?? [];
  const monthOut = dataCoverage?.current_month_money_out ?? [];
  const monthCurrencies = Array.from(
    new Set([...monthIn.map((row) => row.currency), ...monthOut.map((row) => row.currency)])
  );
  const monthPositions = monthCurrencies.map((currency) => {
    const moneyIn = monthIn.find((row) => row.currency === currency)?.cents ?? 0;
    const moneyOut = monthOut.find((row) => row.currency === currency)?.cents ?? 0;
    return { currency, cents: moneyIn - moneyOut, activity: moneyIn + moneyOut };
  });
  const primaryPosition = [...monthPositions].sort(
    (left, right) => right.activity - left.activity
  )[0];
  const monthHeadline = !primaryPosition
    ? "This month is still taking shape."
    : primaryPosition.cents > 0
      ? "You’re ahead this month."
      : primaryPosition.cents < 0
        ? "More went out than came in this month."
        : "This month is looking steady.";
  const plannedValue = primaryGoal
    ? `${primaryGoal.title}: ${primaryGoal.progress_percent}%.`
    : "Goals and plans live here.";
  const nextStep = nextStepCopy(setupStatus);

  const askAboutBreathingRoom = () => {
    setDraft(breathingRoom?.ask_prompt || "Why does this month feel tighter?");
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
              <div>
                <div className="text-lg font-semibold text-zinc-900">{monthHeadline}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {dataCoverage?.has_demo_sources ? "Based on demo data." : "Based on your current money data."}
                </div>
              </div>
              <ul className="space-y-1 text-sm text-zinc-700">
                <li>Money in: {loading ? "Loading..." : formatMoneyRows(monthIn)}</li>
                <li>Money out: {loading ? "Loading..." : formatMoneyRows(monthOut)}</li>
                {monthPositions.map((position) => (
                  <li key={position.currency}>
                    {position.cents >= 0 ? "Ahead so far" : "Behind so far"}: {formatMoney(Math.abs(position.cents), position.currency)}
                  </li>
                ))}
                <li>Cash: {loading ? "Loading..." : formatMoneyRows(cashByCurrency)}</li>
              </ul>
            </CardContent>
          </Card>

          {breathingRoom ? (
            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Breathing room</div>
                  <div className="mt-1 text-base font-medium text-zinc-800">
                    {breathingRoom.label}
                  </div>
                </div>
                <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed text-zinc-600">
                  {breathingRoom.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={askAboutBreathingRoom}
                  className="text-left text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900"
                >
                  Ask: “{breathingRoom.ask_prompt}”
                </button>
              </CardContent>
            </Card>
          ) : null}

          {nextStep ? (
            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-700">{nextStep}</div>
              <Link
                href="/money/setup"
                className="shrink-0 text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900"
              >
                Start here
              </Link>
            </div>
          ) : null}

          {transactionOutflows && hasPendingReviewItems ? (
            <Card id="money-review" className="border-zinc-200 bg-white">
              <CardContent className="space-y-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Review what Life CFO found</div>
                  <div className="mt-1 text-xs leading-relaxed text-zinc-600">
                    These items look regular from {dataCoverage?.has_demo_sources ? "your demo data" : "your connected bank data"}. Confirming them here does not change your bills or income.
                  </div>
                </div>

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

                {confirmationError ? (
                  <div className="text-xs text-red-600">{confirmationError}</div>
                ) : null}

                <div className="text-xs leading-relaxed text-zinc-500">
                  Confirmed patterns are remembered and can be used in future summaries.
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!reviewedPatternsOpen ? (
            <button
              type="button"
              onClick={() => setReviewedPatternsOpen(true)}
              className="order-last w-fit text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900"
            >
              View reviewed patterns
            </button>
          ) : null}

          {reviewedPatternsOpen ? (
            <Card className="order-last border-zinc-200 bg-white">
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
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <FlowCard
              title="In"
              value={
                loading
                  ? "Loading..."
                  : monthIn.length
                    ? `${formatMoneyRows(monthIn)} came in this month.`
                    : "No money in is visible this month."
              }
              href="/money/in"
              actionLabel="Open In"
            />

            <FlowCard
              title="Out"
              value={
                loading
                  ? "Loading..."
                  : monthOut.length
                    ? `${formatMoneyRows(monthOut)} went out this month.`
                    : "No money out is visible this month."
              }
              href="/money/out"
              actionLabel="Open Out"
            />

            <FlowCard
              title="Saved"
              value={
                loading
                  ? "Loading..."
                  : cashByCurrency.length
                    ? `${formatMoneyRows(cashByCurrency)} cash.`
                    : "Account balances will appear here."
              }
              href="/money/saved"
              actionLabel="Open Saved"
            />

            <FlowCard
              title="Planned"
              value={plannedValue}
              href="/money/planned"
              actionLabel="Open Planned"
            />
          </div>
        </div>
      </div>
    </Page>
  );
}

function FlowCard({
  title,
  value,
  href,
  actionLabel,
}: {
  title: string;
  value: string;
  href: string;
  actionLabel: string;
}) {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent className="space-y-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <div className="text-sm text-zinc-700">{value}</div>
        <Link href={href}>
          <Chip>{actionLabel}</Chip>
        </Link>
      </CardContent>
    </Card>
  );
}
