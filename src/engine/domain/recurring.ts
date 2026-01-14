// src/engine/domain/recurring.ts
import type { Transaction, RecurringPattern } from "./types";
import { normalizeMerchant } from "./merchant";

type Cadence = "weekly" | "fortnightly" | "monthly";

function daysBetween(a: Date, b: Date) {
  const ms = Math.abs(b.getTime() - a.getTime());
  return ms / (1000 * 60 * 60 * 24);
}

function detectCadence(dayDiffs: number[]): { cadence: Cadence; confidence: number } | null {
  // crude v1 buckets
  const avg = dayDiffs.reduce((s, x) => s + x, 0) / dayDiffs.length;

  const near = (target: number, tol: number) => Math.abs(avg - target) <= tol;

  if (near(7, 2)) return { cadence: "weekly", confidence: 0.75 };
  if (near(14, 3)) return { cadence: "fortnightly", confidence: 0.75 };
  if (near(30, 6)) return { cadence: "monthly", confidence: 0.7 };

  return null;
}

/**
 * Detect recurring patterns by merchant_key using very simple heuristics:
 * - require at least 3 occurrences
 * - only consider outflows (negative amounts)
 * - look at average spacing between occurrences
 */
export function detectRecurringPatterns(
  transactions: Transaction[],
  userId: string
): Omit<RecurringPattern, "id" | "created_at">[] {
  const txs = transactions
    .filter((t) => t.user_id === userId)
    .filter((t) => (t.pending ?? false) === false)
    .filter((t) => t.amount < 0)
    .map((t) => ({
      ...t,
      merchant_key: normalizeMerchant(t.merchant ?? t.description),
      dt: new Date(t.date + "T00:00:00"),
    }))
    .sort((a, b) => a.dt.getTime() - b.dt.getTime());

  const byMerchant = new Map<string, typeof txs>();
  for (const t of txs) {
    if (!byMerchant.has(t.merchant_key)) byMerchant.set(t.merchant_key, []);
    byMerchant.get(t.merchant_key)!.push(t);
  }

  const patterns: Omit<RecurringPattern, "id" | "created_at">[] = [];

  for (const [merchant_key, list] of byMerchant.entries()) {
    if (list.length < 3) continue;

    const diffs: number[] = [];
    for (let i = 1; i < list.length; i++) {
      diffs.push(daysBetween(list[i - 1].dt, list[i].dt));
    }

    const cadenceGuess = detectCadence(diffs);
    if (!cadenceGuess) continue;

    const avg_amount =
      Math.abs(list.reduce((s, t) => s + t.amount, 0) / list.length);

    const last = list[list.length - 1].dt;
    const next_due_date =
      cadenceGuess.cadence === "weekly"
        ? new Date(last.getTime() + 7 * 86400000)
        : cadenceGuess.cadence === "fortnightly"
        ? new Date(last.getTime() + 14 * 86400000)
        : new Date(last.getTime() + 30 * 86400000);

    patterns.push({
      user_id: userId,
      merchant_key,
      cadence: cadenceGuess.cadence,
      avg_amount,
      next_due_date: next_due_date.toISOString().slice(0, 10),
      confidence: cadenceGuess.confidence,
    });
  }

  return patterns;
}
