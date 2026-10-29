"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { LineChart } from "@/components/charts/BrandCharts";
import { SampleOffer, SampleStrip, useSampleMode } from "@/lib/demo/sampleMode";
import {
  buildSampleHousehold,
  monthlyCents,
  type SampleCadence,
  type SampleHousehold,
  type SampleItem,
} from "@/lib/demo/sampleHousehold";
import {
  hasOneOffBills,
  hasOneOffIncome,
  oneOffBillItems,
  oneOffBillsMonthlyCents,
  oneOffIncomeItems,
  oneOffIncomeMonthlyCents,
} from "@/lib/glance/householdItemsSummary";

export type GlancePage = "home" | "bills" | "income" | "budget" | "year" | "spending" | "decisions" | "household";

type RealPicture = {
  items: { id: string; kind: string; title: string; amount_cents: number | null; due_on: string | null; assignee_user_id: string | null }[];
  members: { user_id: string; label: string }[];
  reminders: { id: string; title: string; remind_on: string }[];
  decisions: { id: string; title: string; review_at: string | null }[];
};

const TINTS = ["#1F5E5C", "#3E7C74", "#6FAFB2", "#A9CFD0", "#8A8F8C", "#C4B8A5"];

function aud(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
}

function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function How({ children }: { children: string }) {
  return (
    <details className="text-sm text-neutral-text-2">
      <summary className="cursor-pointer text-cfo">How this works</summary>
      <p className="mt-2 max-w-prose leading-6">{children}</p>
    </details>
  );
}

function EmptyState({ label, href, action }: { label: string; href: string; action: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-border bg-white px-6 py-10 text-center">
      <svg viewBox="0 0 24 24" className="mx-auto h-8 w-8 text-cfo" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p className="mt-3 text-sm text-neutral-text">{label}</p>
      <Link href={href} className="mt-2 inline-block text-sm font-medium text-cfo underline">
        {action}
      </Link>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cfo-soft text-xs font-medium text-cfo">
      {initials(name)}
    </span>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const common = {
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const shared = "h-4 w-4 text-cfo";

  switch (category) {
    // Household's own typed bills/renewals have no finer category today,
    // so every real (non-sample) item lands here -- same house glyph as
    // Housing is the right call, not a generic fallback.
    case "Housing":
    case "Household":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <path d="M4 10.5 12 4l8 6.5" {...common} />
          <path d="M6.5 9.8V20h11V9.8" {...common} />
        </svg>
      );
    case "Utilities":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <path d="M13 3 6.5 13.5h4.5L10 21l7.5-10.5H13L13 3z" {...common} />
        </svg>
      );
    case "Transport":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <path d="M6 15.5 7.3 10a2 2 0 0 1 1.9-1.5h5.6a2 2 0 0 1 1.9 1.5l1.3 5.5" {...common} />
          <path d="M5 15.5h14v3.5h-2v-1.5H7v1.5H5v-3.5z" {...common} />
          <circle cx="8.5" cy="17" r="1.1" {...common} />
          <circle cx="15.5" cy="17" r="1.1" {...common} />
        </svg>
      );
    case "Health":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 8v8M8 12h8" {...common} />
        </svg>
      );
    case "Care":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <path
            d="M12 19.5s-6.5-4.1-6.5-9A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 6.5 2.5c0 4.9-6.5 9-6.5 9z"
            {...common}
          />
        </svg>
      );
    case "Pets":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <ellipse cx="12" cy="15.3" rx="4.2" ry="3.3" {...common} />
          <circle cx="7" cy="9.2" r="1.6" {...common} />
          <circle cx="10.6" cy="6.5" r="1.6" {...common} />
          <circle cx="13.4" cy="6.5" r="1.6" {...common} />
          <circle cx="17" cy="9.2" r="1.6" {...common} />
        </svg>
      );
    case "Pay":
    case "Income":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <rect x="4" y="7" width="16" height="11" rx="2" {...common} />
          <circle cx="12" cy="12.5" r="2.2" {...common} />
          <path d="M4 10h2M18 10h2" {...common} />
        </svg>
      );
    case "Groceries":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <path d="M9 9a3 3 0 0 1 6 0" {...common} />
          <path d="M5.5 9h13l-1.4 9.3a2 2 0 0 1-2 1.7H8.9a2 2 0 0 1-2-1.7L5.5 9z" {...common} />
        </svg>
      );
    case "Entertainment":
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M10.3 9 15 12l-4.7 3V9z" {...common} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={shared} aria-hidden="true">
          <path d="M12 4h6a2 2 0 0 1 2 2v6L11 21l-7-7L12 4z" {...common} />
          <circle cx="16.2" cy="7.8" r="1.1" {...common} />
        </svg>
      );
  }
}

