"use client";

import { useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip } from "@/components/ui";
import { BarChart } from "@/components/charts/BrandCharts";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { SampleStrip, useSampleMode } from "@/lib/demo/sampleMode";
import { buildSampleGoals } from "@/lib/demo/sampleMoneyViews";
import { supabase } from "@/lib/supabaseClient";
import { resolveActiveHouseholdIdClient } from "@/lib/households/resolveActiveHouseholdClient";

const STARTING_SLIDER_MAX = 50000;
const STARTING_STEP = 1000;
const MONTHLY_SLIDER_MAX = 1500;
const MONTHLY_STEP = 50;
const YEARS_SLIDER_MAX = 15;
const YEARS_EXACT_MAX = 50;

type MoneyGoalRow = {
  id: string;
  title: string | null;
  current_cents: number | null;
  currency: string | null;
  deadline_at: string | null;
};

type GoalForPicker = {
  id: string;
  title: string;
  currentCents: number;
  currency: string;
  deadlineAt: string | null;
};

function parseDollars(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function digitsOnly(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

function dollarsOnly(raw: string): string {
  return raw.replace(/[^0-9.]/g, "");
}

function pluralYears(n: number): string {
  return `${n} year${n === 1 ? "" : "s"}`;
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function yearsUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const now = Date.now();
  if (ms <= now) return 1;
  const diffYears = (ms - now) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.min(YEARS_EXACT_MAX, Math.max(1, Math.ceil(diffYears)));
}

function AmountField({
  label,
  helper,
  text,
  onTextChange,
  onBlurClamp,
  sliderMax,
  step,
}: {
  label: string;
  helper: string;
  text: string;
  onTextChange: (value: string) => void;
  onBlurClamp: () => void;
  sliderMax: number;
  step: number;
}) {
  const liveDollars = parseDollars(text) ?? 0;
  const sliderValue = Math.min(sliderMax, Math.max(0, Math.round(liveDollars / step) * step));

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-zinc-900">{label}</div>
        <div className="text-xs text-zinc-500">{helper}</div>
      </div>
      <input
        type="range"
        min={0}
        max={sliderMax}
        step={step}
        value={sliderValue}
        onChange={(event) => onTextChange(event.target.value)}
        className="w-full accent-cfo"
        aria-label={`${label} slider, $0 to $${sliderMax.toLocaleString()}`}
      />
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>$0</span>
        <span>${sliderMax.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-zinc-500">Exact amount</div>
        <div className="flex items-center gap-1">
          <span className="text-sm text-zinc-500">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={text}
            onChange={(event) => onTextChange(dollarsOnly(event.target.value))}
            onBlur={onBlurClamp}
            placeholder="0"
            className="w-32 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </div>
      </div>
      <div className="text-[11px] text-zinc-500">Typing a number here can go above ${sliderMax.toLocaleString()}.</div>
    </div>
  );
}

function YearsField({ text, onTextChange, onBlurClamp }: { text: string; onTextChange: (value: string) => void; onBlurClamp: () => void }) {
  const liveYears = Math.min(YEARS_SLIDER_MAX, Math.max(1, parseInt(text, 10) || 1));

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold text-zinc-900">Years</div>
        <div className="text-xs text-zinc-500">How many years to project.</div>
      </div>
      <input
        type="range"
        min={1}
        max={YEARS_SLIDER_MAX}
        step={1}
        value={liveYears}
        onChange={(event) => onTextChange(event.target.value)}
        className="w-full accent-cfo"
        aria-label="Years slider, 1 to 15 years"
      />
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>1 year</span>
        <span>15 years</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-zinc-500">Exact years</div>
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(event) => onTextChange(digitsOnly(event.target.value))}
          onBlur={onBlurClamp}
          placeholder="1"
          className="w-20 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>
      <div className="text-[11px] text-zinc-500">Exact years can be set from 1 to {YEARS_EXACT_MAX}.</div>
    </div>
  );
}

