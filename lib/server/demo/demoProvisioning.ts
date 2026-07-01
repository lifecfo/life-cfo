import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildFamilyOneIncomeFixture } from "../../../scripts/demo/fixtures/family-one-income.mjs";
import { buildSingleParentTightFixture } from "../../../scripts/demo/fixtures/single-parent-tight.mjs";

type DemoRow = { id: string; household_id?: string; [key: string]: unknown };
type DemoFixture = {
  scenario: string;
  version: string;
  household: { id: string; name: string };
  membership: DemoRow & { user_id: string; role: string };
  connection: DemoRow & {
    user_id: string;
    provider: string;
    status: string;
    metadata: Record<string, unknown>;
  };
  accounts: DemoRow[];
  externalAccounts: DemoRow[];
  transactions: DemoRow[];
  confirmations: DemoRow[];
  familyMembers: DemoRow[];
  pets: DemoRow[];
  recurringIncome: DemoRow[];
  recurringBills: DemoRow[];
  decisions: DemoRow[];
  goals: DemoRow[];
};

type FixtureState = "missing" | "partial" | "ready" | "conflict";
type AdminClient = ReturnType<typeof supabaseAdmin>;

const BUILDERS = [buildFamilyOneIncomeFixture, buildSingleParentTightFixture];

function buildFixtures(ownerUserId: string): DemoFixture[] {
  return BUILDERS.map((build) => build({ ownerUserId }) as DemoFixture);
}

function fixtureCollections(fixture: DemoFixture) {
  return [
    ["accounts", fixture.accounts],
    ["external_accounts", fixture.externalAccounts],
    ["transactions", fixture.transactions],
    ["transaction_pattern_confirmations", fixture.confirmations],
    ["family_members", fixture.familyMembers],
    ["pets", fixture.pets],
    ["recurring_income", fixture.recurringIncome],
    ["recurring_bills", fixture.recurringBills],
    ["decisions", fixture.decisions],
    ["money_goals", fixture.goals],
  ] as const;
}

async function existingIds(admin: AdminClient, table: string, householdId: string) {
  const { data, error } = await admin.from(table).select("id").eq("household_id", householdId);
  if (error) throw new Error(`${table}_status_failed`);
  return new Set((data ?? []).map((row) => String(row.id)));
}

async function inspectFixture(admin: AdminClient, fixture: DemoFixture): Promise<FixtureState> {
  const { data: household, error: householdError } = await admin
    .from("households")
    .select("id,name")
    .eq("id", fixture.household.id)
    .maybeSingle();
  if (householdError) throw new Error("demo_household_status_failed");
  if (!household) return "missing";
  if (household.name !== fixture.household.name) return "conflict";

  const [{ data: membership, error: membershipError }, { data: connection, error: connectionError }] =
    await Promise.all([
      admin
        .from("household_members")
        .select("id,user_id,role")
        .eq("id", fixture.membership.id)
        .eq("household_id", fixture.household.id)
        .maybeSingle(),
      admin
        .from("external_connections")
        .select("id,user_id,provider,status,metadata")
        .eq("id", fixture.connection.id)
        .eq("household_id", fixture.household.id)
        .maybeSingle(),
    ]);
  if (membershipError || connectionError) throw new Error("demo_identity_status_failed");

  if (membership && (
    membership.user_id !== fixture.membership.user_id ||
    membership.role !== "owner"
  )) return "conflict";

  if (connection) {
    const metadata = connection.metadata && typeof connection.metadata === "object"
      ? (connection.metadata as Record<string, unknown>)
      : {};
    if (
      connection.user_id !== fixture.connection.user_id ||
      connection.provider !== "manual" ||
      connection.status !== "demo" ||
      metadata.demo !== true ||
      metadata.scenario !== fixture.scenario ||
      metadata.version !== fixture.version
    ) return "conflict";
  }

  if (!membership || !connection) return "partial";

  for (const [table, rows] of fixtureCollections(fixture)) {
    const ids = await existingIds(admin, table, fixture.household.id);
    if (!rows.every((row) => ids.has(row.id))) return "partial";
  }
  return "ready";
}

async function insertRows(admin: AdminClient, table: string, rows: DemoRow[], batchSize = 100) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const { error } = await admin.from(table).insert(rows.slice(index, index + batchSize));
    if (error) throw new Error(`${table}_insert_failed`);
  }
}

async function insertMissingRows(
  admin: AdminClient,
  table: string,
  householdId: string,
  rows: DemoRow[]
) {
  const ids = await existingIds(admin, table, householdId);
  const missing = rows.filter((row) => !ids.has(row.id));
  if (missing.length) await insertRows(admin, table, missing);
  return missing.length;
}

async function provisionFixture(admin: AdminClient, fixture: DemoFixture) {
  const initialState = await inspectFixture(admin, fixture);
  if (initialState === "ready") return false;
  if (initialState === "conflict") throw new Error("demo_fixture_identity_conflict");

  if (initialState === "missing") {
    const { error } = await admin.from("households").insert(fixture.household);
    if (error) throw new Error("demo_household_insert_failed");
  }

  await insertMissingRows(admin, "household_members", fixture.household.id, [fixture.membership]);
  await insertMissingRows(admin, "external_connections", fixture.household.id, [fixture.connection]);
  for (const [table, rows] of fixtureCollections(fixture)) {
    await insertMissingRows(admin, table, fixture.household.id, rows);
  }

  if (await inspectFixture(admin, fixture) !== "ready") {
    throw new Error("demo_fixture_incomplete");
  }
  return true;
}

export async function getDemoSetupStatus(ownerUserId: string) {
  const admin = supabaseAdmin();
  const fixtures = buildFixtures(ownerUserId);
  const states = await Promise.all(fixtures.map((fixture) => inspectFixture(admin, fixture)));
  const readyFixtures = fixtures.filter((_, index) => states[index] === "ready");

  return {
    demo_ready: readyFixtures.length === fixtures.length,
    household_count: readyFixtures.length,
    missing_scenarios: fixtures
      .filter((_, index) => states[index] !== "ready")
      .map((fixture) => fixture.scenario),
    conflict: states.includes("conflict"),
    first_household_id: readyFixtures[0]?.household.id ?? null,
  };
}

export async function provisionDemoHouseholds(ownerUserId: string) {
  const admin = supabaseAdmin();
  const fixtures = buildFixtures(ownerUserId);
  let createdAny = false;
  let failed = false;

  for (const fixture of fixtures) {
    try {
      createdAny = (await provisionFixture(admin, fixture)) || createdAny;
    } catch (error: unknown) {
      failed = true;
      console.error("demo_setup_scenario_failed", {
        scenario: fixture.scenario,
        code: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  const status = await getDemoSetupStatus(ownerUserId);
  return {
    ...status,
    status: status.demo_ready ? (createdAny ? "created" : "ready") : "partial",
    failed,
  } as const;
}