function fromPicture(picture: RealPicture): SampleHousehold {
  const label = (id: string | null) => picture.members.find((member) => member.user_id === id)?.label || "Household";
  const items: SampleItem[] = picture.items
    .filter((item) => item.amount_cents != null || item.due_on)
    .map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind === "income" ? "income" : item.kind === "renewal" ? "renewal" : item.kind === "bill" ? "bill" : "receipt",
      category: item.kind === "income" ? "Pay" : "Household",
      amount_cents: item.amount_cents ?? 0,
      cadence: "monthly" as SampleCadence,
      due_on: item.due_on || "",
      owner: label(item.assignee_user_id),
    }));
  return {
    people: picture.members.map((member) => ({ name: member.label, role: "Member" })),
    pets: [],
    items,
    transactions: [],
    decisions: picture.decisions.map((decision) => ({
      id: decision.id,
      title: decision.title,
      review_on: decision.review_at?.slice(0, 10) || "",
      note: "A note saved in this household.",
    })),
  };
}

function HomeView({ data, reminders }: { data: SampleHousehold; reminders: { title: string; remind_on: string }[] }) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const limit = new Date(today);
  limit.setDate(today.getDate() + 30);
  const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, "0")}-${String(limit.getDate()).padStart(2, "0")}`;
  const upcoming = data.items
    .filter((item) => item.kind !== "income" && item.due_on >= todayIso && item.due_on <= limitIso)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  const month = todayIso.slice(0, 7);
  const dueMonth = data.items.filter((item) => item.kind !== "income" && item.due_on.startsWith(month));
  const dueTotal = dueMonth.reduce((sum, item) => sum + item.amount_cents, 0);
  const byCategory = new Map<string, number>();
  for (const item of dueMonth) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount_cents);
  const slices = [...byCategory.entries()].map(([label, cents], index) => ({ label, cents, color: TINTS[index % TINTS.length] }));
  const owners = new Map<string, string[]>();
  for (const item of data.items.filter((item) => item.kind === "bill" || item.kind === "renewal")) {
    owners.set(item.owner, [...(owners.get(item.owner) ?? []), item.title]);
  }
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0) || 1;
  let offset = 0;
  const radius = 15.5;
  const circ = 2 * Math.PI * radius;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Due this month" value={aud(dueTotal)} />
        <Stat label="Next 30 days" value={String(upcoming.length)} />
        <Stat label="People" value={String(data.people.length)} />
      </div>
      <section className="rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-neutral-text">Next 30 days</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-text-2">Nothing is dated in the next 30 days.</p>
        ) : (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {upcoming.map((item) => (
              <div key={item.id} className="min-w-[148px] rounded-2xl border border-neutral-border bg-neutral-bg px-3 py-3">
                <div className="text-xs text-neutral-muted">{dayLabel(item.due_on)}</div>
                <div className="mt-1 text-sm font-medium text-neutral-text">{item.title}</div>
                <div className="text-sm text-cfo">{aud(item.amount_cents)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-neutral-text">Due this month</h2>
          {slices.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-text-2">No amounts are dated this month.</p>
          ) : (
            <div className="mt-3 flex items-center gap-4">
              <svg viewBox="0 0 42 42" className="h-28 w-28 shrink-0" role="img" aria-label="Amounts due this month by category">
                {slices.map((slice) => {
                  const len = (slice.cents / total) * circ;
                  const node = (
                    <circle
                      key={slice.label}
                      cx="21"
                      cy="21"
                      r={radius}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="6"
                      strokeDasharray={`${len} ${circ - len}`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 21 21)"
                    />
                  );
                  offset += len;
                  return node;
                })}
              </svg>
              <ul className="space-y-1 text-sm text-neutral-text-2">
                {slices.map((slice) => (
                  <li key={slice.label} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: slice.color }} />
                    {slice.label} · {aud(slice.cents)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-neutral-text">Who looks after what</h2>
          <ul className="mt-3 space-y-3">
            {[...owners.entries()].map(([name, titles]) => (
              <li key={name} className="flex items-start gap-3">
                <Avatar name={name} />
                <div>
                  <div className="text-sm font-medium text-neutral-text">{name}</div>
                  <div className="text-sm text-neutral-text-2">{titles.slice(0, 3).join(", ")}{titles.length > 3 ? ` +${titles.length - 3}` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
          {reminders.length ? (
            <p className="mt-3 text-sm text-neutral-text-2">{reminders.length} reminder{reminders.length === 1 ? "" : "s"} in the app.</p>
          ) : null}
        </section>
      </div>
      <How>Due dates show here for everyone in the household. Reminders aren&apos;t emailed in this beta. Figures are what was typed, or the sample when that is on.</How>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-border bg-white px-4 py-3">
      <div className="text-xs text-neutral-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-text">{value}</div>
    </div>
  );
}

function BillsView({ items }: { items: SampleItem[] }) {
  const bills = oneOffBillItems(items);
  const groups = new Map<string, SampleItem[]>();
  for (const item of bills) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  if (!bills.length) {
    return <EmptyState label="No one-off bills or renewals added via Add things yet." href="/start" action="Add things" />;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-text-2">
        One-off bills and renewals added via Add things. Your recurring bills are tracked separately below.
      </p>
      {[...groups.entries()].map(([category, rows]) => (
        <section key={category} className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-text">
            <CategoryIcon category={category} />
            {category}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((item) => (
              <article key={item.id} className="rounded-2xl border border-neutral-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-neutral-text">{item.title}</div>
                    <div className="text-sm text-neutral-text-2">{item.owner}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-neutral-text">{aud(item.amount_cents)}</div>
                    <div className="mt-1 inline-block rounded-full bg-cfo-soft px-2 py-0.5 text-xs text-cfo">
                      {item.due_on ? dayLabel(item.due_on) : item.cadence}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <How>These are one-off bills and renewals entered via Add things, not your recurring bills. They are not counted as recurring and do not appear in Budget&apos;s monthly picture.</How>
    </div>
  );
}

function IncomeView({ items }: { items: SampleItem[] }) {
  const rows = oneOffIncomeItems(items);
  if (!rows.length) {
    return <EmptyState label="No one-off income added via Add things yet." href="/start" action="Add things" />;
  }
  const monthly = rows.map((item) => ({ ...item, month: monthlyCents(item.amount_cents, item.cadence) }));
  const max = Math.max(...monthly.map((item) => item.month), 1);
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-neutral-text">One-off income added via Add things</h2>
      <p className="text-xs text-neutral-text-2">Your recurring income is tracked separately below.</p>
      {monthly.map((item) => (
        <div key={item.id}>
          <div className="mb-1 flex justify-between text-sm text-neutral-text">
            <span>{item.title}</span>
            <span>{aud(item.month)}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-neutral-bg">
            <div className="h-full rounded-full bg-cfo" style={{ width: `${(item.month / max) * 100}%` }} />
          </div>
          <div className="mt-1 text-xs text-neutral-muted">{aud(item.amount_cents)} · {item.cadence}</div>
        </div>
      ))}
      <How>Each bar is a one-off income item entered via Add things, restated as a month. Fortnightly pay is counted 26 times a year, then divided by 12. These are not your recurring income sources.</How>
    </div>
  );
}

function BudgetView({ items }: { items: SampleItem[] }) {
  // One-off items captured via Add things, kept deliberately separate from
  // the recurring_income/recurring_bills picture Budget's own "Monthly
  // picture" section shows -- this does NOT compute a combined
  // income-minus-out figure, since that would read as a second, competing
  // budget total. See Budget's "Monthly picture" for the one authoritative
  // recurring number.
  const income = oneOffIncomeMonthlyCents(items);
  const out = oneOffBillsMonthlyCents(items);
  if (!hasOneOffIncome(items) && !hasOneOffBills(items)) {
    return <EmptyState label="No one-off income, bills, or renewals added via Add things yet." href="/start" action="Add things" />;
  }
  const max = Math.max(income, out, 1);
  return (
    <div className="space-y-4 rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
      <p className="text-sm text-neutral-text-2">
        One-off income, bills, and renewals added via Add things. Your recurring monthly picture is below.
      </p>
      <Bar label="One-off income entered" cents={income} max={max} color="#1F5E5C" />
      <Bar label="One-off bills & renewals entered" cents={out} max={max} color="#8A8F8C" />
      <How>Each bar restates a one-off item entered via Add things as a month. These are not recurring and are not part of the monthly picture below.</How>
    </div>
  );
}

function Bar({ label, cents, max, color }: { label: string; cents: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-neutral-text">
        <span>{label}</span>
        <span>{aud(cents)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-neutral-bg">
        <div className="h-full rounded-full" style={{ width: `${(cents / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function YearView({ items }: { items: SampleItem[] }) {
  const renewals = items.filter((item) => (item.kind === "bill" || item.kind === "renewal") && item.due_on);
  if (!renewals.length) return <EmptyState label="No renewal dates are listed yet." href="/start" action="Add things" />;
  const start = new Date();
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const rows = renewals.filter((item) => monthKey(item.due_on) === key);
    return {
      key,
      label: date.toLocaleDateString("en-AU", { month: "short" }),
      cents: rows.reduce((sum, item) => sum + item.amount_cents, 0),
      count: rows.length,
    };
  });
  const max = Math.max(...months.map((month) => month.cents), 1);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-12">
        {months.map((month) => (
          <div
            key={month.key}
            className="rounded-2xl border border-neutral-border px-2 py-3"
            style={{ background: `rgba(31, 94, 92, ${month.cents ? 0.08 + 0.42 * (month.cents / max) : 0.03})` }}
          >
            <div className="text-xs text-neutral-text">{month.label}</div>
            <div className="mt-2 text-sm font-medium text-neutral-text">{month.count}</div>
            <div className="text-xs text-neutral-text-2">{month.cents ? aud(month.cents) : "—"}</div>
          </div>
        ))}
      </div>
      <How>Each month shows how many entered bills or renewals fall in it, and the sum of those amounts. A deeper tint means a larger sum.</How>
    </div>
  );
}

