// src/engine/domain/forecast.ts
import type { Bill } from "./types";

export type ForecastResult = {
  startBalance: number;
  endingBalance30d: number;
  lowestBalance30d: number;
  safeToSpendThisWeek: number;
  upcomingBills: { date: string; merchant_key: string; amount: number }[];
};

function todayISO(): string {
  const now = new Date();
  // convert "today in local time" to YYYY-MM-DD without timezone surprises
  const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return localMidnight.toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z"); // UTC midnight
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// v1: interpret due_day_or_date as either "YYYY-MM-DD" or day-of-month like "15"
function billDueDatesWithin30Days(bill: Bill, startISO: string): string[] {
  const raw = bill.due_day_or_date.trim();

  // If it's an absolute date, use it if within range
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return [raw];
  }

  // If it's a day-of-month, generate next occurrence(s) within 30 days
  const day = Number(raw);
  if (!Number.isFinite(day) || day < 1 || day > 31) return [];

  const start = new Date(startISO + "T00:00:00");
  const dates: string[] = [];

  // current month
  const d1 = new Date(Date.UTC(start.getFullYear(), start.getMonth(), day));
  // next month
  const d2 = new Date(Date.UTC(start.getFullYear(), start.getMonth() + 1, day));

  for (const d of [d1, d2]) {
    const iso = d.toISOString().slice(0, 10);
    // include if within [start, start+30]
    const endISO = addDaysISO(startISO, 30);
    if (iso >= startISO && iso <= endISO) dates.push(iso);
  }

  return dates;
}

export function forecastCashflow30d(params: {
  startBalance: number;
  bills: Bill[];
  startDateISO?: string; // default today
}): ForecastResult {
  const startDateISO = params.startDateISO ?? todayISO();
  const endDateISO = addDaysISO(startDateISO, 30);

  const activeBills = params.bills.filter((b) => (b.status ?? "active") === "active");

  const upcomingBills: { date: string; merchant_key: string; amount: number }[] = [];

  for (const b of activeBills) {
    const dueDates = billDueDatesWithin30Days(b, startDateISO);
    const amt = Math.abs(b.expected_amount ?? 0);
    for (const date of dueDates) {
      if (date >= startDateISO && date <= endDateISO && amt > 0) {
        upcomingBills.push({ date, merchant_key: b.merchant_key, amount: amt });
      }
    }
  }

  upcomingBills.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // simulate running balance
  let bal = params.startBalance;
  let lowest = bal;

  for (const item of upcomingBills) {
    bal -= item.amount;
    if (bal < lowest) lowest = bal;
  }

  const endingBalance30d = bal;

  // v1 safe-to-spend: (start balance - bills due in next 7 days) / 7 * 7 (i.e. what's left for week)
 const startMs = Date.parse(startDateISO + "T00:00:00Z");
 const endMs = Date.parse(addDaysISO(startDateISO, 7) + "T00:00:00Z");

 const billsNext7 = upcomingBills
  .filter((b) => {
    const ms = Date.parse(b.date + "T00:00:00Z");
    return ms >= startMs && ms <= endMs;
  })
  .reduce((s, b) => s + b.amount, 0);

  const safeToSpendThisWeek = Math.max(0, params.startBalance - billsNext7);

  return {
    startBalance: params.startBalance,
    endingBalance30d,
    lowestBalance30d: lowest,
    safeToSpendThisWeek,
    upcomingBills,
  };
}
