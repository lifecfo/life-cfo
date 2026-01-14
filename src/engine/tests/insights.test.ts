import { generateInsights } from "../domain/insights";
import type { Bill } from "../domain/types";

describe("generateInsights", () => {
  it("includes safe-to-spend and upcoming bills", () => {
    const bills: Bill[] = [
      { id: "b1", user_id: "u", merchant_key: "netflix", due_day_or_date: "2026-01-10", expected_amount: 15, status: "active" },
    ];

    const insights = generateInsights({
      forecast: {
        startBalance: 1000,
        endingBalance30d: 985,
        lowestBalance30d: 985,
        safeToSpendThisWeek: 985,
        upcomingBills: [{ date: "2026-01-10", merchant_key: "netflix", amount: 15 }],
      },
      bills,
      patterns: [],
    });

    expect(insights.some((i) => i.type === "safe_to_spend_week")).toBe(true);
    expect(insights.some((i) => i.type === "upcoming_bills")).toBe(true);
  });
});
