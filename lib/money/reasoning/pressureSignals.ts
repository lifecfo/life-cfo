import {
  HouseholdMoneyTruth,
  RecurringBillTruth,
  RecurringIncomeTruth,
  TransactionTruth,
  AccountTruth,
  ConnectionTruth,
  MoneyCadence,
} from "./types";

type PressureLevel = "none" | "low" | "medium" | "high";

export type PressureSignal = {
  name:
    | "structural_pressure"
    | "discretionary_drift"
    | "timing_mismatch"
    | "stability_risk";
  level: PressureLevel;
  score: number; // 0..1 scaled pressure score
  summary: string;
  drivers: string[];
  evidence: Record<string, string | number | boolean | null>;
};

export type PressureSignals = {
  structural_pressure: PressureSignal;
  discretionary_drift: PressureSignal;
  timing_mismatch: PressureSignal;
  stability_risk: PressureSignal;
};

export function evaluatePressureSignals(truth: HouseholdMoneyTruth): PressureSignals {
  return {
    structural_pressure: evaluateStructuralPressure(truth),
    discretionary_drift: evaluateDiscretionaryDrift(truth),
    timing_mismatch: evaluateTimingMismatch(truth),
    stability_risk: evaluateStabilityRisk(truth),
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function levelFromScore(score: number): PressureLevel {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  if (score > 0.15) return "low";
  return "none";
}

function safeCents(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function monthlyFactor(cadence: MoneyCadence): number {
  switch (cadence) {
    case "weekly":
      return 52 / 12;
    case "fortnightly":
      return 26 / 12;
    case "quarterly":
      return 1 / 3;
    case "annual":
    case "yearly":
      return 1 / 12;
    case "monthly":
    default:
      return 1;
  }
}

function safeDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function msFromDays(days: number): number {
  return days * 24 * 60 * 60 * 1000;
}

function evaluateStructuralPressure(truth: HouseholdMoneyTruth): PressureSignal {
  const monthlyIncome = sumMonthly(truth.recurringIncome);
  const monthlyBills = sumMonthly(truth.recurringBills);

  const share = monthlyIncome > 0 ? monthlyBills / monthlyIncome : 1;
  const score = clamp01(share);

  const drivers: string[] = [];
  if (monthlyIncome <= 0) {
    drivers.push("No active recurring income; commitments treated as fully loaded.");
  } else {
    drivers.push(`Recurring bills use ${Math.round(share * 100)}% of recurring income.`);
  }

  const summary =
    monthlyIncome <= 0
      ? "Structural pressure is high because recurring income is missing."
      : share >= 0.75
        ? "A large share of recurring income is already committed."
        : share >= 0.5
          ? "Commitments consume a meaningful share of recurring income."
          : "Commitments leave room for discretionary choices.";

  return {
    name: "structural_pressure",
    level: levelFromScore(score),
    score,
    summary,
    drivers,
    evidence: {
      recurring_income_monthly_cents: monthlyIncome,
      recurring_bills_monthly_cents: monthlyBills,
      committed_share: Number.isFinite(share) ? Number(share.toFixed(3)) : null,
      bills_count: truth.recurringBills.length,
      income_count: truth.recurringIncome.length,
    },
  };
}

function evaluateDiscretionaryDrift(truth: HouseholdMoneyTruth): PressureSignal {
  const asOfMs = safeDate(truth.asOf);
  const recentWindowMs = msFromDays(30);
  const priorWindowMs = msFromDays(60);

  const recentOut = sumOutflows(truth.transactions, asOfMs ? asOfMs - recentWindowMs : null, asOfMs);
  const priorOut = sumOutflows(
    truth.transactions,
    asOfMs ? asOfMs - priorWindowMs : null,
    asOfMs ? asOfMs - recentWindowMs : null
  );

  const drift =
    priorOut > 0 ? clamp01((recentOut - priorOut) / priorOut) : recentOut > 0 ? 1 : 0;
  const score = clamp01(drift);

  const drivers: string[] = [];
  if (priorOut > 0) {
    const pct = Math.round(((recentOut - priorOut) / priorOut) * 100);
    drivers.push(`Recent discretionary-like outflow is ${pct >= 0 ? "+" : ""}${pct}% vs prior 30 days.`);
  } else if (recentOut > 0) {
    drivers.push("No prior window spending; recent outflow present.");
  } else {
    drivers.push("No discretionary outflow detected in either window.");
  }

  const summary =
    priorOut === 0 && recentOut === 0
      ? "Discretionary drift cannot be assessed because no recent outflow exists."
      : score >= 0.6
        ? "Flexible spending is running well above the prior period."
        : score >= 0.3
          ? "Flexible spending is moderately above the prior period."
          : score > 0
            ? "Flexible spending is slightly above the prior period."
            : "Flexible spending is at or below the prior period.";

  return {
    name: "discretionary_drift",
    level: levelFromScore(score),
    score,
    summary,
    drivers,
    evidence: {
      recent_outflow_cents: recentOut,
      prior_outflow_cents: priorOut,
      drift_ratio: Number.isFinite(drift) ? Number(drift.toFixed(3)) : null,
      window_days: 30,
    },
  };
}

function evaluateTimingMismatch(truth: HouseholdMoneyTruth): PressureSignal {
  const asOfMs = safeDate(truth.asOf);
  const nextIncome = earliestActiveDate(truth.recurringIncome, "next_pay_at", asOfMs);
  const obligationsBeforeNext = sumDueBefore(truth.recurringBills, asOfMs, nextIncome?.ms);
  const availableCash = sumAvailableCash(truth.accounts);

  const shortfall = Math.max(0, obligationsBeforeNext - availableCash);
  const base = obligationsBeforeNext || availableCash || 1;
  const score = clamp01(shortfall / base);

  const drivers: string[] = [];
  if (nextIncome) {
    drivers.push(`Next recurring income ${formatCurrency(nextIncome.amount_cents)} on ${nextIncome.date}.`);
  } else {
    drivers.push("No upcoming income date provided; timing treated as late.");
  }

  if (obligationsBeforeNext > 0) {
    drivers.push(`${formatCurrency(obligationsBeforeNext)} in bills fall before the next income date.`);
  } else {
    drivers.push("No active bills land before the next income date.");
  }

  if (shortfall > 0) {
    drivers.push(`Cash shortfall of ${formatCurrency(shortfall)} before income arrives.`);
  }

  const summary =
    score >= 0.75
      ? "Key obligations land before income and exceed available cash."
      : score >= 0.4
        ? "Some obligations precede income and may strain cash."
        : "Income timing appears adequate for upcoming obligations.";

  return {
    name: "timing_mismatch",
    level: levelFromScore(score),
    score,
    summary,
    drivers,
    evidence: {
      available_cash_cents: availableCash,
      obligations_before_income_cents: obligationsBeforeNext,
      next_income_cents: nextIncome?.amount_cents ?? null,
      next_income_date: nextIncome?.date ?? null,
      shortfall_cents: shortfall,
    },
  };
}

function evaluateStabilityRisk(truth: HouseholdMoneyTruth): PressureSignal {
  const incomeCount = truth.recurringIncome.filter((i) => i.active !== false).length;
  const billCount = truth.recurringBills.filter((b) => b.active !== false).length;
  const latestSyncAge = maxConnectionAgeDays(truth.connections ?? [], truth.asOf);

  const incomeComponent = incomeCount === 0 ? 1 : incomeCount === 1 ? 0.5 : 0.2;
  const balanceComponent = billCount > 0 && incomeCount === 0 ? 1 : 0; // obligations without income
  const freshnessComponent = clamp01(latestSyncAge / 14);

  const components = [incomeComponent, balanceComponent, freshnessComponent].filter(
    (v) => Number.isFinite(v) && v >= 0
  );

  const score =
    components.length > 0
      ? clamp01(components.reduce((sum, v) => sum + v, 0) / components.length)
      : 0;

  const drivers: string[] = [];
  drivers.push(incomeCount === 0 ? "No active recurring income sources." : `${incomeCount} recurring income sources present.`);
  if (billCount > 0 && incomeCount === 0) {
    drivers.push("Bills exist without matched recurring income.");
  } else if (billCount > 0) {
    drivers.push(`${billCount} active recurring bills.`);
  }
  drivers.push(
    latestSyncAge === Infinity
      ? "No connection freshness data available."
      : `Latest connection sync is ${Math.round(latestSyncAge)} day(s) old.`
  );

  const summary =
    score >= 0.75
      ? "Income reliability and data freshness look unstable."
      : score >= 0.5
        ? "Income coverage or data freshness is mixed; monitor stability."
        : score > 0.15
          ? "Income and data look mostly stable with some variability."
          : "Income rhythm and data freshness appear stable.";

  return {
    name: "stability_risk",
    level: levelFromScore(score),
    score,
    summary,
    drivers,
    evidence: {
      income_sources: incomeCount,
      bill_count: billCount,
      latest_connection_age_days: Number.isFinite(latestSyncAge) ? Number(latestSyncAge.toFixed(1)) : null,
    },
  };
}

function sumMonthly(items: RecurringBillTruth[] | RecurringIncomeTruth[]): number {
  return items
    .filter((i) => (i as any)?.active !== false)
    .reduce((sum, item: any) => {
      const cents = safeCents(item.amount_cents);
      const factor = monthlyFactor(item.cadence as MoneyCadence);
      return sum + cents * factor;
    }, 0);
}

function sumOutflows(
  txs: TransactionTruth[],
  startMs: number | null,
  endMs: number | null
): number {
  return txs
    .filter((t) => {
      const ms = safeDate(t.date);
      if (ms === null) return false;
      if (startMs !== null && ms < startMs) return false;
      if (endMs !== null && ms > endMs) return false;
      return true;
    })
    .reduce((sum, t) => {
      const cents = safeCents(t.amount_cents);
      return cents < 0 ? sum + Math.abs(cents) : sum;
    }, 0);
}

function earliestActiveDate(
  items: RecurringIncomeTruth[],
  field: "next_pay_at",
  asOfMs: number | null
): { ms: number; date: string; amount_cents: number } | null {
  const filtered = items
    .filter((i) => i.active !== false)
    .map((i) => {
      const ms = safeDate((i as any)[field]);
      return { item: i, ms };
    })
    .filter((x) => x.ms !== null && (asOfMs === null || (x.ms as number) >= asOfMs))
    .sort((a, b) => (a.ms as number) - (b.ms as number));

  if (!filtered.length) return null;
  const first = filtered[0];
  return {
    ms: first.ms as number,
    date: (first.item as any)[field] as string,
    amount_cents: first.item.amount_cents,
  };
}

function sumDueBefore(
  bills: RecurringBillTruth[],
  asOfMs: number | null,
  cutoffMs: number | undefined
): number {
  const limit = typeof cutoffMs === "number" ? cutoffMs : asOfMs !== null ? asOfMs + msFromDays(30) : null;
  return bills
    .filter((b) => b.active !== false)
    .map((b) => ({ ms: safeDate(b.next_due_at), amount: safeCents(b.amount_cents) }))
    .filter((b) => {
      if (b.ms === null) return false;
      if (asOfMs !== null && b.ms < asOfMs) return false;
      if (limit !== null && b.ms > limit) return false;
      return true;
    })
    .reduce((sum, b) => sum + b.amount, 0);
}

function sumAvailableCash(accounts: AccountTruth[]): number {
  return accounts.reduce((sum, a) => {
    const avail = typeof a.available_balance_cents === "number" ? a.available_balance_cents : null;
    const current = safeCents(a.current_balance_cents);
    return sum + safeCents(avail ?? current);
  }, 0);
}

function maxConnectionAgeDays(connections: ConnectionTruth[], asOf: string): number {
  if (!connections.length) return Infinity;
  const asOfMs = safeDate(asOf);
  if (asOfMs === null) return Infinity;

  const ages = connections
    .map((c) => safeDate(c.last_sync_at || c.updated_at || null))
    .filter((ms): ms is number => ms !== null)
    .map((ms) => (asOfMs - ms) / msFromDays(1))
    .filter((d) => Number.isFinite(d) && d >= 0);

  if (!ages.length) return Infinity;
  return Math.max(...ages);
}

function formatCurrency(cents: number): string {
  const dollars = safeCents(cents) / 100;
  return `$${dollars.toFixed(0)}`;
}
