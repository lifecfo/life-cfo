"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import type {
  MoneyYearAmount,
  MoneyYearSummary,
} from "@/lib/money/reasoning/types";

type YearResponse = {
  ok?: boolean;
  year?: MoneyYearSummary;
  error?: string;
};

function moneyRows(rows: MoneyYearAmount[]): string {
  if (!rows.length) return "Not scheduled";
  return rows
    .map((row) => formatMoneyFromCents(row.cents, row.currency))
    .join(" · ");
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

export default function MoneyYearPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<MoneyYearSummary | null>(null);

  async function loadYear() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/money/year", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as YearResponse;
      if (!response.ok || !body.year) {
        throw new Error(body.error || "Life CFO couldn’t load the year view yet.");
      }
      setYear(body.year);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Life CFO couldn’t load the year view yet."
      );
      setYear(null);
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
              <Card><CardContent><div className="text-xs text-zinc-500">Goals in progress</div><div className="mt-1 text-base font-medium text-zinc-900">{year.goals.length}</div></CardContent></Card>
              <Card><CardContent><div className="text-xs text-zinc-500">Months worth a closer look</div><div className="mt-1 text-base font-medium text-zinc-900">{year.months_worth_closer_look}</div></CardContent></Card>
            </div>

            <Card>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">The next 12 months</div>
                  <div className="mt-1 text-xs text-zinc-500">Expected from current schedules.</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {year.months.map((month) => (
                    <div key={month.month_key} className="rounded-2xl border border-zinc-200 p-4">
                      <div className="text-sm font-medium text-zinc-900">{month.label}</div>
                      <div className="mt-3 space-y-2 text-xs">
                        <div><span className="text-zinc-500">Money in:</span> <span className="text-zinc-800">{moneyRows(month.expected_income)}</span></div>
                        <div><span className="text-zinc-500">Planned bills:</span> <span className="text-zinc-800">{moneyRows(month.expected_bills)}</span></div>
                        <div><span className="text-zinc-500">Difference:</span> <span className="text-zinc-800">{moneyRows(month.difference)}</span></div>
                      </div>
                      {month.larger_scheduled_payments[0] ? (
                        <div className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                          {month.larger_scheduled_payments[0].name}: {formatMoneyFromCents(month.larger_scheduled_payments[0].amount_cents, month.larger_scheduled_payments[0].currency)}
                        </div>
                      ) : null}
                    </div>
                  ))}
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
                          <div className="shrink-0 text-sm font-medium text-zinc-900">{formatMoneyFromCents(payment.amount_cents, payment.currency)}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-sm text-zinc-600">No larger scheduled payments are dated yet.</div>}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-3">
                  <div className="text-sm font-semibold text-zinc-900">This year’s goals</div>
                  {year.goals.length ? year.goals.map((goal) => (
                    <div key={`${goal.currency}:${goal.title}`} className="rounded-2xl bg-zinc-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-zinc-900">{goal.title}</div><div className="text-sm font-medium text-zinc-900">{goal.progress_percent}%</div></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200"><div className="h-full rounded-full bg-zinc-600" style={{ width: `${goal.progress_percent}%` }} /></div>
                      <div className="mt-2 text-xs text-zinc-500">{formatMoneyFromCents(goal.current_cents, goal.currency)} of {formatMoneyFromCents(goal.target_cents, goal.currency)}{goal.target_month ? ` · Target ${monthName(goal.target_month)}` : ""}</div>
                    </div>
                  )) : <div className="text-sm text-zinc-600">No active goals are in view.</div>}
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
