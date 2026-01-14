// src/engine/domain/insights.ts
import type { Bill, EngineInsight, RecurringPattern } from "./types";
import type { ForecastResult } from "./forecast";

export function generateInsights(params: {
  forecast: ForecastResult;
  bills: Bill[];
  patterns: Omit<RecurringPattern, "id" | "created_at">[];
}): EngineInsight[] {
  const { forecast, patterns } = params;

  const insights: EngineInsight[] = [];

  // 1) Upcoming bills (info)
  insights.push({
    type: "upcoming_bills",
    severity: 1,
    payload: {
      count: forecast.upcomingBills.length,
      items: forecast.upcomingBills.slice(0, 10),
    },
  });

  // 2) Safe to spend this week (info)
  insights.push({
    type: "safe_to_spend_week",
    severity: 1,
    payload: {
      amount: Math.round(forecast.safeToSpendThisWeek * 100) / 100,
    },
  });

  // 3) Warning if lowest balance goes negative
  if (forecast.lowestBalance30d < 0) {
    insights.push({
      type: "warning_lowest_balance_negative",
      severity: 5,
      payload: {
        lowestBalance30d: Math.round(forecast.lowestBalance30d * 100) / 100,
      },
    });
  }

  // 4) Next actions (v1)
  if (forecast.safeToSpendThisWeek < 50) {
    insights.push({
      type: "next_action",
      severity: 4,
      payload: {
        action: "review_spending",
        message:
          "Safe-to-spend this week is low. Consider pausing discretionary spending until bills clear.",
      },
    });
  } else {
    insights.push({
      type: "next_action",
      severity: 2,
      payload: {
        action: "check_bills",
        message: "Review upcoming bills and confirm amounts/due dates are correct.",
      },
    });
  }

  // 5) Recurring confirmation recommendation (ONLY for pending patterns)
  const pendingPatterns = patterns.filter(
    (p) => (p.status ?? "pending") === "pending"
  );

  if (pendingPatterns.length > 0) {
    const top = pendingPatterns
      .slice()
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

    insights.push({
      type: "recommendation",
      severity: 2,
      payload: {
        action: "confirm_recurring",
        merchant_key: top.merchant_key,
        cadence: top.cadence,
        avg_amount: top.avg_amount ?? null,
        message:
          "We detected a recurring payment. Confirm it to track as a bill/subscription.",
      },
    });
  }

  return insights;
}
