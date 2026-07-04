import assert from "node:assert/strict";
import test from "node:test";
import { deriveCashPlan } from "../../lib/money/reasoning/deriveCashPlan.ts";
import { buildFamilyOneIncomeFixture } from "./fixtures/family-one-income.mjs";
import { buildSingleParentTightFixture } from "./fixtures/single-parent-tight.mjs";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const ANCHOR = new Date("2026-07-01T00:00:00.000Z");

function assertNoInternalIds(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(
      [
        "id",
        "user_id",
        "household_id",
        "account_id",
        "bucket_id",
        "allocation_id",
        "provider_id",
        "connection_id",
        "fixture_id",
      ].includes(key),
      false,
      `Unexpected internal key: ${key}`
    );
    if (Array.isArray(child)) child.forEach(assertNoInternalIds);
    else assertNoInternalIds(child);
  }
}

function deriveFixtureCashPlan(fixture) {
  return deriveCashPlan({
    householdId: fixture.household.id,
    effectiveAccounts: fixture.accounts,
    knownAccounts: fixture.accounts,
    buckets: fixture.moneyBuckets,
    allocations: fixture.bucketAllocations,
  });
}

const scenarios = [
  {
    name: "family-one-income",
    build: buildFamilyOneIncomeFixture,
    wholeAmount: 485000,
    partialAmount: 1200000,
    partialName: "Family buffer",
    trackedName: "School costs to plan",
  },
  {
    name: "single-parent-tight",
    build: buildSingleParentTightFixture,
    wholeAmount: 94000,
    partialAmount: 150000,
    partialName: "Emergency reserve",
    trackedName: "Car costs to plan",
  },
];

for (const scenario of scenarios) {
  test(`${scenario.name} produces a useful read-only Cash Plan`, () => {
    const fixture = scenario.build({ ownerUserId: OWNER_A, anchorDate: ANCHOR });
    const result = deriveFixtureCashPlan(fixture);

    assert.equal(result.review_message, "For review only. Nothing has moved.");
    assert.equal(result.flexible_cash_calculated, false);
    assert.deepEqual(result.currencies, ["AUD"]);
    assert.equal(result.mixed_currencies, false);
    assert.equal(result.review_items.length, 0);
    assert.equal(result.account_backed_buckets.length, 1);
    assert.equal(result.account_backed_buckets[0].name, "Monthly bills");
    assert.equal(result.account_backed_buckets[0].backed_amount_cents, scenario.wholeAmount);
    assert.equal(result.part_account_buckets.length, 1);
    assert.equal(result.part_account_buckets[0].name, scenario.partialName);
    assert.equal(result.part_account_buckets[0].backed_amount_cents, scenario.partialAmount);
    assert.equal(result.tracked_only_buckets.length, 1);
    assert.equal(result.tracked_only_buckets[0].name, scenario.trackedName);
    assert.ok(result.accounts_without_allocations.some((account) => account.name === "Everyday account"));
    assertNoInternalIds(result);
  });

  test(`${scenario.name} Cash Plan IDs are stable, isolated, and do not reuse goal IDs`, () => {
    const first = scenario.build({ ownerUserId: OWNER_A, anchorDate: ANCHOR });
    const repeated = scenario.build({ ownerUserId: OWNER_A, anchorDate: ANCHOR });
    const otherTester = scenario.build({ ownerUserId: OWNER_B, anchorDate: ANCHOR });

    assert.deepEqual(
      first.moneyBuckets.map((row) => row.id),
      repeated.moneyBuckets.map((row) => row.id)
    );
    assert.deepEqual(
      first.bucketAllocations.map((row) => row.id),
      repeated.bucketAllocations.map((row) => row.id)
    );
    assert.equal(new Set(first.moneyBuckets.map((row) => row.id)).size, first.moneyBuckets.length);
    assert.equal(
      new Set(first.bucketAllocations.map((row) => row.id)).size,
      first.bucketAllocations.length
    );
    assert.ok(
      first.moneyBuckets.every(
        (bucket) => otherTester.moneyBuckets.every((otherBucket) => otherBucket.id !== bucket.id)
      )
    );
    assert.ok(
      first.bucketAllocations.every((allocation) =>
        otherTester.bucketAllocations.every(
          (otherAllocation) => otherAllocation.id !== allocation.id
        )
      )
    );
    const goalIds = new Set(first.goals.map((goal) => goal.id));
    assert.ok(first.moneyBuckets.every((bucket) => !goalIds.has(bucket.id)));
  });
}