export default function WhatIfClient() {
  const { on: sampleOn } = useSampleMode();

  const [startingText, setStartingText] = useState("");
  const [monthlyText, setMonthlyText] = useState("");
  const [yearsText, setYearsText] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerGoals, setPickerGoals] = useState<GoalForPicker[] | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);

  const startingDollars = parseDollars(startingText) ?? 0;
  const monthlyDollars = parseDollars(monthlyText) ?? 0;
  const yearsNum = Math.min(YEARS_EXACT_MAX, Math.max(1, parseInt(yearsText, 10) || 1));

  const startingCents = Math.round(startingDollars * 100);
  const monthlyCents = Math.round(monthlyDollars * 100);
  const addedCents = monthlyCents * 12 * yearsNum;
  const projectedTotalCents = startingCents + addedCents;

  const hasAnyInput = startingCents > 0 || monthlyCents > 0;

  const chartLabels = ["Now", ...Array.from({ length: yearsNum }, (_, i) => `Year ${i + 1}`)];
  const chartValues = [startingCents, ...Array.from({ length: yearsNum }, (_, i) => startingCents + monthlyCents * 12 * (i + 1))];

  function clampStarting() {
    const n = parseDollars(startingText);
    setStartingText(n == null ? "" : String(Math.max(0, n)));
  }
  function clampMonthly() {
    const n = parseDollars(monthlyText);
    setMonthlyText(n == null ? "" : String(Math.max(0, n)));
  }
  function clampYears() {
    const n = parseInt(yearsText, 10);
    setYearsText(Number.isFinite(n) ? String(Math.min(YEARS_EXACT_MAX, Math.max(1, n))) : "");
  }

  function reset() {
    setStartingText("");
    setMonthlyText("");
    setYearsText("");
    setPickerOpen(false);
  }

  async function openPicker() {
    setPickerOpen((open) => !open);
    if (pickerGoals != null) return;

    if (sampleOn) {
      const sample = buildSampleGoals();
      setPickerGoals(
        sample.map((g) => ({
          id: g.id,
          title: g.title ?? "Goal",
          currentCents: g.current_cents ?? 0,
          currency: g.currency ?? "AUD",
          deadlineAt: g.deadline_at ?? null,
        }))
      );
      return;
    }

    setPickerLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        setPickerGoals([]);
        return;
      }
      const householdId = await resolveActiveHouseholdIdClient(supabase, userId);
      if (!householdId) {
        setPickerGoals([]);
        return;
      }
      const res = await supabase
        .from("money_goals")
        .select("id,title,current_cents,currency,deadline_at")
        .eq("household_id", householdId);
      if (res.error) throw res.error;
      setPickerGoals(
        ((res.data ?? []) as MoneyGoalRow[]).map((g) => ({
          id: g.id,
          title: String(g.title ?? "Goal"),
          currentCents: typeof g.current_cents === "number" ? g.current_cents : 0,
          currency: String(g.currency ?? "AUD"),
          deadlineAt: g.deadline_at ?? null,
        }))
      );
    } catch {
      setPickerGoals([]);
    } finally {
      setPickerLoading(false);
    }
  }

  function applyGoalNumbers(goal: GoalForPicker) {
    setStartingText(String(Math.max(0, goal.currentCents / 100)));
    const years = yearsUntil(goal.deadlineAt);
    if (years != null) setYearsText(String(years));
    setPickerOpen(false);
  }

  return (
    <Page title="What if?" subtitle="Try numbers and see a projection. Nothing on this page is saved.">
      <div className="mx-auto w-full max-w-[900px] space-y-4 px-4 sm:px-6">
        <SampleStrip />

        <Card className="border-zinc-200 bg-white">
          <CardContent className="text-xs text-zinc-600">
            This is simple addition: starting amount plus (amount each month × 12 × years). It does not include
            interest, inflation, fees or withdrawals.
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-5">
            <div className="text-sm font-semibold text-zinc-900">Try some numbers</div>

            <AmountField
              label="Starting amount"
              helper="A number you choose to start from."
              text={startingText}
              onTextChange={setStartingText}
              onBlurClamp={clampStarting}
              sliderMax={STARTING_SLIDER_MAX}
              step={STARTING_STEP}
            />

            <AmountField
              label="Amount added each month"
              helper="A number you choose to add every month."
              text={monthlyText}
              onTextChange={setMonthlyText}
              onBlurClamp={clampMonthly}
              sliderMax={MONTHLY_SLIDER_MAX}
              step={MONTHLY_STEP}
            />

            <YearsField text={yearsText} onTextChange={setYearsText} onBlurClamp={clampYears} />

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
              <Button variant="secondary" onClick={reset} className="rounded-2xl">
                Reset
              </Button>
              <Chip onClick={() => void openPicker()} className="text-xs">
                {pickerOpen ? "Hide goal numbers" : "Use a goal's numbers"}
              </Chip>
            </div>

            {pickerOpen ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-600">
                  This reads your goals for reference only. It is not saved here, and it does not change your goals.
                </div>
                <div className="mt-2 space-y-1.5">
                  {pickerLoading ? (
                    <div className="text-xs text-zinc-500">Loading…</div>
                  ) : !pickerGoals || pickerGoals.length === 0 ? (
                    <div className="text-xs text-zinc-500">No goals are set up yet.</div>
                  ) : (
                    pickerGoals.map((goal) => (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => applyGoalNumbers(goal)}
                        className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:border-zinc-300"
                      >
                        {goal.title} — {formatMoneyFromCents(goal.currentCents, goal.currency)} saved
                        {goal.deadlineAt ? `, target ${fmtDateShort(goal.deadlineAt)}` : ""}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="text-sm font-semibold text-zinc-900">Projection</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="text-xs text-zinc-500">Starting amount</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">{formatMoneyFromCents(startingCents, "AUD")}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Added over {pluralYears(yearsNum)}</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">{formatMoneyFromCents(addedCents, "AUD")}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Projected total</div>
                <div className="mt-1 text-lg font-semibold text-zinc-900">{formatMoneyFromCents(projectedTotalCents, "AUD")}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">Projected total by year</div>
            <div className="mt-3">
              <BarChart
                labels={chartLabels}
                values={chartValues}
                formatValue={(value) => formatMoneyFromCents(value, "AUD")}
                ariaLabel="Projected total by year, bar chart"
                empty="A chart appears once a starting amount or a monthly amount is entered."
                maxLabels={13}
              />
            </div>
            {!hasAnyInput ? null : (
              <div className="mt-2 text-[11px] text-zinc-500">AUD. Hover a bar for the exact amount.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
