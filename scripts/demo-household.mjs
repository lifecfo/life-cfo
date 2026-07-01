import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  assertFamilyOneIncomeFixtureIsolation,
  buildFamilyOneIncomeFixture,
  FIXTURE_VERSION,
  HOUSEHOLD_NAME,
  SCENARIO,
} from "./demo/fixtures/family-one-income.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_COLUMNS = new Set([
  "id",
  "user_id",
  "household_id",
  "connection_id",
  "provider",
  "external_id",
  "provider_account_id",
  "name",
  "official_name",
  "type",
  "subtype",
  "status",
  "currency",
  "current_balance_cents",
  "available_balance_cents",
  "mask",
  "archived",
  "updated_at",
]);

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;
  for (const rawLine of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().replace(/^export\s+/, "");
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = true;
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function requireBaseSafety() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo fixtures are disabled when NODE_ENV=production.");
  }
  if (process.env.DEMO_DATA_ENABLED !== "true") {
    throw new Error("Set DEMO_DATA_ENABLED=true before using demo fixtures.");
  }
  const supabaseUrl = normalizedUrl(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");

  const allowedUrls = splitList(process.env.DEMO_ALLOWED_SUPABASE_URLS).map(normalizedUrl);
  const allowedRefs = splitList(process.env.DEMO_ALLOWED_SUPABASE_PROJECT_REFS);
  const projectRef = projectRefFromUrl(supabaseUrl);
  if (!allowedUrls.length && !allowedRefs.length) {
    throw new Error(
      "Set DEMO_ALLOWED_SUPABASE_URLS or DEMO_ALLOWED_SUPABASE_PROJECT_REFS explicitly."
    );
  }
  if (!allowedUrls.includes(supabaseUrl) && !allowedRefs.includes(projectRef)) {
    throw new Error("The configured Supabase project is not allowlisted for demo fixtures.");
  }
  return { supabaseUrl, projectRef };
}

function allowedOwnerIds() {
  const values = splitList(process.env.DEMO_ALLOWED_OWNER_USER_IDS);
  if (!values.length) {
    throw new Error("Set DEMO_ALLOWED_OWNER_USER_IDS to one or more dedicated test user UUIDs.");
  }
  return values;
}

function requireOwner(ownerUserId) {
  if (!UUID_PATTERN.test(String(ownerUserId || ""))) {
    throw new Error("--owner-user-id must be a valid UUID.");
  }
  if (!allowedOwnerIds().includes(ownerUserId)) {
    throw new Error("The supplied owner user ID is not in DEMO_ALLOWED_OWNER_USER_IDS.");
  }
}

function requireScenario(value) {
  if (value !== SCENARIO) {
    throw new Error(`Only --scenario ${SCENARIO} is supported in this fixture slice.`);
  }
}

function serviceClient(supabaseUrl) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function fixtureSummary(fixture, mode, projectRef) {
  const monthStart = startOfCurrentMonth();
  const currentMonth = fixture.transactions.filter((transaction) => transaction.date >= monthStart);
  const moneyIn = currentMonth.reduce(
    (sum, transaction) => sum + Math.max(0, transaction.amount_cents),
    0
  );
  const moneyOut = currentMonth.reduce(
    (sum, transaction) => sum + Math.max(0, -transaction.amount_cents),
    0
  );
  const dates = fixture.transactions.map((transaction) => transaction.date).sort();
  return {
    mode,
    writes_enabled: mode === "apply",
    project_ref: projectRef,
    scenario: fixture.scenario,
    version: fixture.version,
    household: fixture.household,
    owner_user_id: fixture.membership.user_id,
    source: {
      provider: fixture.connection.provider,
      status: fixture.connection.status,
      metadata: fixture.connection.metadata,
    },
    counts: {
      household_members: 1,
      external_connections: 1,
      accounts: fixture.accounts.length,
      external_accounts: fixture.externalAccounts.length,
      transactions: fixture.transactions.length,
      confirmations: fixture.confirmations.length,
      decisions: 1,
      money_goals: 1,
      recurring_bills: 0,
      recurring_income: 0,
    },
    transaction_window: { start: dates[0], end: dates[dates.length - 1] },
    current_month: { money_in_cents: moneyIn, money_out_cents: moneyOut },
    payload_validation: "passed",
  };
}

function validateFixturePayload(fixture) {
  for (const account of fixture.accounts) {
    const unsupported = Object.keys(account).filter((column) => !ACCOUNT_COLUMNS.has(column));
    if (unsupported.length) {
      throw new Error(`accounts payload contains unsupported columns: ${unsupported.join(", ")}`);
    }
    if ("metadata" in account) {
      throw new Error("accounts payload must not contain metadata.");
    }
  }
  for (const externalAccount of fixture.externalAccounts) {
    if (externalAccount.metadata?.demo !== true) {
      throw new Error("external_accounts demo metadata is missing.");
    }
  }
  if (fixture.connection.metadata?.demo !== true) {
    throw new Error("external_connections demo metadata is missing.");
  }
}

