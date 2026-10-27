"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { LineChart } from "@/components/charts/BrandCharts";
import { PageGlance } from "@/components/glance/PageGlance";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Money } from "@/components/ui";
import { useSampleMode } from "@/lib/demo/sampleMode";
import { buildSampleTimelineResponse, buildSampleYearResponse } from "@/lib/demo/sampleMoneyViews";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { categoryColorClasses, categoryColorSlot } from "@/lib/ui/categoryColorSlot";
import { useCountUp } from "@/lib/ui/useCountUp";
import type {
  MoneyYearAmount,
  MoneyYearSummary,
  MoneyZoomBreakdownItem,
  MoneyZoomCurrency,
  MoneyZoomTimelineSummary,
  TimelineGranularity,
} from "@/lib/money/reasoning/types";

type YearResponse = {
  ok?: boolean;
  year?: MoneyYearSummary;
  error?: string;
};

type TimelineResponse = {
  ok?: boolean;
  timeline?: MoneyZoomTimelineSummary;
  error?: string;
};

const GRANULARITY_OPTIONS: { key: TimelineGranularity; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

// useCountUp can't be called inside a .map() callback (hooks rule) --
// this wraps it so each animated figure is its own component instance,
// same reasoning as Money Map's AnimatedMoney. Scoped to exactly the two
// spots asked for (summary-row amounts, goal saved-so-far) -- not applied
// to larger-payments amounts or the timeline detail panel.
function AnimatedMoney({ cents, currency }: { cents: number; currency: string }) {
  const animated = useCountUp(cents);
  return <Money cents={Math.round(animated)} currency={currency} />;
}

function moneyRows(rows: MoneyYearAmount[]) {
  if (!rows.length) return "Not scheduled";
  return rows.map((row, index) => (
    <span key={`${row.currency}:${index}`}>
      {index > 0 ? " · " : ""}
      <AnimatedMoney cents={row.cents} currency={row.currency} />
    </span>
  ));
}

function monthName(monthKey: string): string {
  const parsed = Date.parse(`${monthKey}-01T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return monthKey;
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

function breakdownSwatchClasses(item: MoneyZoomBreakdownItem) {
  const slotKey = item.kind === "category" ? item.name : item.kind === "bill" ? "Bills" : "Income";
  return categoryColorClasses(categoryColorSlot(slotKey));
}

function ZoomCurrencyChart({
  currencyTimeline,
  granularity,
  selectedBucketKey,
  onSelectPoint,
}: {
  currencyTimeline: MoneyZoomCurrency;
  granularity: TimelineGranularity;
  selectedBucketKey: string | null;
  onSelectPoint: (bucketKey: string) => void;
}) {
  const points = currencyTimeline.points;
  const splitIndex = points.findIndex((point) => point.is_today_marker);
  const selectedPoint = points.find((point) => point.bucket_key === selectedBucketKey) ?? null;
  const granularityLabel = GRANULARITY_OPTIONS.find((option) => option.key === granularity)?.label ?? "Month";

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-border bg-neutral-surface p-4">
      <div className="text-sm font-medium text-neutral-text">{currencyTimeline.currency}</div>
      <LineChart
        ariaLabel={`${granularityLabel}ly actual and planned timeline for ${currencyTimeline.currency}`}
        empty="Add dates to regular income or bills, or import transactions, to build the timeline."
        labels={points.map((point) => point.label)}
        formatValue={(value) => formatMoneyFromCents(value, currencyTimeline.currency)}
        splitIndex={splitIndex >= 0 ? splitIndex : undefined}
        maxLabels={13}
        onPointClick={(index) => {
          const point = points[index];
          if (point) onSelectPoint(point.bucket_key);
        }}
        series={[
          {
            id: "in",
            label: "Money in",
            values: points.map((point) => point.money_in_cents),
            strokeClass: "stroke-cfo",
            fillClass: "fill-cfo",
            swatchClass: "bg-cfo",
          },
          {
            id: "out",
            label: "Money out",
            values: points.map((point) => point.money_out_cents),
            strokeClass: "stroke-cfo/60",
            fillClass: "fill-cfo/60",
            swatchClass: "bg-cfo/60",
          },
          {
            id: "difference",
            label: "Difference",
            values: points.map((point) => point.difference_cents),
            strokeClass: "stroke-cfo/25",
            fillClass: "fill-cfo/25",
            swatchClass: "bg-cfo/25",
          },
        ]}
      />
      <div className="text-xs text-zinc-500">Click a point on the line to see what made it up.</div>
      {selectedPoint ? (
        <div className="space-y-3 rounded-2xl bg-zinc-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{selectedPoint.label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {selectedPoint.kind === "actual" ? "Actual — what happened" : "Planned — scheduled, not yet happened"}
              </div>
            </div>
            <Chip onClick={() => onSelectPoint(selectedPoint.bucket_key)}>Close</Chip>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-zinc-500">Money in</div>
              <Money cents={selectedPoint.money_in_cents} currency={currencyTimeline.currency} />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Money out</div>
              <Money cents={selectedPoint.money_out_cents} currency={currencyTimeline.currency} />
            </div>
            <div>
              <div className="text-xs text-zinc-500">Difference</div>
              <Money cents={selectedPoint.difference_cents} currency={currencyTimeline.currency} />
            </div>
          </div>
          {selectedPoint.breakdown.length ? (
            <div className="space-y-1.5">
              {selectedPoint.breakdown.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-zinc-700">
                    <span className={`h-2 w-2 rounded-full ${breakdownSwatchClasses(item).bg}`} />
                    {item.name}
                  </span>
                  <Money cents={item.amount_cents} currency={item.currency} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-600">Nothing recorded for this period.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function YearClient() {
  const { on: sampleOn, ready: sampleReady } = useSampleMode();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<MoneyYearSummary | null>(null);

  const [granularity, setGranularity] = useState<TimelineGranularity>("month");
  const [zoomTimeline, setZoomTimeline] = useState<MoneyZoomTimelineSummary | null>(null);
  const [zoomLoading, setZoomLoading] = useState(true);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);

  async function loadYear() {
    setLoading(true);
    setError(null);
    try {
      if (sampleOn) {
        const sample = buildSampleYearResponse();
        setYear(sample.year);
        return;
      }
      const response = await fetch("/api/money/year", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as YearResponse;
      if (!response.ok || !body.year) {
        throw new Error(body.error || "Life CFO couldn't load the year view yet.");
      }
      setYear(body.year);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Life CFO couldn't load the year view yet.");
      setYear(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline(nextGranularity: TimelineGranularity) {
    setZoomLoading(true);
    setZoomError(null);
    try {
      if (sampleOn) {
        const sample = buildSampleTimelineResponse(nextGranularity);
        setZoomTimeline(sample.timeline);
        return;
      }
      const response = await fetch(`/api/money/timeline?granularity=${nextGranularity}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as TimelineResponse;
      if (!response.ok || !body.timeline) {
        throw new Error(body.error || "Life CFO couldn't load the timeline yet.");
      }
      setZoomTimeline(body.timeline);
    } catch (loadError: unknown) {
      setZoomError(loadError instanceof Error ? loadError.message : "Life CFO couldn't load the timeline yet.");
      setZoomTimeline(null);
    } finally {
      setZoomLoading(false);
    }
  }

  useEffect(() => {
    // Wait for sample mode's own localStorage read to resolve first --
    // otherwise this fires once with the stale default (sampleOn=false)
    // and again right after with the real value, and the slower real-data
    // fetch from the first call can land after the sample call and
    // clobber it with a "no household" error.
    if (!sampleReady) return;
    void loadYear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleOn, sampleReady]);

  useEffect(() => {
    if (!sampleReady) return;
    setSelectedPointKey(null);
    void loadTimeline(granularity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleOn, sampleReady, granularity]);

  return (
    <Page
      title="Year ahead"
      subtitle="Actual history and scheduled bills and income, zoomable by week, month, quarter, or year."
      right={
        <div className="flex flex-wrap gap-2">
          <Chip onClick={() => { void loadYear(); void loadTimeline(granularity); }} disabled={loading || zoomLoading}>
            Refresh
          </Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[1040px] space-y-4">
        {/* PageGlance already renders its own SampleOffer/SampleStrip for page="year" */}
        <PageGlance page="year" />
        {loading ? (
          <Card><CardContent className="text-sm text-zinc-600">Building the year from current schedules...</CardContent></Card>
        ) : null}

        {error ? (
          <Card>
            <CardContent className="space-y-3">
              <div className="text-sm text-zinc-700">{error}</div>
              <Chip onClick={() => void loadYear()}>Try again</Chip>
            </CardContent>
          </Card>
        ) : null}

        {year ? (
          <>
            {year.mixed_currencies ? (
              <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                Each currency is shown separately. Life CFO does not combine them.
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Card><CardContent><div className="text-xs text-zinc-500">Expected regular money in</div><div className="mt-1 text-base font-medium text-zinc-900">{moneyRows(year.expected_income_total)}</div></CardContent></Card>
              <Card><CardContent><div className="text-xs text-zinc-500">Expected planned bills</div><div className="mt-1 text-base font-medium text-zinc-900">{moneyRows(year.expected_bills_total)}</div></CardContent></Card>
              <Card><CardContent><div className="text-xs text-zinc-500">Larger scheduled payments</div><div className="mt-1 text-base font-medium text-zinc-900">{year.larger_scheduled_payments.length}</div></CardContent></Card>
              <Card><CardContent><div className="text-xs text-zinc-500">Savings goals</div><div className="mt-1 text-base font-medium text-zinc-900">{year.goals.length}</div></CardContent></Card>
              <Card><CardContent><div className="text-xs text-zinc-500">Months worth a closer look</div><div className="mt-1 text-base font-medium text-zinc-900">{year.months_worth_closer_look}</div></CardContent></Card>
            </div>

            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Timeline</div>
                    <div className="mt-1 text-sm text-zinc-600">
                      Solid is what actually happened. Dashed is what's scheduled from here. This view is read-only and does not change balances.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {GRANULARITY_OPTIONS.map((option) => (
                      <Chip key={option.key} active={granularity === option.key} onClick={() => setGranularity(option.key)}>
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                {zoomLoading ? <div className="text-sm text-zinc-600">Building the timeline...</div> : null}
                {zoomError ? (
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{zoomError}</div>
                    <Chip onClick={() => void loadTimeline(granularity)}>Try again</Chip>
                  </div>
                ) : null}

                {zoomTimeline && !zoomLoading ? (
                  <div className="space-y-4">
                    {zoomTimeline.currencies.map((currencyTimeline) => (
                      <ZoomCurrencyChart
                        key={currencyTimeline.currency}
                        currencyTimeline={currencyTimeline}
                        granularity={granularity}
                        selectedBucketKey={
                          selectedPointKey?.startsWith(`${currencyTimeline.currency}::`)
                            ? selectedPointKey.slice(currencyTimeline.currency.length + 2)
                            : null
                        }
                        onSelectPoint={(bucketKey) => {
                          const key = `${currencyTimeline.currency}::${bucketKey}`;
                          setSelectedPointKey((current) => (current === key ? null : key));
                        }}
                      />
                    ))}
                    {!zoomTimeline.currencies.length ? (
                      <div className="text-sm text-zinc-600">
                        Add dates to regular income or bills, or import transactions, to build the timeline.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4">
                <div className="text-sm font-semibold text-zinc-900">Money seasons</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {year.seasons.map((season) => (
                    <div key={season.currency} className="rounded-2xl bg-zinc-50 p-4">
                      <div className="text-sm font-medium text-zinc-900">{season.currency}</div>
                      {season.status === "fairly_even" ? (
                        <div className="mt-2 text-sm text-zinc-600">Scheduled amounts are similar across these months.</div>
                      ) : (
                        <div className="mt-2 space-y-2 text-sm text-zinc-600">
                          <div>Larger scheduled amounts: {season.heavier_months.map(monthName).join(", ") || "None"}.</div>
                          <div>Smaller scheduled amounts: {season.quieter_months.map(monthName).join(", ") || "None"}.</div>
                        </div>
                      )}
                    </div>
                  ))}
                  {!year.seasons.length ? <div className="text-sm text-zinc-600">Add timing to regular bills to see money seasons.</div> : null}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardContent className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-900">Larger scheduled payments</div>
                  {year.larger_scheduled_payments.length ? (
                    <div className="space-y-2">
                      {year.larger_scheduled_payments.map((payment) => (
                        <div key={`${payment.currency}:${payment.name}`} className="flex items-start justify-between gap-4 rounded-2xl bg-zinc-50 px-4 py-3">
                          <div><div className="text-sm font-medium text-zinc-900">{payment.name}</div><div className="text-xs text-zinc-500">Expected {monthName(payment.month_key)}{payment.occurrence_count > 1 ? ` · ${payment.occurrence_count} times in view` : ""}</div></div>
                          <div className="shrink-0 text-sm font-medium text-zinc-900"><Money cents={payment.amount_cents} currency={payment.currency} /></div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-sm text-zinc-600">No larger scheduled payments are dated yet.</div>}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Savings goals</div>
                    <div className="mt-1 text-xs text-zinc-500">These are tracked goals, not projected future savings.</div>
                  </div>
                  {year.goals.length ? year.goals.map((goal) => (
                    <div key={`${goal.currency}:${goal.title}`} className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-zinc-900">{goal.title}</div><div className="text-sm font-medium text-zinc-900">{goal.progress_percent}%</div></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
                        <div
                          className="motion-fill h-full rounded-full bg-cfo"
                          style={
                            {
                              width: `${goal.progress_percent}%`,
                              "--fill-target": `${goal.progress_percent}%`,
                            } as CSSProperties
                          }
                        />
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        Saved so far: <AnimatedMoney cents={goal.current_cents} currency={goal.currency} /> of{" "}
                        <Money cents={goal.target_cents} currency={goal.currency} />
                        {goal.target_month ? ` · Target ${monthName(goal.target_month)}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Still needed: <Money cents={goal.still_needed_cents} currency={goal.currency} />
                      </div>
                    </div>
                  )) : <div className="text-sm text-zinc-600">No active savings goals are in view.</div>}
                </CardContent>
              </Card>
            </div>

            {year.timing_needed.length ? (
              <Card>
                <CardContent className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-900">Timing needed</div>
                  <div className="text-sm text-zinc-600">Some regular items need timing before they can appear in the year view.</div>
                  <ul className="space-y-1 text-sm text-zinc-700">
                    {year.timing_needed.map((item) => <li key={`${item.kind}:${item.currency}:${item.name}`}>{item.name} · {item.kind === "income" ? "Regular income" : "Regular payment"}</li>)}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </Page>
  );
}
