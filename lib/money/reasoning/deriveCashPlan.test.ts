import assert from "node:assert/strict";
import test from "node:test";
import { deriveCashPlan } from "./deriveCashPlan";
import type {
  AccountsTruthRow,
  MoneyBucketAllocationTruthRow,
  MoneyBucketTruthRow,
} from "./types";

const HOUSEHOLD_ID = "11111111-1111-4111-8111-111111111111";

function account(
  id: string,
  overrides: Partial<AccountsTruthRow> = {}
): AccountsTruthRow {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    connection_id: null,
    name: `Account ${id}`,
    provider: "manual",
    type: "cash",
    subtype: "savings",
    status: "active",
    archived: false,
    current_balance_cents: 100000,
    available_balance_cents: null,
    currency: "AUD",
    updated_at: null,
    created_at: null,
    ...overrides,
  };
}

function bucket(
  id: string,
  overrides: Partial<MoneyBucketTruthRow> = {}
): MoneyBucketTruthRow {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    name: `Bucket ${id}`,
    purpose_type: "safety",
    currency: "AUD",
    target_amount_cents: 200000,
    target_date: null,
    priority: 100,
    status: "active",
    ...overrides,
  };
}

function allocation(
  id: string,
  bucketId: string,
  accountId: string,
  overrides: Partial<MoneyBucketAllocationTruthRow> = {}
): MoneyBucketAllocationTruthRow {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    bucket_id: bucketId,
    account_id: accountId,
    allocation_type: "whole_account",
    amount_cents: null,
    ...overrides,
  };
}

function assertNoInternalIds(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      ["id", "user_id", "household_id", "account_id", "bucket_id", "allocation_id", "connection_id", "provider_id", "fixture_id"].includes(key),
      false,
      `Unexpected internal key: ${key}`
    );
    if (Array.isArray(child)) child.forEach(assertNoInternalIds);
    else assertNoInternalIds(child);
  }
}

test("derives whole, partial, tracked-only, and multi-currency rows", () => {
  const wholeAccount = account("whole", { available_balance_cents: 120000 });
  const partialAccount = account("partial", { current_balance_cents: 80000 });
  const usdAccount = account("usd", {
    currency: "USD",
    current_balance_cents: 50000,
  });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [wholeAccount, partialAccount, usdAccount],
    knownAccounts: [wholeAccount, partialAccount, usdAccount],
    buckets: [
      bucket("whole"),
      bucket("partial"),
      bucket("tracked", { currency: "USD" }),
    ],
    allocations: [
      allocation("a-whole", "whole", "whole"),
      allocation("a-partial", "partial", "partial", {
        allocation_type: "partial_account",
        amount_cents: 30000,
      }),
    ],
  });

  assert.equal(result.account_backed_buckets[0]?.backed_amount_cents, 120000);
  assert.equal(result.part_account_buckets[0]?.backed_amount_cents, 30000);
  assert.equal(result.tracked_only_buckets[0]?.backing_status, "tracked_only");
  assert.deepEqual(result.currencies, ["AUD", "USD"]);
  assert.equal(result.mixed_currencies, true);
  assert.equal(result.flexible_cash_calculated, false);
  assertNoInternalIds(result);
});

test("marks credit allocations for review", () => {
  const creditAccount = account("credit", {
    type: "credit",
    subtype: "credit_card",
    current_balance_cents: -50000,
  });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [creditAccount],
    knownAccounts: [creditAccount],
    buckets: [bucket("credit")],
    allocations: [allocation("a-credit", "credit", "credit")],
  });

  assert.equal(result.account_backed_buckets[0]?.backing_status, "needs_review");
  assert.equal(result.account_backed_buckets[0]?.backed_amount_cents, 0);
  assert.ok(result.review_items.some((item) => item.code === "non_cash_account"));
});

test("rejects a cash-like type with an investment-like subtype", () => {
  const investmentAccount = account("cash-investment", {
    type: "depository",
    subtype: "investment",
  });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [investmentAccount],
    knownAccounts: [investmentAccount],
    buckets: [bucket("investment")],
    allocations: [allocation("a-investment", "investment", "cash-investment")],
  });

  assert.equal(result.account_backed_buckets[0]?.backing_status, "needs_review");
  assert.equal(result.account_backed_buckets[0]?.backed_amount_cents, 0);
  assert.ok(result.review_items.some((item) => item.code === "non_cash_account"));
});

