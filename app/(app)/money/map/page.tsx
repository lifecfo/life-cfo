"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
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
        {formatMoneyFromCents(item.amount_cents, item.currency)}
      </div>
    </div>
  );
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
                          {group.totals_by_currency.map((row) => formatMoneyFromCents(row.cents, row.currency)).join(" · ")}
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
                              <div className="shrink-0 text-sm font-medium text-zinc-900">{formatMoneyFromCents(account.balance_cents, account.currency)}</div>
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
                                {formatMoneyFromCents(
                                  bucket.backed_amount_cents,
                                  bucket.currency
                                )}
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
                    <div key={`${item.currency}:${item.title}`} className="rounded-2xl bg-zinc-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{item.title}</div>
                          <div className="mt-1 text-xs text-zinc-500">{item.status_label}</div>
                        </div>
                        <div className="text-xs font-medium text-zinc-700">{item.progress_percent}%</div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-zinc-600" style={{ width: `${item.progress_percent}%` }} /></div>
                      <div className="mt-2 text-xs text-zinc-600">Saved so far: {formatMoneyFromCents(item.current_cents, item.currency)} of {formatMoneyFromCents(item.target_cents, item.currency)}</div>
                      <div className="mt-1 text-xs text-zinc-500">Still needed: {formatMoneyFromCents(item.still_needed_cents, item.currency)}{item.target_month ? ` · Target ${monthName(item.target_month)}` : ""}</div>
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
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Scheduled</div>
                    {moneyMap.planned.scheduled.map((item, index) => <PlannedRow key={`scheduled:${item.kind}:${item.name}:${index}`} item={item} />)}
                    {!moneyMap.planned.scheduled.length ? <div className="text-sm text-zinc-600">No regular schedules are in view.</div> : null}
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Confirmed patterns</div>
                    {moneyMap.planned.confirmed_patterns.map((item, index) => <PlannedRow key={`confirmed:${item.kind}:${item.name}:${index}`} item={item} />)}
                    {!moneyMap.planned.confirmed_patterns.length ? <div className="text-sm text-zinc-600">No confirmed patterns are in view.</div> : null}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">What is coming up</div>
                    <div className="mt-1 text-xs text-zinc-500">Expected from current schedules and recent spending.</div>
                  </div>
                  <Link href="/money/year" className="text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4">View Year at a glance</Link>
                </div>
                <div className="space-y-2">
                  {moneyMap.coming_up.items.map((item, index) => (
                    <div key={`${item.kind}:${item.name}:${index}`} className="flex items-start justify-between gap-4 rounded-2xl bg-zinc-50 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{item.name}</div>
                        <div className="mt-1 text-xs text-zinc-500">{item.detail}{displayDate(item.expected_at) ? ` · ${displayDate(item.expected_at)}` : ""}</div>
                      </div>
                      {item.amount_cents !== null && item.currency ? <div className="shrink-0 text-sm font-medium text-zinc-900">{formatMoneyFromCents(item.amount_cents, item.currency)}</div> : null}
                    </div>
                  ))}
                  {!moneyMap.coming_up.items.length ? <div className="text-sm text-zinc-600">Nothing dated is coming up yet.</div> : null}
                </div>
              </CardContent>
            </Card>

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
          </>
        ) : null}
      </div>
    </Page>
  );
}
