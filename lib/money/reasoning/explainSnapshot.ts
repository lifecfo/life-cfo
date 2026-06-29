import { FinancialSnapshot } from "./buildFinancialSnapshot";
import { PressureSignals } from "./pressureSignals";
import { interpretPressure, PressureInterpretation } from "./interpretPressure";
import { formatMoneyFromCents } from "../formatMoney";

export type SnapshotExplanation = {
  headline: string;
  summary: string;
  insights: string[];
  pressure: {
    structural: string;
    discretionary: string;
    timing: string;
    stability: string;
  };
  interpretation: PressureInterpretation;
};

export function explainSnapshot(snapshot: FinancialSnapshot): SnapshotExplanation {
  const { pressure, income, commitments, liquidity, discretionary, connections } = snapshot;

  const headline = buildHeadline({
    structuralLevel: pressure.structural_pressure.level,
    incomeCents: income.recurringMonthlyCents,
    commitmentsCents: commitments.recurringMonthlyCents,
    discretionaryCents: discretionary.last30DayOutflowCents,
    connections,
  });
  const summary = buildSummary({
    incomeCents: income.recurringMonthlyCents,
    commitmentsCents: commitments.recurringMonthlyCents,
    cashCents: liquidity.availableCashCents,
    discretionaryCents: discretionary.last30DayOutflowCents,
    connections,
  });

  const insights = buildInsights({
    incomeCents: income.recurringMonthlyCents,
    commitmentsCents: commitments.recurringMonthlyCents,
    cashCents: liquidity.availableCashCents,
    discretionaryCents: discretionary.last30DayOutflowCents,
    connections,
  });
  const interpretation = interpretPressure(snapshot);

  return {
    headline,
    summary,
    insights,
    pressure: {
      structural: pressure.structural_pressure.summary,
      discretionary: pressure.discretionary_drift.summary,
      timing: pressure.timing_mismatch.summary,
      stability: pressure.stability_risk.summary,
    },
    interpretation,
  };
}

function buildHeadline(params: {
  structuralLevel: PressureSignals["structural_pressure"]["level"];
  incomeCents: number;
  commitmentsCents: number;
  discretionaryCents: number;
  connections: FinancialSnapshot["connections"];
}): string {
  const { structuralLevel, incomeCents, commitmentsCents, discretionaryCents, connections } = params;
  const hasIncome = incomeCents > 0;
  const hasBills = commitmentsCents > 0;
  const hasConnectedData = connections.total > 0;
  const hasFreshConnectedData = hasConnectedData && connections.stale === 0;
  const hasDemoData = (connections.demo ?? 0) > 0;

  if (!hasIncome && !hasBills) {
    if (hasDemoData) {
      return discretionaryCents > 0
        ? "Demo transactions are available. Bills are not formally set up yet, so recent money out is the starting point."
        : "Demo data is available. Income and regular payments can still be confirmed or set up.";
    }
    return hasConnectedData
      ? discretionaryCents > 0
        ? "Connected transactions are available. Bills are not formally set up yet, so recent money out is the starting point."
        : "Connected data is coming through. Income and regular payments can still be confirmed or set up."
      : "Recurring income and commitments are not set up yet.";
  }

  if (!hasIncome && hasBills) {
    return "Recurring bills are tracked but recurring income is missing.";
  }

  switch (structuralLevel) {
    case "high":
      return hasFreshConnectedData
        ? "Most recurring income is already committed right now."
        : "Most recurring income looks committed right now.";
    case "medium":
      return hasFreshConnectedData
        ? "A meaningful share of income is already committed."
        : "A meaningful share of income appears committed.";
    case "low":
    case "none":
    default:
      return hasFreshConnectedData
        ? "You still have room after recurring commitments."
        : "Recurring commitments still leave some room.";
  }
}

function buildSummary(params: {
  incomeCents: number;
  commitmentsCents: number;
  cashCents: number;
  discretionaryCents: number;
  connections: FinancialSnapshot["connections"];
}): string {
  const {
    incomeCents,
    commitmentsCents,
    cashCents,
    discretionaryCents,
    connections,
  } = params;
  const committedPct = pct(commitmentsCents, incomeCents);

  const parts: string[] = [];
  if (incomeCents > 0 && commitmentsCents > 0) {
    parts.push(`About ${committedPct}% of recurring income is already committed.`);
  } else if (incomeCents <= 0 && commitmentsCents > 0) {
    parts.push("Recurring bills are tracked but recurring income is missing.");
  } else if (incomeCents > 0 && commitmentsCents === 0) {
    parts.push("Recurring income is set up. Regular payments are still light or not fully set up.");
  } else {
    parts.push("Recurring income and commitments are not set up yet.");
  }
  parts.push(`Available cash is ${formatCurrency(cashCents)}.`);
  parts.push(`Flexible money out over the last 30 days is ${formatCurrency(discretionaryCents)}.`);
  parts.push(connectionSummaryLine(connections));

  return parts.join(" ");
}

function buildInsights(params: {
  incomeCents: number;
  commitmentsCents: number;
  cashCents: number;
  discretionaryCents: number;
  connections: FinancialSnapshot["connections"];
}): string[] {
  const { incomeCents, commitmentsCents, cashCents, discretionaryCents, connections } = params;
  const committedPct = pct(commitmentsCents, incomeCents);
  const cashMonths =
    commitmentsCents > 0 ? (cashCents / commitmentsCents).toFixed(1) : null;

  const insights: string[] = [];

  insights.push(connectionSummaryLine(connections));

  if (incomeCents > 0 && commitmentsCents > 0) {
    insights.push(`About ${committedPct}% of recurring income is already committed.`);
  } else if (incomeCents <= 0 && commitmentsCents > 0) {
    insights.push("Recurring bills are recorded but recurring income is missing.");
  } else if (incomeCents > 0 && commitmentsCents === 0) {
    insights.push("Recurring income is set up; regular payments are not fully set up yet.");
  } else {
    insights.push("Recurring income and commitments have not been set up.");
  }

  if (cashMonths) {
    insights.push(`Cash covers roughly ${cashMonths} month(s) of commitments.`);
  } else {
    insights.push(`Cash buffer is ${formatCurrency(cashCents)}.`);
  }

  insights.push(
    `Flexible money out over the last 30 days is ${formatCurrency(discretionaryCents)}.`
  );

  return insights.slice(0, 5);
}

function connectionSummaryLine(connections: FinancialSnapshot["connections"]): string {
  if (connections.total === 0) {
    return "No connected sources yet, so this read is based on manual and recurring setup data.";
  }
  if (connections.stale === 0) {
    if ((connections.demo ?? 0) > 0) {
      return "Manual demo data is current for this household.";
    }
    return `Connected data looks fresh across ${connections.total} source(s).`;
  }
  return `${connections.stale} of ${connections.total} connected source(s) may need a refresh (up to ${formatNumber(
    connections.maxAgeDays
  )} day(s)).`;
}

function pct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function formatCurrency(cents: number): string {
  return formatMoneyFromCents(cents, "AUD");
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "unknown";
  return n.toFixed(1);
}
