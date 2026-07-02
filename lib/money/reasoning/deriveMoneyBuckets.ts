import type { MoneyBucketsSummary, MoneyGoalsTruthRow } from "./types";

function normalizeCurrency(value: string | null | undefined): string {
  return String(value || "AUD").trim().toUpperCase() || "AUD";
}

function targetMonth(goal: MoneyGoalsTruthRow): string | null {
  const targetMs = Date.parse(goal.deadline_at || goal.target_date || "");
  if (!Number.isFinite(targetMs)) return null;
  const target = new Date(targetMs);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function deriveMoneyBuckets(goals: MoneyGoalsTruthRow[]): MoneyBucketsSummary {
  const buckets = goals
    .filter((goal) => String(goal.status || "active").trim().toLowerCase() === "active")
    .filter((goal) => typeof goal.target_cents === "number" && goal.target_cents > 0)
    .sort((left, right) => {
      const primaryDifference = Number(right.is_primary === true) - Number(left.is_primary === true);
      if (primaryDifference !== 0) return primaryDifference;
      return (right.updated_at || "").localeCompare(left.updated_at || "");
    })
    .map((goal) => {
      const targetCents = goal.target_cents as number;
      const currentCents = Math.max(0, goal.current_cents ?? 0);
      return {
        title: String(goal.title || "Goal").trim() || "Goal",
        currency: normalizeCurrency(goal.currency),
        current_cents: currentCents,
        target_cents: targetCents,
        still_needed_cents: Math.max(0, targetCents - currentCents),
        progress_percent: Math.max(0, Math.min(100, Math.round((currentCents / targetCents) * 100))),
        target_month: targetMonth(goal),
        is_primary: goal.is_primary === true,
        notes: goal.notes?.trim() || null,
      };
    });

  return { version: 1, buckets };
}