function SpendingView({ data, realCategories }: { data: SampleHousehold; realCategories: { name: string; cents: number }[] | null }) {
  const sampleOn = realCategories == null;
  const outflows = data.transactions.filter((row) => row.amount_cents < 0);
  const byCategory = new Map<string, number>();
  for (const row of sampleOn ? outflows : []) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + Math.abs(row.amount_cents));
  const categories = sampleOn
    ? [...byCategory.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents)
    : realCategories;
  if (!categories.length) return <EmptyState label="No bank file has been imported yet." href="/money/import" action="Upload a bank file (CSV)" />;
  const max = Math.max(...categories.map((row) => row.cents), 1);
  const byMonth = new Map<string, number>();
  for (const row of outflows) {
    const key = monthKey(row.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(row.amount_cents) / 100);
  }
  const labels = [...byMonth.keys()].sort();
  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-neutral-text">By category</h2>
        {categories.map((row) => (
          <div key={row.name}>
            <div className="mb-1 flex justify-between text-sm text-neutral-text">
              <span>{row.name}</span>
              <span>{aud(row.cents)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-neutral-bg">
              <div className="h-full rounded-full bg-cfo" style={{ width: `${(row.cents / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </section>
      {sampleOn && labels.length > 1 ? (
        <section className="rounded-2xl border border-neutral-border bg-white p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold text-neutral-text">Money out by month</h2>
          <LineChart
            labels={labels.map((key) => {
              const [year, month] = key.split("-");
              return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-AU", { month: "short" });
            })}
            series={[{ id: "out", label: "Money out", values: labels.map((key) => byMonth.get(key) ?? 0), strokeClass: "stroke-cfo", fillClass: "fill-cfo/10", swatchClass: "bg-cfo" }]}
            formatValue={(value) => aud(Math.round(value * 100))}
            ariaLabel="Money out by month"
            empty="No monthly totals yet."
          />
        </section>
      ) : null}
      <How>Category totals add the imported amounts. The sample uses three months of example rows and is not saved.</How>
    </div>
  );
}

function DecisionsView({ data }: { data: SampleHousehold }) {
  if (!data.decisions.length) return <EmptyState label="No decision notes yet." href="/decisions" action="Open decision notes" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {data.decisions.map((decision) => (
        <article key={decision.id} className="rounded-2xl border border-neutral-border bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-text">{decision.title}</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-text-2">{decision.note}</p>
          {decision.review_on ? <p className="mt-3 text-xs text-cfo">Review {dayLabel(decision.review_on)}</p> : null}
        </article>
      ))}
    </div>
  );
}

function HouseholdView({ data }: { data: SampleHousehold }) {
  const people = data.people.length ? data.people : [];
  if (!people.length && !data.pets.length) return <EmptyState label="No one is listed in this household yet." href="/household" action="Open household" />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {people.map((person) => (
        <article key={person.name} className="flex items-center gap-3 rounded-2xl border border-neutral-border bg-white p-4">
          <Avatar name={person.name} />
          <div>
            <div className="text-sm font-medium text-neutral-text">{person.name}</div>
            <div className="text-sm text-neutral-text-2">{person.role}</div>
          </div>
        </article>
      ))}
      {data.pets.map((pet) => (
        <article key={pet.name} className="flex items-center gap-3 rounded-2xl border border-neutral-border bg-white p-4">
          <Avatar name={pet.name} />
          <div>
            <div className="text-sm font-medium text-neutral-text">{pet.name}</div>
            <div className="text-sm text-neutral-text-2">{pet.kind}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function PageGlance({ page, picture }: { page: GlancePage; picture?: RealPicture | null }) {
  const { on } = useSampleMode();
  const [loaded, setLoaded] = useState<RealPicture | null>(picture ?? null);
  const [realSpend, setRealSpend] = useState<{ name: string; cents: number }[] | null>(null);

  useEffect(() => {
    if (picture !== undefined || page === "home") return;
    let cancelled = false;
    fetch("/api/picture", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: RealPicture) => {
        if (!cancelled && json && Array.isArray(json.items)) setLoaded(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page, picture]);

  useEffect(() => {
    if (picture) setLoaded(picture);
  }, [picture]);

  useEffect(() => {
    if (page !== "spending" || on) return;
    let cancelled = false;
    fetch("/api/spending/review", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { categories?: { name: string; cents: number }[] }) => {
        if (!cancelled) setRealSpend(json.categories ?? []);
      })
      .catch(() => {
        if (!cancelled) setRealSpend([]);
      });
    return () => {
      cancelled = true;
    };
  }, [page, on]);

  const source = picture ?? loaded;
  const realEmpty = !source || source.items.length === 0;
  const data = on ? buildSampleHousehold() : source ? fromPicture(source) : null;
  const showOffer = !on && source != null && realEmpty;

  return (
    <div className="space-y-3">
      {showOffer ? <SampleOffer /> : null}
      <SampleStrip />
      {!data ? <p className="text-sm text-neutral-text-2">Loading…</p> : null}
      {data && page === "home" ? <HomeView data={data} reminders={on ? [] : source?.reminders ?? []} /> : null}
      {data && page === "bills" ? <BillsView items={data.items} /> : null}
      {data && page === "income" ? <IncomeView items={data.items} /> : null}
      {data && page === "budget" ? <BudgetView items={data.items} /> : null}
      {data && page === "year" ? <YearView items={data.items} /> : null}
      {data && page === "spending" && on ? <SpendingView data={data} realCategories={null} /> : null}
      {page === "spending" && !on && realSpend ? <SpendingView data={{ people: [], pets: [], items: [], transactions: [], decisions: [] }} realCategories={realSpend} /> : null}
      {data && page === "decisions" ? <DecisionsView data={data} /> : null}
      {data && page === "household" ? <HouseholdView data={data} /> : null}
    </div>
  );
}
