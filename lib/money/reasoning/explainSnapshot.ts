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
  void params.structuralLevel;
  void params.incomeCents;
  void params.commitmentsCents;
  void params.discretionaryCents;
  if ((params.connections.demo ?? 0) > 0) {
    return "Sample data. These figures are from a demo household, not money you typed.";
  }
  return "Figures from what has been entered.";
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
  void connections;
  return [
    `Recurring income entered: ${formatCurrency(incomeCents)}.`,
    `Recurring bills entered: ${formatCurrency(commitmentsCents)}.`,
    `Cash figure entered: ${formatCurrency(cashCents)}.`,
    `Money out in the last 30 days: ${formatCurrency(discretionaryCents)}.`,
  ].join(" ");
}

function buildInsights(params: {
  incomeCents: number;
  commitmentsCents: number;
  cashCents: number;
  discretionaryCents: number;
  connections: FinancialSnapshot["connections"];
}): string[] {
  void params.connections;
  return [
    `Recurring income entered: ${formatCurrency(params.incomeCents)}.`,
    `Recurring bills entered: ${formatCurrency(params.commitmentsCents)}.`,
    `Cash figure entered: ${formatCurrency(params.cashCents)}.`,
    `Money out in the last 30 days: ${formatCurrency(params.discretionaryCents)}.`,
  ];
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
