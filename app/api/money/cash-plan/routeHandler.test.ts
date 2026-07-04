import assert from "node:assert/strict";
import test from "node:test";
import { deriveCashPlan } from "../../../../lib/money/reasoning/deriveCashPlan";
import type {
  AccountsTruthRow,
  HouseholdMoneyTruth,
  MoneyBucketAllocationTruthRow,
  MoneyBucketTruthRow,
  MoneyDataCoverage,
} from "../../../../lib/money/reasoning/types";
import {
  createCashPlanGetHandler,
  type CashPlanRouteDependencies,
} from "./routeHandler";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_HOUSEHOLD_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_HOUSEHOLD_ID = "33333333-3333-4333-8333-333333333333";

type QueryLog = {
  table: string;
  operation: "select";
  filters: Array<{ column: string; value: unknown }>;
};

type FakeDatabase = {
  money_buckets: MoneyBucketTruthRow[];
  money_bucket_allocations: MoneyBucketAllocationTruthRow[];
  accounts: AccountsTruthRow[];
};

function account(
  id: string,
  householdId = ACTIVE_HOUSEHOLD_ID,
  archived = false
): AccountsTruthRow {
  return {
    id,
    household_id: householdId,
    connection_id: "internal-connection-id",
    name: householdId === ACTIVE_HOUSEHOLD_ID ? "Everyday" : "Other household account",
    provider: "manual",
    type: "depository",
    subtype: "checking",
    status: "active",
    archived,
    current_balance_cents: 100000,
    available_balance_cents: 90000,
    currency: "AUD",
    updated_at: null,
    created_at: null,
  };
}

function truth(accounts: AccountsTruthRow[]): HouseholdMoneyTruth {
  return {
    household_id: ACTIVE_HOUSEHOLD_ID,
    as_of_iso: "2026-07-04T00:00:00.000Z",
    windows: {
      now_iso: "2026-07-04T00:00:00.000Z",
      next30_iso: "2026-08-03T00:00:00.000Z",
      month_start_iso: "2026-07-01",
      month_end_iso: "2026-07-31",
    },
    accounts,
    recent_transactions: [],
    month_transactions: [],
    rolling_transactions: [],
    recurring_bills: [],
    recurring_income: [],
    goals: [],
    liabilities: [],
    external_connections: [],
    transaction_pattern_confirmations: [],
    counts: { budget_items: 0, investment_accounts: 0 },
  };
}

function dataCoverage(): MoneyDataCoverage {
  return {
    included_sources: [],
    reference_only_sources: [],
    account_count: 1,
    transaction_count: 0,
    transaction_window: null,
    latest_transaction_date: null,
    current_month_money_in: [],
    current_month_money_out: [],
    confirmed_regular_payment_count: 0,
    confirmed_income_pattern_count: 0,
    unclear_label_count: 0,
    label_quality_note: "",
    has_reference_only_sources: false,
    has_demo_sources: false,
  };
}

function createQuery(
  table: keyof FakeDatabase,
  rows: FakeDatabase[keyof FakeDatabase],
  queryLog: QueryLog[]
) {
  const filters: Array<{ column: string; value: unknown }> = [];
  const query = {
    select() {
      queryLog.push({ table, operation: "select", filters });
      return query;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return query;
    },
    order() {
      return query;
    },
    then(resolve: (result: { data: typeof rows; error: null }) => void) {
      const data = rows.filter((row) =>
        filters.every(({ column, value }) =>
          (row as unknown as Record<string, unknown>)[column] === value
        )
      ) as typeof rows;
      resolve({ data, error: null });
    },
  };
  return query;
}

