"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Money } from "@/components/ui";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import type {
  MoneyTimelineCurrency,
  MoneyTimelineMonth,
  MoneyTimelineSummary,
  MoneyYearAmount,
  MoneyYearSummary,
} from "@/lib/money/reasoning/types";

type YearResponse = {
  ok?: boolean;
  year?: MoneyYearSummary;
  timeline?: MoneyTimelineSummary;
  error?: string;
};

function moneyRows(rows: MoneyYearAmount[]) {
  if (!rows.length) return "Not scheduled";
  return rows.map((row, index) => (
    <span key={`${row.currency}:${index}`}>
      {index > 0 ? " · " : ""}
      <Money cents={row.cents} currency={row.currency} />
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

// Real, per-household scope sentence for the chart that actually exists
// today (scheduled income/bills only) -- not the projected-available-cash
// line's scope sentence, which stays out of scope per
// year-at-a-glance-spec.md v3 (that one needs the Budget/typical-baseline
// infrastructure this page doesn't have). timing_needed is already
// computed and already flowing into this response; this just uses it.
function yearScopeSentence(year: MoneyYearSummary): string {
  const excluded = year.timing_needed.length;
  const base = "This shows the income and bills currently scheduled.";
  const readOnly = "This view is read-only and does not change balances.";
  if (excluded === 0) return `${base} ${readOnly}`;
  return `${base} ${excluded} item${excluded === 1 ? "" : "s"} couldn't be included because of a missing date or unsupported cadence — see Timing needed below. ${readOnly}`;
}

const CHART_WIDTH = 960;
const CHART_HEIGHT = 300;
const CHART_LEFT = 64;
const CHART_RIGHT = 20;
const CHART_TOP = 20;
const CHART_BOTTOM = 54;

function chartX(index: number, monthCount: number): number {
  if (monthCount <= 1) return CHART_LEFT;
  return CHART_LEFT + ((CHART_WIDTH - CHART_LEFT - CHART_RIGHT) * index) / (monthCount - 1);
}

function chartY(value: number, timeline: MoneyTimelineCurrency): number {
  const range = timeline.scale_max_cents - timeline.scale_min_cents;
  if (range <= 0) return (CHART_TOP + CHART_HEIGHT - CHART_BOTTOM) / 2;
  return CHART_TOP +
    ((timeline.scale_max_cents - value) / range) *
      (CHART_HEIGHT - CHART_TOP - CHART_BOTTOM);
}

function points(
  timeline: MoneyTimelineCurrency,
  key: "known_money_in_cents" | "known_money_out_cents" | "difference_cents"
): string {
  return timeline.months
    .map((month, index) => `${chartX(index, timeline.months.length)},${chartY(month[key], timeline)}`)
    .join(" ");
}

function closerLookText(month: MoneyTimelineMonth): string {
  const reasons = month.closer_look_reasons.map((reason) =>
    reason === "bills_above_income"
      ? "Bills are higher than known income this month."
      : "This is a heavier scheduled month."
  );
  return reasons.join(" ");
}

function YearTimelineChart({ timeline }: { timeline: MoneyTimelineCurrency }) {
  const zeroY = chartY(0, timeline);

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-zinc-900">{timeline.currency}</div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-600" aria-hidden="true">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600" />Money in</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-zinc-700" />Money out</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-600" />Difference</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="min-w-[720px]" role="img" aria-label={`Twelve month timeline for ${timeline.currency}`}>
          <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={zeroY} y2={zeroY} stroke="#d4d4d8" strokeDasharray="4 4" />
          <polyline points={points(timeline, "known_money_in_cents")} fill="none" stroke="#059669" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={points(timeline, "known_money_out_cents")} fill="none" stroke="#3f3f46" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={points(timeline, "difference_cents")} fill="none" stroke="#0284c7" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          {timeline.months.map((month, index) => {
            const x = chartX(index, timeline.months.length);
            return (
              <g key={month.month_key}>
                <title>{`${month.label}: money in ${formatMoneyFromCents(month.known_money_in_cents, timeline.currency)}, money out ${formatMoneyFromCents(month.known_money_out_cents, timeline.currency)}, difference ${formatMoneyFromCents(month.difference_cents, timeline.currency)}`}</title>
                <circle cx={x} cy={chartY(month.known_money_in_cents, timeline)} r="5" fill="#059669" />
                <circle cx={x} cy={chartY(month.known_money_out_cents, timeline)} r="5" fill="#3f3f46" />
                <circle cx={x} cy={chartY(month.difference_cents, timeline)} r="5" fill="#0284c7" />
                {month.needs_closer_look ? (
                  <circle
                    cx={x}
                    cy={CHART_TOP + 4}
                    r="5"
                    fill="none"
                    strokeWidth="2"
                    className="stroke-zinc-500"
                  />
                ) : null}
                <text x={x} y={CHART_HEIGHT - 20} textAnchor="middle" className="fill-zinc-500 text-[11px]">{month.label.replace(/ \d{4}$/, "")}</text>
              </g>
            );
          })}
          <text x={CHART_LEFT - 8} y={CHART_TOP + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">{formatMoneyFromCents(timeline.scale_max_cents, timeline.currency)}</text>
          <text x={CHART_LEFT - 8} y={zeroY + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">{formatMoneyFromCents(0, timeline.currency)}</text>
          {timeline.scale_min_cents < 0 ? <text x={CHART_LEFT - 8} y={CHART_HEIGHT - CHART_BOTTOM + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">{formatMoneyFromCents(timeline.scale_min_cents, timeline.currency)}</text> : null}
        </svg>
      </div>
      <details className="rounded-2xl bg-zinc-50 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-800">Monthly details</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Month</th>
                <th className="pb-2 pr-4 font-medium">Money in</th>
                <th className="pb-2 pr-4 font-medium">Money out</th>
                <th className="pb-2 pr-4 font-medium">Difference</th>
                <th className="pb-2 pr-4 font-medium">Largest payment</th>
                <th className="pb-2 font-medium">Worth noting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-700">
              {timeline.months.map((month) => (
                <tr key={month.month_key}>
                  <td className="py-2 pr-4 font-medium text-zinc-900">{month.label}</td>
                  <td className="py-2 pr-4"><Money cents={month.known_money_in_cents} currency={timeline.currency} /></td>
                  <td className="py-2 pr-4"><Money cents={month.known_money_out_cents} currency={timeline.currency} /></td>
                  <td className="py-2 pr-4"><Money cents={month.difference_cents} currency={timeline.currency} /></td>
                  <td className="py-2 pr-4">
                    {month.largest_payment ? (
                      <>
                        {month.largest_payment.name}:{" "}
                        <Money cents={month.largest_payment.amount_cents} currency={timeline.currency} />
                      </>
                    ) : (
                      "None scheduled"
                    )}
                  </td>
                  <td className="py-2">{closerLookText(month) || "Nothing specific."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {timeline.months.some((month) => month.needs_closer_look) ? (
        <div className="text-xs text-zinc-500"><span className="mr-1 inline-block h-2 w-2 rounded-full border border-zinc-500" />A marker shows a month with a shortfall or a heavier schedule.</div>
      ) : null}
    </div>
  );
}

export default function MoneyYearPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<MoneyYearSummary | null>(null);
  const [timeline, setTimeline] = useState<MoneyTimelineSummary | null>(null);

  async function loadYear() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/money/year", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as YearResponse;
      if (!response.ok || !body.year || !body.timeline) {
        throw new Error(body.error || "Life CFO couldn't load the year view yet.");
      }
      setYear(body.year);
      setTimeline(body.timeline);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Life CFO couldn't load the year view yet."
      );
      setYear(null);
      setTimeline(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadYear();
  }, []);

  return (
    <Page
      title="Year at a glance"
      subtitle="See the bigger costs, quieter months, and goals across the next 12 months."
      right={
        <div className="flex flex-wrap gap-2">
          <Chip onClick={() => void loadYear()} disabled={loading}>Refresh</Chip>
          <Link href="/money/planned"><Chip>Open Planned</Chip></Link>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[1040px] space-y-4">
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

        {year && timeline ? (
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
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Year timeline</div>
                  <div className="mt-1 text-sm text-zinc-600">Based on the schedules currently added, this shows what is expected to come in, what is expected to go out, and which months may need a closer look.</div>
                  <div className="mt-1 text-xs text-zinc-500">{yearScopeSentence(year)}</div>
                </div>
                <div className="space-y-4">
                  {timeline.currencies.map((currencyTimeline) => <YearTimelineChart key={currencyTimeline.currency} timeline={currencyTimeline} />)}
                  {!timeline.currencies.length ? <div className="text-sm text-zinc-600">Add dates to regular income or bills to build the timeline.</div> : null}
                </div>
                <div className="rounded-2xl bg-zinc-50 p-4">
                  <div className="text-sm font-medium text-zinc-900">What this shows</div>
                  <ul className="mt-2 space-y-1 text-sm text-zinc-600">
                    {timeline.commentary.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
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
                        <div className="mt-2 text-sm text-zinc-600">Current schedules look fairly even.</div>
                      ) : (
                        <div className="mt-2 space-y-2 text-sm text-zinc-600">
                          <div>Heavier months: {season.heavier_months.map(monthName).join(", ") || "None"}.</div>
                          <div>Quieter months: {season.quieter_months.map(monthName).join(", ") || "None"}.</div>
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
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-zinc-600" style={{ width: `${goal.progress_percent}%` }} /></div>
                      <div className="mt-2 text-xs text-zinc-500">
                        Saved so far: <Money cents={goal.current_cents} currency={goal.currency} /> of{" "}
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
