import { detectRecurringPatterns } from "../domain/recurring";
import type { Transaction } from "../domain/types";

describe("detectRecurringPatterns", () => {
  it("detects a monthly pattern", () => {
    const txs: Transaction[] = [
      { id: "1", user_id: "u", account_id: "a", date: "2025-10-01", amount: -15, description: "NETFLIX", pending: false },
      { id: "2", user_id: "u", account_id: "a", date: "2025-10-31", amount: -15, description: "NETFLIX", pending: false },
      { id: "3", user_id: "u", account_id: "a", date: "2025-11-30", amount: -15, description: "NETFLIX", pending: false },
    ];

    const patterns = detectRecurringPatterns(txs, "u");
    expect(patterns.length).toBe(1);
    expect(patterns[0].merchant_key).toBe("netflix");
    expect(patterns[0].cadence).toBe("monthly");
  });
});
