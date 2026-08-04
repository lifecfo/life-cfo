"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Money } from "@/components/ui";
import { useCountUp } from "@/lib/ui/useCountUp";
import type {
  CashPlanBucket,
  CashPlanSummary,
  MoneyMapPlannedItem,
  MoneyMapSummary,
} from "@/lib/money/reasoning/types";

type MoneyMapResponse = {
  ok?: boolean;
  money_map?: MoneyMapSummary;
  error?: string;
};

type CashPlanResponse = {
  ok?: boolean;
  cash_plan?: CashPlanSummary;
  error?: string;
};

function cashPlanStatusLabel(status: CashPlanBucket["backing_status"]): string {
  switch (status) {
    case "account_backed":
      return "Account-backed";
    case "part_account":
      return "Part of account";
    case "tracked_only":
      return "Tracked separately";
    case "needs_review":
      return "Needs review";
  }
}

function displayDate(value: string | null): string | null {
  const parsed = Date.parse(value || "");
  if (!Number.isFinite(parsed)) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

function monthName(monthKey: string): string {
  const parsed = Date.parse(`${monthKey}-01T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return monthKey;
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

// No existing relative-time helper fit: Goals' relativeDayLabel() only
// covers Today/Yesterday/absolute-fallback, Connections' softDateTime()
// is deliberately absolute ("Last updated 4 Aug 2026, 3:15 pm"), not
// relative. This is the one new small formatter this footer needs.
function relativeTimeFromNow(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  const diffMs = Date.now() - parsed;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function cadenceLabel(value: string): string {
  const cadence = value.trim().toLowerCase();
  if (!cadence || cadence === "timing not set") return "Timing not set";
  if (cadence === "fortnightly") return "Fortnightly";
  if (cadence === "yearly" || cadence === "annual") return "Yearly";
  return cadence.charAt(0).toUpperCase() + cadence.slice(1);
}

function PlannedRow({ item }: { item: MoneyMapPlannedItem }) {
  const nextDate = displayDate(item.next_at);
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-zinc-50 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-zinc-900">{item.name}</div>
        <div className="mt-1 text-xs text-zinc-500">
          {item.kind === "income" ? "Income" : "Bill"} · {cadenceLabel(item.cadence)}
          {nextDate ? ` · Next ${nextDate}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-sm font-medium text-zinc-900">
        <Money cents={item.amount_cents} currency={item.currency} />
      </div>
    </div>
  );
}

// useCountUp can't be called inside a .map() callback (hooks rule) --
// this wraps it so each animated figure is its own component instance,
// same reasoning as GoalRow/PrimaryGoalCard on the Goals page. Scoped to
// exactly the two figures asked for (account-group subtotals, goal
// saved-so-far) -- not applied to every dollar figure on this page.
function AnimatedMoney({ cents, currency }: { cents: number; currency: string }) {
  const animated = useCountUp(cents);
  return <Money cents={Math.round(animated)} currency={currency} />;
}

export default function MoneyMapPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moneyMap, setMoneyMap] = useState<MoneyMapSummary | null>(null);
  const [cashPlanLoading, setCashPlanLoading] = useState(true);
  const [cashPlanError, setCashPlanError] = useState(false);
  const [cashPlan, setCashPlan] = useState<CashPlanSummary | null>(null);

  const loadMoneyMap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/money/map", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as MoneyMapResponse;
      if (!response.ok || !body.money_map) {
        throw new Error(body.error || "Life CFO couldn’t load the Money Map yet.");
      }
      setMoneyMap(body.money_map);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Life CFO couldn’t load the Money Map yet."
      );
      setMoneyMap(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCashPlan = useCallback(async () => {
    setCashPlanLoading(true);
    setCashPlanError(false);
    try {
      const response = await fetch("/api/money/cash-plan", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as CashPlanResponse;
      if (!response.ok || !body.cash_plan) {
        throw new Error(body.error || "Cash Plan unavailable");
      }
      setCashPlan(body.cash_plan);
    } catch {
      setCashPlanError(true);
      setCashPlan(null);
    } finally {
      setCashPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMoneyMap();
    void loadCashPlan();
  }, [loadCashPlan, loadMoneyMap]);

  const cashPlanBuckets = cashPlan
    ? [
        ...cashPlan.account_backed_buckets,
        ...cashPlan.part_account_buckets,
        ...cashPlan.tracked_only_buckets,
      ]
    : [];

  // Only render the trust footer when both figures are genuinely usable --
  // an empty/demo state (no accounts, no transaction history) stays quiet
  // rather than showing a broken or nonsensical partial sentence.
  const trustFooterRelative = moneyMap
    ? relativeTimeFromNow(moneyMap.latest_transaction_date)
    : null;
  const showTrustFooter = !!moneyMap && moneyMap.account_count > 0 && !!trustFooterRelative;
  const visibleCashPlanBuckets = cashPlanBuckets.slice(0, 6);
  const hiddenCashPlanBucketCount = Math.max(0, cashPlanBuckets.length - 6);

  return (
    <Page
      title="Money Map"
      subtitle="See where money is, what it is being tracked for, and what may need review."
      right={
        <div className="flex flex-wrap gap-2">
          <Chip
            onClick={() => {
              void loadMoneyMap();
              void loadCashPlan();
            }}
            disabled={loading || cashPlanLoading}
          >
            Refresh
          </Chip>
          {/* Relocated here from the removed "What is coming up" card -- no
              Money in/out section exists on this page yet to anchor it near,
              so the header toolbar is the most consistently visible spot. */}
          <Link href="/money/year"><Chip>View Year at a glance</Chip></Link>
          <Link href="/money"><Chip>Back to Money</Chip></Link>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[980px] space-y-4 px-4 sm:px-6">
        {loading ? (
          <Card><CardContent className="text-sm text-zinc-600">Building your Money Map...</CardContent></Card>
        ) : null}

        {error ? (
          <Card>
            <CardContent className="space-y-3">
              <div className="text-sm text-zinc-700">{error}</div>
              <Chip onClick={() => void loadMoneyMap()}>Try again</Chip>
            </CardContent>
          </Card>
        ) : null}

        {moneyMap ? (
          <>
            {moneyMap.mixed_currencies ? (
              <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Each currency is shown separately. Life CFO does not combine them.
              </div>
            ) : null}

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Where the money is</div>
                  <div className="mt-1 text-xs text-zinc-500">Balances shown from the accounts currently in view.</div>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {moneyMap.where_money_is.groups.map((group) => (
                    <div key={group.key} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="text-sm font-medium text-zinc-900">{group.label}</div>
                      {group.totals_by_currency.length ? (
                        <div className="mt-1 text-xs text-zinc-500">
                          {group.totals_by_currency.map((row, index) => (
                            <span key={`${group.key}:${row.currency}`}>
                              {index > 0 ? " · " : ""}
                              <AnimatedMoney cents={row.cents} currency={row.currency} />
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-3 space-y-3">
                        {group.accounts.map((account, index) => (
                          <div key={`${group.key}:${account.name}:${index}`} className="border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm text-zinc-800">{account.name}</div>
                                <div className="mt-1 text-xs text-zinc-500">{account.account_type} · {account.source_label}</div>
                              </div>
                              <div className="shrink-0 text-sm font-medium text-zinc-900"><Money cents={account.balance_cents} currency={account.currency} /></div>
                            </div>
                          </div>
                        ))}
                        {!group.accounts.length ? <div className="text-xs text-zinc-500">None in view.</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Cash Plan</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    A review of what some visible cash is being tracked for.
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    For review only. Nothing has moved.
                  </div>
                </div>

                {cashPlanLoading ? (
                  <div className="text-sm text-zinc-600">Loading Cash Plan...</div>
                ) : null}

                {!cashPlanLoading && cashPlanError ? (
                  <div className="text-sm text-zinc-600">
                    Cash Plan isn&apos;t available right now.
                  </div>
                ) : null}

                {!cashPlanLoading && !cashPlanError && cashPlan ? (
                  <>
                    {cashPlan.review_items.length ? (
                      <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                        {cashPlan.review_items.length} Cash Plan item
                        {cashPlan.review_items.length === 1 ? "" : "s"} needs review.
                      </div>
                    ) : null}

                    {visibleCashPlanBuckets.length ? (
                      <div className="space-y-2">
                        {visibleCashPlanBuckets.map((bucket, index) => (
                          <div
                            key={`${bucket.currency}:${bucket.name}:${index}`}
                            className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-zinc-900">
                                {bucket.name}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">
                                {cashPlanStatusLabel(bucket.backing_status)}
                                {bucket.account_label
                                  ? ` · Shown from ${bucket.account_label}`
                                  : ""}
                              </div>
                            </div>
                            {bucket.backed_amount_cents > 0 ? (
                              <div className="shrink-0 text-sm font-medium text-zinc-900">
                                <Money cents={bucket.backed_amount_cents} currency={bucket.currency} />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-600">
                        No Cash Plan buckets are being tracked yet.
                      </div>
                    )}

                    {hiddenCashPlanBucketCount > 0 ? (
                      <div className="text-xs text-zinc-500">
                        {hiddenCashPlanBucketCount} more
                        {hiddenCashPlanBucketCount === 1 ? " is" : " are"} tracked.
                      </div>
                    ) : null}
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Savings goals</div>
                  <div className="mt-1 text-xs text-zinc-500">These goals are tracked separately from account balances.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {moneyMap.tracked_purposes.items.map((item) => (
                    <div
                      key={`${item.currency}:${item.title}`}
                      className={`rounded-2xl p-4 ${
                        item.is_primary ? "border-2 border-zinc-400 bg-white" : "bg-zinc-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                            {item.is_primary ? (
                              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                                Primary
                              </span>
                            ) : null}
                          </div>
                          {/* Real pace comparison (progress vs. time elapsed toward a
                              deadline) is intentionally not implemented here: the API
                              response for this item (MoneyBucketSummary) never exposes
                              a deadline or a start date to the client -- only a coarse
                              target_month string. Per the spec's own rule, "if a goal
                              has no deadline, always stay quiet" -- since no goal's
                              deadline is available at this layer, quiet is the correct,
                              honest behavior right now, not a shortfall. Wiring this up
                              for real needs deriveMoneyBuckets.ts and types.ts to start
                              sending deadline_at (and a start reference) to the client --
                              out of scope for this page-only change. */}
                        </div>
                        <div className="text-xs font-medium text-zinc-700">{item.progress_percent}%</div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="motion-fill h-full rounded-full bg-cfo"
                          style={
                            {
                              width: `${item.progress_percent}%`,
                              "--fill-target": `${item.progress_percent}%`,
                            } as CSSProperties
                          }
                        />
                      </div>
                      <div className="mt-2 text-xs text-zinc-600">
                        Saved so far: <AnimatedMoney cents={item.current_cents} currency={item.currency} /> of{" "}
                        <Money cents={item.target_cents} currency={item.currency} />
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Still needed: <Money cents={item.still_needed_cents} currency={item.currency} />
                        {item.target_month ? ` · Target ${monthName(item.target_month)}` : ""}
                      </div>
                    </div>
                  ))}
                  {!moneyMap.tracked_purposes.items.length ? <div className="text-sm text-zinc-600">No savings goals are being tracked yet.</div> : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">What is already planned</div>
                  <div className="mt-1 text-xs text-zinc-500">Based on current schedules.</div>
                </div>
                {/* "Scheduled" (income + bills) column removed -- redundant with
                    what Bills and Income already show on their own pages. */}
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Confirmed patterns</div>
                  {moneyMap.planned.confirmed_patterns.map((item, index) => <PlannedRow key={`confirmed:${item.kind}:${item.name}:${index}`} item={item} />)}
                  {!moneyMap.planned.confirmed_patterns.length ? <div className="text-sm text-zinc-600">No confirmed patterns are in view.</div> : null}
                </div>
              </CardContent>
            </Card>

            {/* "What is coming up" card removed -- Year at a glance already owns
                this job, with more sophistication (curation rules protecting
                large infrequent bills, "Timing needed" disclosure). The link
                out to it now lives in the page header toolbar above. */}

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">What needs review</div>
                  <div className="mt-1 text-xs text-zinc-500">For review only. Nothing has moved.</div>
                </div>
                <div className="space-y-2">
                  {moneyMap.review.items.map((item) => (
                    <div key={item.key} className="rounded-2xl border border-zinc-200 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium text-zinc-500">{item.label}</div>
                          <div className="mt-1 text-sm font-medium text-zinc-900">{item.title}</div>
                          <div className="mt-1 text-xs text-zinc-600">{item.detail}</div>
                        </div>
                        {item.href ? <Link href={item.href} className="text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4">Open</Link> : null}
                      </div>
                    </div>
                  ))}
                  {!moneyMap.review.items.length ? <div className="text-sm text-zinc-600">Nothing needs review right now.</div> : null}
                </div>
              </CardContent>
            </Card>

            {showTrustFooter ? (
              <div className="px-1 pt-2 text-xs text-zinc-500">
                Last updated {trustFooterRelative}, from {moneyMap.account_count} account
                {moneyMap.account_count === 1 ? "" : "s"}.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Page>
  );
}
