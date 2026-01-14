import { categorizeTransaction } from "../domain/categorize";
import type { Transaction } from "../domain/types";

describe("categorizeTransaction", () => {
  const baseTx: Transaction = {
    id: "t1",
    user_id: "u1",
    account_id: "a1",
    date: "2026-01-08",
    amount: -12.5,
    description: "WOOLWORTHS 3345 BRISBANE",
    pending: false,
  };

  it("matches on merchant includes", () => {
    const category = categorizeTransaction(baseTx, [
      { category: "Groceries", merchantIncludes: ["woolworths"] },
    ]);
    expect(category).toBe("Groceries");
  });

  it("returns null when nothing matches", () => {
    const category = categorizeTransaction(baseTx, [
      { category: "Transport", merchantIncludes: ["uber"] },
    ]);
    expect(category).toBeNull();
  });
});