function assertNoInternalIds(value: unknown) {
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

function routeHarness(options: { authenticated: boolean; role?: "owner" | "editor" | "viewer" }) {
  const queryLog: QueryLog[] = [];
  const calls = {
    resolveHousehold: 0,
    getMoneyTruth: 0,
    derivePlan: 0,
    writes: 0,
    providerCalls: 0,
  };
  const activeAccount = account("active-account");
  const otherAccount = account("other-account", OTHER_HOUSEHOLD_ID);
  const database: FakeDatabase = {
    money_buckets: [
      {
        id: "active-bucket",
        household_id: ACTIVE_HOUSEHOLD_ID,
        name: "Bills",
        purpose_type: "bills",
        currency: "AUD",
        target_amount_cents: null,
        target_date: null,
        priority: 1,
        status: "active",
      },
      {
        id: "other-bucket",
        household_id: OTHER_HOUSEHOLD_ID,
        name: "Other household bucket",
        purpose_type: "bills",
        currency: "AUD",
        target_amount_cents: null,
        target_date: null,
        priority: 1,
        status: "active",
      },
    ],
    money_bucket_allocations: [
      {
        id: "active-allocation",
        household_id: ACTIVE_HOUSEHOLD_ID,
        bucket_id: "active-bucket",
        account_id: activeAccount.id,
        allocation_type: "whole_account",
        amount_cents: null,
      },
      {
        id: "other-allocation",
        household_id: OTHER_HOUSEHOLD_ID,
        bucket_id: "other-bucket",
        account_id: otherAccount.id,
        allocation_type: "whole_account",
        amount_cents: null,
      },
    ],
    accounts: [account("archived-account", ACTIVE_HOUSEHOLD_ID, true), otherAccount],
  };

  const fakeSupabase = {
    auth: {
      async getUser() {
        return options.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: null };
      },
    },
    from(table: keyof FakeDatabase) {
      return createQuery(table, database[table], queryLog);
    },
  };

  const rawTruth = truth([activeAccount]);
  const dependencies = {
    async createSupabase() {
      return fakeSupabase;
    },
    async resolveHouseholdId(_supabase: unknown, userId: string) {
      calls.resolveHousehold += 1;
      assert.equal(userId, USER_ID);
      assert.ok(options.role);
      return ACTIVE_HOUSEHOLD_ID;
    },
    async getMoneyTruth(_supabase: unknown, params: { householdId: string }) {
      calls.getMoneyTruth += 1;
      assert.equal(params.householdId, ACTIVE_HOUSEHOLD_ID);
      return rawTruth;
    },
    deriveEffectiveTruth(receivedTruth: HouseholdMoneyTruth) {
      assert.equal(receivedTruth, rawTruth);
      return { truth: rawTruth, dataCoverage: dataCoverage() };
    },
    derivePlan(params: Parameters<typeof deriveCashPlan>[0]) {
      calls.derivePlan += 1;
      assert.equal(params.householdId, ACTIVE_HOUSEHOLD_ID);
      assert.deepEqual(params.buckets.map((row) => row.name), ["Bills"]);
      assert.deepEqual(params.allocations.map((row) => row.id), ["active-allocation"]);
      assert.ok(params.knownAccounts.every((row) => row.household_id === ACTIVE_HOUSEHOLD_ID));
      return deriveCashPlan(params);
    },
  } as unknown as CashPlanRouteDependencies;

  return {
    handler: createCashPlanGetHandler(dependencies),
    calls,
    queryLog,
  };
}

test("rejects anonymous requests before household or money reads", async () => {
  const harness = routeHarness({ authenticated: false });
  const response = await harness.handler();

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "Please sign in again.",
  });
  assert.equal(harness.calls.resolveHousehold, 0);
  assert.equal(harness.calls.getMoneyTruth, 0);
  assert.equal(harness.queryLog.length, 0);
  assert.equal(harness.calls.writes, 0);
  assert.equal(harness.calls.providerCalls, 0);
});

for (const role of ["owner", "editor", "viewer"] as const) {
  test(`allows an authenticated ${role} to read the active household Cash Plan`, async () => {
    const harness = routeHarness({ authenticated: true, role });
    const response = await harness.handler();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.cash_plan.account_backed_buckets[0]?.name, "Bills");
    assert.equal(JSON.stringify(body).includes("Other household"), false);
    assertNoInternalIds(body);
    assert.equal(harness.calls.resolveHousehold, 1);
    assert.equal(harness.calls.getMoneyTruth, 1);
    assert.equal(harness.calls.derivePlan, 1);
    assert.equal(harness.calls.writes, 0);
    assert.equal(harness.calls.providerCalls, 0);

    for (const table of ["money_buckets", "money_bucket_allocations", "accounts"]) {
      const query = harness.queryLog.find((item) => item.table === table);
      assert.ok(query);
      assert.ok(
        query.filters.some(
          (filter) =>
            filter.column === "household_id" && filter.value === ACTIVE_HOUSEHOLD_ID
        )
      );
    }
  });
}