async function requireAuthUser(client, ownerUserId) {
  const { data, error } = await client.auth.admin.getUserById(ownerUserId);
  if (error) throw error;
  if (!data?.user?.id) throw new Error("The allowlisted owner user does not exist in Supabase Auth.");
}

async function insertRows(client, table, rows, batchSize = 100) {
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await client.from(table).insert(batch);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

async function countRows(client, table, householdId) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function readFixtureIdentity(client, householdId) {
  const [{ data: household, error: householdError }, { data: members, error: memberError }, { data: connections, error: connectionError }] = await Promise.all([
    client.from("households").select("id,name").eq("id", householdId).maybeSingle(),
    client.from("household_members").select("id,household_id,user_id,role").eq("household_id", householdId),
    client.from("external_connections").select("id,household_id,user_id,provider,status,metadata").eq("household_id", householdId),
  ]);
  if (householdError) throw householdError;
  if (memberError) throw memberError;
  if (connectionError) throw connectionError;
  return { household, members: members ?? [], connections: connections ?? [] };
}

function assertFixtureIdentity(identity, fixture) {
  if (!identity.household) throw new Error("The deterministic demo household does not exist.");
  if (identity.household.id !== fixture.household.id || identity.household.name !== HOUSEHOLD_NAME) {
    throw new Error("Household ID/name verification failed. Reset refused.");
  }
  if (identity.members.length !== 1) {
    throw new Error("Demo household must have exactly one member. Reset refused.");
  }
  const member = identity.members[0];
  if (
    member.id !== fixture.membership.id ||
    member.user_id !== fixture.membership.user_id ||
    member.role !== "owner" ||
    !allowedOwnerIds().includes(member.user_id)
  ) {
    throw new Error("Demo household owner does not match this tester fixture. Reset refused.");
  }
  if (identity.connections.length !== 1) {
    throw new Error("Demo household must have exactly one source. Reset refused.");
  }
  const connection = identity.connections[0];
  const metadata = connection.metadata && typeof connection.metadata === "object"
    ? connection.metadata
    : {};
  if (
    connection.id !== fixture.connection.id ||
    connection.user_id !== fixture.membership.user_id ||
    connection.provider !== "manual" ||
    connection.status !== "demo" ||
    metadata.demo !== true ||
    metadata.scenario !== SCENARIO ||
    metadata.version !== FIXTURE_VERSION
  ) {
    throw new Error("Demo source metadata verification failed. Reset refused.");
  }
  return member.user_id;
}

async function assertSeeded(client, fixture) {
  const identity = await readFixtureIdentity(client, fixture.household.id);
  const ownerUserId = assertFixtureIdentity(identity, fixture);
  if (ownerUserId !== fixture.membership.user_id) throw new Error("Seed owner assertion failed.");

  const [accountCount, transactionCount, confirmationCount] = await Promise.all([
    countRows(client, "accounts", fixture.household.id),
    countRows(client, "transactions", fixture.household.id),
    countRows(client, "transaction_pattern_confirmations", fixture.household.id),
  ]);
  if (accountCount !== fixture.accounts.length) throw new Error("Seed account count assertion failed.");
  if (transactionCount !== fixture.transactions.length) throw new Error("Seed transaction count assertion failed.");
  if (confirmationCount !== fixture.confirmations.length) throw new Error("Seed confirmation count assertion failed.");

  const { data: monthRows, error: monthError } = await client
    .from("transactions")
    .select("date,amount_cents")
    .eq("household_id", fixture.household.id)
    .gte("date", startOfCurrentMonth());
  if (monthError) throw monthError;
  const moneyIn = (monthRows ?? []).some((row) => Number(row.amount_cents) > 0);
  const moneyOut = (monthRows ?? []).some((row) => Number(row.amount_cents) < 0);
  if (!moneyIn || !moneyOut) throw new Error("Current-month money in/out assertion failed.");

  const dates = fixture.transactions.map((transaction) => transaction.date).sort();
  const startAgeDays = Math.floor((Date.now() - Date.parse(`${dates[0]}T00:00:00Z`)) / 86400000);
  if (startAgeDays < 150 || startAgeDays > 200) {
    throw new Error("Transaction date-window assertion failed.");
  }
  return { accountCount, transactionCount, confirmationCount };
}

async function inspectFixture(client, fixture) {
  const identity = await readFixtureIdentity(client, fixture.household.id);
  if (!identity.household) {
    return { exists: false, household_id: fixture.household.id, expected_name: HOUSEHOLD_NAME };
  }
  const tables = [
    "accounts",
    "external_accounts",
    "transactions",
    "transaction_pattern_confirmations",
    "decisions",
    "money_goals",
    "recurring_bills",
    "recurring_income",
  ];
  const counts = {};
  for (const table of tables) counts[table] = await countRows(client, table, fixture.household.id);
  return {
    exists: true,
    household: identity.household,
    members: identity.members,
    sources: identity.connections,
    counts,
  };
}

async function deleteByHousehold(client, table, householdId) {
  const { error } = await client.from(table).delete().eq("household_id", householdId);
  if (error) throw new Error(`${table} reset failed: ${error.message}`);
}

async function resetFixture(client, fixture) {
  const identity = await readFixtureIdentity(client, fixture.household.id);
  assertFixtureIdentity(identity, fixture);

  for (const table of [
    "decisions",
    "transaction_pattern_confirmations",
    "money_goals",
    "transactions",
    "external_accounts",
    "accounts",
    "external_connections",
    "household_members",
  ]) {
    await deleteByHousehold(client, table, fixture.household.id);
  }
  const { error: householdError } = await client
    .from("households")
    .delete()
    .eq("id", fixture.household.id)
    .eq("name", HOUSEHOLD_NAME);
  if (householdError) throw householdError;

  const inspection = await inspectFixture(client, fixture);
  if (inspection.exists) throw new Error("Reset verification failed: demo household still exists.");
  return inspection;
}

async function seedFixture(client, fixture) {
  await requireAuthUser(client, fixture.membership.user_id);
  const existing = await readFixtureIdentity(client, fixture.household.id);
  if (existing.household) {
    throw new Error(
      `Demo household already exists. Inspect or reset ${fixture.household.id} before seeding again.`
    );
  }

  let householdCreated = false;
  try {
    await insertRows(client, "households", [fixture.household]);
    householdCreated = true;
    await insertRows(client, "household_members", [fixture.membership]);
    await insertRows(client, "external_connections", [fixture.connection]);
    await insertRows(client, "accounts", fixture.accounts);
    await insertRows(client, "external_accounts", fixture.externalAccounts);
    await insertRows(client, "transactions", fixture.transactions);
    await insertRows(client, "transaction_pattern_confirmations", fixture.confirmations);
    await insertRows(client, "decisions", [fixture.decision]);
    await insertRows(client, "money_goals", [fixture.goal]);
    return await assertSeeded(client, fixture);
  } catch (error) {
    const cleanupErrors = [];
    if (householdCreated) {
      for (const table of [
        "decisions",
        "transaction_pattern_confirmations",
        "money_goals",
        "transactions",
        "external_accounts",
        "accounts",
        "external_connections",
        "household_members",
      ]) {
        const { error: cleanupError } = await client
          .from(table)
          .delete()
          .eq("household_id", fixture.household.id);
        if (cleanupError) cleanupErrors.push(`${table}: ${cleanupError.message}`);
      }
      const { error: householdCleanupError } = await client
        .from("households")
        .delete()
        .eq("id", fixture.household.id);
      if (householdCleanupError) cleanupErrors.push(`households: ${householdCleanupError.message}`);
    }
    if (cleanupErrors.length) {
      const originalMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`${originalMessage} Rollback also failed: ${cleanupErrors.join("; ")}`);
    }
    throw error;
  }
}

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  if (command === "assert-isolation") {
    const assertion = assertFamilyOneIncomeFixtureIsolation(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    );
    console.log(JSON.stringify({ fixture_version: FIXTURE_VERSION, ...assertion }, null, 2));
    return;
  }
  requireScenario(args.scenario);
  const { supabaseUrl, projectRef } = requireBaseSafety();
  const ownerUserId = String(args["owner-user-id"] || "");
  requireOwner(ownerUserId);
  const fixture = buildFamilyOneIncomeFixture({ ownerUserId });
  validateFixturePayload(fixture);

  if (command === "seed") {
    if (args.apply && args["dry-run"]) {
      throw new Error("Choose either --apply or --dry-run, not both.");
    }
    if (!args.apply) {
      console.log(JSON.stringify(fixtureSummary(fixture, "dry-run", projectRef), null, 2));
      console.log("Dry-run only. Add --apply to write this dedicated demo household.");
      return;
    }
    const client = serviceClient(supabaseUrl);
    const assertions = await seedFixture(client, fixture);
    console.log(JSON.stringify({ seeded: true, household: fixture.household, assertions }, null, 2));
    console.log(`Reset with: npm run demo:reset -- --scenario ${SCENARIO} --owner-user-id ${ownerUserId} --confirm-household ${fixture.household.id}`);
    return;
  }

  const client = serviceClient(supabaseUrl);
  if (command === "inspect") {
    console.log(JSON.stringify(await inspectFixture(client, fixture), null, 2));
    return;
  }
  if (command === "reset") {
    const confirmation = String(args["confirm-household"] || "");
    if (confirmation !== fixture.household.id) {
      throw new Error(`--confirm-household must exactly match ${fixture.household.id}.`);
    }
    await resetFixture(client, fixture);
    console.log(JSON.stringify({ reset: true, household_id: fixture.household.id }, null, 2));
    return;
  }
  throw new Error("Use one of: inspect, seed, reset, assert-isolation.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Demo fixture failed: ${message}`);
  process.exitCode = 1;
});
