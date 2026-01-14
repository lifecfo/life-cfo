import { forecastCashflow30d } from "../domain/forecast";
import type { Bill } from "../domain/types";

describe("forecastCashflow30d", () => {
  it("subtracts upcoming bills and calculates safe-to-spend", () => {
    const bills: Bill[] = [
      { id: "b1", user_id: "u", merchant_key: "rent", due_day_or_date: "15", expected_amount: 500, status: "active" },
      { id: "b2", user_id: "u", merchant_key: "netflix", due_day_or_date: "2026-01-10", expected_amount: 15, status: "active" },
    ];

    const r = forecastCashflow30d({ startBalance: 1000, bills, startDateISO: "2026-01-08" });
    expect(r.upcomingBills.length).toBeGreaterThan(0);
    expect(r.endingBalance30d).toBeLessThanOrEqual(1000);
    expect(r.safeToSpendThisWeek).toBe(1000 - 15 - 500);
  });
});
