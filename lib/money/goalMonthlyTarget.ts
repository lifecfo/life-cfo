export type GoalMonthlyTarget =
  | { kind: "reached" }
  | { kind: "date_passed" }
  | { kind: "less_than_month" }
  | { kind: "per_month"; dollarsPerMonth: number; months: number };

/** Whole calendar months from `now` to `deadline` (can be negative if deadline is in the past). */
function wholeMonthsBetween(now: Date, deadline: Date): number {
  let months = (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
  if (deadline.getDate() < now.getDate()) months -= 1;
  return months;
}

/**
 * Plain arithmetic for the Goals "$X a month would reach this by [date]"
 * line. No judgment, no verdict -- just (target - current) / whole months
 * remaining, rounded up to the nearest dollar. Callers decide whether to
 * show this at all (build_toward/pay_by_date goals with a target and a
 * target date; not maintain goals).
 */
export function computeGoalMonthlyTarget(params: {
  targetCents: number;
  currentCents: number;
  deadlineIso: string;
  nowIso?: string;
}): GoalMonthlyTarget {
  const { targetCents, currentCents, deadlineIso } = params;

  if (currentCents >= targetCents) return { kind: "reached" };

  const nowMs = Date.parse(params.nowIso ?? new Date().toISOString());
  const deadlineMs = Date.parse(deadlineIso);
  if (!Number.isFinite(nowMs) || !Number.isFinite(deadlineMs)) return { kind: "date_passed" };

  if (deadlineMs < nowMs) return { kind: "date_passed" };

  const months = wholeMonthsBetween(new Date(nowMs), new Date(deadlineMs));
  if (months < 1) return { kind: "less_than_month" };

  const remainingCents = targetCents - currentCents;
  const dollarsPerMonth = Math.ceil(remainingCents / 100 / months);
  return { kind: "per_month", dollarsPerMonth, months };
}