test("rejects an investment-like type with a cash-like subtype", () => {
  const investmentAccount = account("investment-cash", {
    type: "investment",
    subtype: "savings",
  });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [investmentAccount],
    knownAccounts: [investmentAccount],
    buckets: [bucket("investment")],
    allocations: [allocation("a-investment", "investment", "investment-cash")],
  });

  assert.equal(result.account_backed_buckets[0]?.backing_status, "needs_review");
  assert.equal(result.account_backed_buckets[0]?.backed_amount_cents, 0);
  assert.ok(result.review_items.some((item) => item.code === "non_cash_account"));
});

test("keeps unknown account types ineligible", () => {
  const unknownAccount = account("unknown", {
    type: "unknown",
    subtype: "unsupported",
  });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [unknownAccount],
    knownAccounts: [unknownAccount],
    buckets: [bucket("unknown")],
    allocations: [allocation("a-unknown", "unknown", "unknown")],
  });

  assert.equal(result.account_backed_buckets[0]?.backing_status, "needs_review");
  assert.equal(result.account_backed_buckets[0]?.backed_amount_cents, 0);
  assert.ok(result.review_items.some((item) => item.code === "non_cash_account"));
});

test("keeps negative cash-like accounts eligible but clamps backing to zero", () => {
  const cashAccount = account("negative-cash", {
    type: "depository",
    subtype: "checking",
    current_balance_cents: -2500,
  });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [cashAccount],
    knownAccounts: [cashAccount],
    buckets: [bucket("cash")],
    allocations: [allocation("a-cash", "cash", "negative-cash")],
  });

  assert.equal(result.account_backed_buckets[0]?.backing_status, "account_backed");
  assert.equal(result.account_backed_buckets[0]?.backed_amount_cents, 0);
  assert.equal(result.review_items.length, 0);
});

test("marks partial over-allocation for review", () => {
  const cashAccount = account("cash", { current_balance_cents: 50000 });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [cashAccount],
    knownAccounts: [cashAccount],
    buckets: [bucket("one"), bucket("two")],
    allocations: [
      allocation("one", "one", "cash", {
        allocation_type: "partial_account",
        amount_cents: 30000,
      }),
      allocation("two", "two", "cash", {
        allocation_type: "partial_account",
        amount_cents: 30000,
      }),
    ],
  });

  assert.ok(result.part_account_buckets.every((item) => item.backing_status === "needs_review"));
  assert.ok(result.part_account_buckets.every((item) => item.backed_amount_cents === 0));
  assert.ok(result.review_items.some((item) => item.code === "partial_over_allocation"));
});

test("marks whole and partial conflicts for review", () => {
  const cashAccount = account("cash");
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [cashAccount],
    knownAccounts: [cashAccount],
    buckets: [bucket("whole"), bucket("partial")],
    allocations: [
      allocation("whole", "whole", "cash"),
      allocation("partial", "partial", "cash", {
        allocation_type: "partial_account",
        amount_cents: 10000,
      }),
    ],
  });

  assert.equal(result.account_backed_buckets[0]?.backing_status, "needs_review");
  assert.equal(result.part_account_buckets[0]?.backing_status, "needs_review");
  assert.ok(result.review_items.some((item) => item.code === "whole_partial_conflict"));
});

test("detects archived account, archived bucket, and currency mismatch", () => {
  const archivedAccount = account("archived", { archived: true });
  const usdAccount = account("usd", { currency: "USD" });
  const result = deriveCashPlan({
    householdId: HOUSEHOLD_ID,
    effectiveAccounts: [usdAccount],
    knownAccounts: [archivedAccount, usdAccount],
    buckets: [
      bucket("archived-bucket", { status: "archived" }),
      bucket("aud-bucket"),
    ],
    allocations: [
      allocation("archived", "archived-bucket", "archived"),
      allocation("currency", "aud-bucket", "usd"),
    ],
  });

  assert.ok(result.review_items.some((item) => item.code === "archived_account"));
  assert.ok(result.review_items.some((item) => item.code === "archived_bucket"));
  assert.ok(result.review_items.some((item) => item.code === "currency_mismatch"));
});
