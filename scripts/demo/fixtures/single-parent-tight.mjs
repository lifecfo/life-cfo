import { createHash } from "node:crypto";

export const SCENARIO = "single-parent-tight";
export const FIXTURE_VERSION = "single-parent-tight-v1";
export const HOUSEHOLD_NAME = "[DEMO] Single Parent - Tight Budget";

function deterministicUuid(key) {
  const bytes = createHash("sha256").update(`life-cfo:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function seededRandom(seed) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function dateDaysAgo(anchor, daysAgo) {
  const date = new Date(anchor);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function observedRange(transactions, merchant) {
  const dates = transactions
    .filter((transaction) => transaction.merchant === merchant)
    .map((transaction) => transaction.date)
    .sort();
  return {
    first: dates.length ? `${dates[0]}T09:00:00.000Z` : null,
    last: dates.length ? `${dates[dates.length - 1]}T09:00:00.000Z` : null,
  };
}

export function buildSingleParentTightFixture({ ownerUserId, anchorDate = new Date() }) {
  const anchor = new Date(anchorDate);
  const fixtureNamespace = `${SCENARIO}:${ownerUserId}:${FIXTURE_VERSION}`;
  const fixtureUuid = (key) => deterministicUuid(`${fixtureNamespace}:${key}`);
  const externalNamespace = `demo:${SCENARIO}:${FIXTURE_VERSION}:${ownerUserId}`;
  const random = seededRandom(`${fixtureNamespace}:${anchor.toISOString().slice(0, 10)}`);
  const householdId = fixtureUuid("household");
  const connectionId = fixtureUuid("connection");
  const accountIds = {
    everyday: fixtureUuid("account:everyday"),
    bills: fixtureUuid("account:bills"),
    savings: fixtureUuid("account:savings"),
    card: fixtureUuid("account:card"),
  };
  const accountDefinitions = [
    { key: "everyday", name: "Everyday account", type: "cash", subtype: "checking", balance: 128000, available: 128000, mask: "5201" },
    { key: "bills", name: "Bills account", type: "cash", subtype: "checking", balance: 94000, available: 94000, mask: "5202" },
    { key: "savings", name: "Small emergency buffer", type: "cash", subtype: "savings", balance: 215000, available: 215000, mask: "5203" },
    { key: "card", name: "Household spending card", type: "credit", subtype: "credit card", balance: -86000, available: null, mask: "5204" },
  ];
  const metadata = { demo: true, scenario: SCENARIO, version: FIXTURE_VERSION };
  const connection = {
    id: connectionId,
    household_id: householdId,
    user_id: ownerUserId,
    provider: "manual",
    status: "demo",
    display_name: "Manual demo data",
    provider_connection_id: `${externalNamespace}:connection`,
    encrypted_access_token: null,
    item_id: null,
    metadata,
    last_sync_at: null,
    updated_at: anchor.toISOString(),
  };
  const accounts = accountDefinitions.map((account) => ({
    id: accountIds[account.key], user_id: ownerUserId, household_id: householdId,
    connection_id: connectionId, provider: "manual",
    external_id: `${externalNamespace}:account:${account.key}`,
    provider_account_id: `${externalNamespace}:account:${account.key}`,
    name: account.name, official_name: account.name, type: account.type, subtype: account.subtype,
    status: "active", currency: "AUD", current_balance_cents: account.balance,
    available_balance_cents: account.available, mask: account.mask, archived: false,
    updated_at: anchor.toISOString(),
  }));
  const externalAccounts = accountDefinitions.map((account) => ({
    id: fixtureUuid(`external-account:${account.key}`), household_id: householdId,
    provider: "manual", connection_id: connectionId,
    provider_account_id: `${externalNamespace}:account:${account.key}`,
    name: account.name, mask: account.mask, type: account.type, subtype: account.subtype,
    currency: "AUD", archived: false, metadata, updated_at: anchor.toISOString(),
  }));

  const transactions = [];
  let sequence = 0;
  const addTransaction = ({ account, daysAgo, amountCents, merchant, description, category }) => {
    sequence += 1;
    const date = dateDaysAgo(anchor, Math.max(0, daysAgo));
    transactions.push({
      id: fixtureUuid(`transaction:${sequence}:${date}`), user_id: ownerUserId,
      household_id: householdId, account_id: accountIds[account], connection_id: connectionId,
      external_connection_id: connectionId, provider: "manual",
      external_id: `${externalNamespace}:transaction:${String(sequence).padStart(4, "0")}`,
      date, posted_at: `${date}T09:00:00.000Z`, description, merchant, category,
      pending: false, amount_cents: amountCents, amount: amountCents / 100,
      currency: "AUD", updated_at: anchor.toISOString(),
    });
  };
  const jitter = (base, spread) => Math.round(base + (random() * 2 - 1) * spread);

  for (let fortnight = 0; fortnight < 13; fortnight += 1) {
    addTransaction({ account: "everyday", daysAgo: 2 + fortnight * 14, amountCents: 228000, merchant: "Cedar Community Services Payroll", description: "Fortnightly salary", category: "Income" });
  }
  for (let payment = 0; payment < 5; payment += 1) {
    addTransaction({ account: "everyday", daysAgo: 10 + payment * 35, amountCents: jitter(36000, 9000), merchant: "Family Support Payment", description: "Irregular family support", category: "Income" });
  }
  addTransaction({ account: "everyday", daysAgo: 0, amountCents: 228000, merchant: "Cedar Community Services Payroll", description: "Fortnightly salary", category: "Income" });
  addTransaction({ account: "card", daysAgo: 0, amountCents: -13200, merchant: "Northside Grocer", description: "Weekly groceries", category: "Groceries" });
  for (let week = 0; week < 26; week += 1) {
    const base = week * 7;
    addTransaction({ account: "card", daysAgo: base + 1, amountCents: -jitter(13200, 2200), merchant: week % 2 ? "Corner Pantry" : "Northside Grocer", description: "Weekly groceries", category: "Groceries" });
    addTransaction({ account: "everyday", daysAgo: base + 2, amountCents: -24000, merchant: "Little Oaks Childcare", description: "Childcare", category: "Childcare" });
    addTransaction({ account: "card", daysAgo: base + 3, amountCents: -jitter(5200, 1300), merchant: "Greenway Fuel", description: "Transport", category: "Transport" });
    addTransaction({ account: "card", daysAgo: base + 5, amountCents: -jitter(2600, 900), merchant: "Bright Start School", description: "School and child costs", category: "Education" });
    if (week % 4 === 0) {
      addTransaction({ account: "card", daysAgo: base + 4, amountCents: -jitter(5800, 1800), merchant: "Everyday Pharmacy", description: "Health costs", category: "Health" });
    }
  }
  for (let month = 0; month < 6; month += 1) {
    const base = 4 + month * 30;
    addTransaction({ account: "bills", daysAgo: base, amountCents: -185000, merchant: "Willow Property Rent", description: "Rent", category: "Housing" });
    addTransaction({ account: "bills", daysAgo: base + 4, amountCents: -jitter(12500, 1800), merchant: "Riverbend Energy", description: "Electricity", category: "Utilities" });
    addTransaction({ account: "bills", daysAgo: base + 7, amountCents: -6900, merchant: "Clearline Internet", description: "Home internet", category: "Utilities" });
    addTransaction({ account: "bills", daysAgo: base + 9, amountCents: -8400, merchant: "Bright Mobile", description: "Mobile phone", category: "Utilities" });
    addTransaction({ account: "bills", daysAgo: base + 12, amountCents: -11800, merchant: "Greenline Insurance", description: "Car insurance", category: "Insurance" });
    addTransaction({ account: "everyday", daysAgo: base + 16, amountCents: -12000, merchant: "Internal Transfer to Buffer", description: "Small buffer transfer", category: "Transfer" });
    addTransaction({ account: "savings", daysAgo: base + 16, amountCents: 12000, merchant: "Internal Transfer from Everyday", description: "Small buffer transfer", category: "Transfer" });
  }
  addTransaction({ account: "card", daysAgo: 9, amountCents: -112000, merchant: "Northside Auto Care", description: "Unexpected car repair", category: "Transport" });
  addTransaction({ account: "everyday", daysAgo: 47, amountCents: -38000, merchant: "Harbour Health Clinic", description: "Specialist and tests", category: "Health" });
  addTransaction({ account: "card", daysAgo: 88, amountCents: -24500, merchant: "Bright Start School Camp", description: "School camp payment", category: "Education" });

  const salaryRange = observedRange(transactions, "Cedar Community Services Payroll");
  const rentRange = observedRange(transactions, "Willow Property Rent");
  const childcareRange = observedRange(transactions, "Little Oaks Childcare");
  const insuranceRange = observedRange(transactions, "Greenline Insurance");
  const transferRange = observedRange(transactions, "Internal Transfer to Buffer");
  const confirmations = [
    { id: fixtureUuid("confirmation:salary"), household_id: householdId, pattern_key: "income:AUD:CEDAR COMMUNITY SERVICES PAYROLL", kind: "income", label: "Main salary", amount_cents: 228000, currency: "AUD", cadence: "fortnightly", confidence: "confirmed", source_provider: "manual", first_seen_at: salaryRange.first, last_seen_at: salaryRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
    { id: fixtureUuid("confirmation:rent"), household_id: householdId, pattern_key: "outflow:AUD:WILLOW PROPERTY RENT", kind: "bill", label: "Rent", amount_cents: 185000, currency: "AUD", cadence: "monthly", confidence: "confirmed", source_provider: "manual", first_seen_at: rentRange.first, last_seen_at: rentRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
    { id: fixtureUuid("confirmation:childcare"), household_id: householdId, pattern_key: "outflow:AUD:LITTLE OAKS CHILDCARE", kind: "bill", label: "Childcare", amount_cents: 24000, currency: "AUD", cadence: "weekly", confidence: "confirmed", source_provider: "manual", first_seen_at: childcareRange.first, last_seen_at: childcareRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
    { id: fixtureUuid("confirmation:insurance"), household_id: householdId, pattern_key: "outflow:AUD:GREENLINE INSURANCE", kind: "bill", label: "Car insurance", amount_cents: 11800, currency: "AUD", cadence: "monthly", confidence: "confirmed", source_provider: "manual", first_seen_at: insuranceRange.first, last_seen_at: insuranceRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
    { id: fixtureUuid("confirmation:transfer"), household_id: householdId, pattern_key: "outflow:AUD:INTERNAL TRANSFER TO BUFFER", kind: "ignore", label: "Move to small buffer", amount_cents: 12000, currency: "AUD", cadence: "monthly", confidence: "confirmed", source_provider: "manual", first_seen_at: transferRange.first, last_seen_at: transferRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
  ];
  const familyMembers = [
    { id: fixtureUuid("family:adult-me"), user_id: ownerUserId, household_id: householdId, name: "Demo Parent", birth_year: 1990, relationship: "Me", about: "Single parent balancing work hours and family costs.", archived_at: null, updated_at: anchor.toISOString() },
    { id: fixtureUuid("family:child-older"), user_id: ownerUserId, household_id: householdId, name: "Older Child", birth_year: 2014, relationship: "Child", about: "School-aged child with school and activity costs.", archived_at: null, updated_at: anchor.toISOString() },
    { id: fixtureUuid("family:child-younger"), user_id: ownerUserId, household_id: householdId, name: "Younger Child", birth_year: 2019, relationship: "Child", about: "Younger child with regular childcare costs.", archived_at: null, updated_at: anchor.toISOString() },
  ];
  const pets = [
    { id: fixtureUuid("pet:cat"), user_id: ownerUserId, household_id: householdId, name: "Demo Cat", type: "Cat", notes: "A sample family pet.", archived_at: null, updated_at: anchor.toISOString() },
  ];
  const recurringIncome = [
    { id: fixtureUuid("recurring-income:salary"), user_id: ownerUserId, household_id: householdId, name: "Main salary", amount_cents: 228000, currency: "AUD", cadence: "fortnightly", next_pay_at: `${dateDaysAgo(anchor, -12)}T09:00:00.000Z`, active: true, notes: "Demo timing for planning.", updated_at: anchor.toISOString() },
  ];
  const recurringBills = [
    { id: fixtureUuid("recurring-bill:rent"), user_id: ownerUserId, household_id: householdId, name: "Rent", amount_cents: 185000, currency: "AUD", cadence: "monthly", next_due_at: `${dateDaysAgo(anchor, -4)}T09:00:00.000Z`, autopay: true, active: true, notes: "Demo timing for planning.", updated_at: anchor.toISOString() },
    { id: fixtureUuid("recurring-bill:childcare"), user_id: ownerUserId, household_id: householdId, name: "Childcare", amount_cents: 24000, currency: "AUD", cadence: "weekly", next_due_at: `${dateDaysAgo(anchor, -2)}T09:00:00.000Z`, autopay: true, active: true, notes: null, updated_at: anchor.toISOString() },
    { id: fixtureUuid("recurring-bill:insurance"), user_id: ownerUserId, household_id: householdId, name: "Car insurance", amount_cents: 11800, currency: "AUD", cadence: "monthly", next_due_at: `${dateDaysAgo(anchor, -11)}T09:00:00.000Z`, autopay: true, active: true, notes: null, updated_at: anchor.toISOString() },
  ];
  const moneyBuckets = [
    { id: fixtureUuid("money-bucket:monthly-bills"), household_id: householdId, name: "Monthly bills", purpose_type: "bills", currency: "AUD", target_amount_cents: null, target_date: null, priority: 10, status: "active", notes: "Backed by the demo bills account.", created_by: ownerUserId, created_at: anchor.toISOString(), updated_at: anchor.toISOString() },
    { id: fixtureUuid("money-bucket:emergency-reserve"), household_id: householdId, name: "Emergency reserve", purpose_type: "safety", currency: "AUD", target_amount_cents: 600000, target_date: dateDaysAgo(anchor, -300), priority: 20, status: "active", notes: "Part of the demo savings account is set aside for this purpose.", created_by: ownerUserId, created_at: anchor.toISOString(), updated_at: anchor.toISOString() },
    { id: fixtureUuid("money-bucket:car-costs-plan"), household_id: householdId, name: "Car costs to plan", purpose_type: "true_expense", currency: "AUD", target_amount_cents: 300000, target_date: dateDaysAgo(anchor, -150), priority: 30, status: "active", notes: "Tracked for planning without account backing.", created_by: ownerUserId, created_at: anchor.toISOString(), updated_at: anchor.toISOString() },
  ];
  const bucketAllocations = [
    { id: fixtureUuid("money-bucket-allocation:monthly-bills"), household_id: householdId, bucket_id: moneyBuckets[0].id, account_id: accountIds.bills, allocation_type: "whole_account", amount_cents: null, created_by: ownerUserId, created_at: anchor.toISOString(), updated_at: anchor.toISOString() },
    { id: fixtureUuid("money-bucket-allocation:emergency-reserve"), household_id: householdId, bucket_id: moneyBuckets[1].id, account_id: accountIds.savings, allocation_type: "partial_account", amount_cents: 150000, created_by: ownerUserId, created_at: anchor.toISOString(), updated_at: anchor.toISOString() },
  ];
  const goals = [
    { id: fixtureUuid("goal:car-repair"), user_id: ownerUserId, household_id: householdId, title: "Car repair buffer", currency: "AUD", target_cents: 300000, current_cents: 95000, target_date: dateDaysAgo(anchor, -150), deadline_at: `${dateDaysAgo(anchor, -150)}T09:00:00.000Z`, notes: "A small buffer for transport surprises.", status: "active", is_primary: true, updated_at: anchor.toISOString() },
    { id: fixtureUuid("goal:emergency"), user_id: ownerUserId, household_id: householdId, title: "Emergency buffer", currency: "AUD", target_cents: 600000, current_cents: 215000, target_date: dateDaysAgo(anchor, -300), deadline_at: `${dateDaysAgo(anchor, -300)}T09:00:00.000Z`, notes: "A longer-term sample buffer goal.", status: "active", is_primary: false, updated_at: anchor.toISOString() },
  ];
  const decisions = [
    { id: fixtureUuid("decision:work-hours"), user_id: ownerUserId, household_id: householdId, title: "Would changing work hours make the month easier?", context: "The parent wants to compare income changes with childcare and transport costs.", decision_context: { scenario: SCENARIO, demo: true }, status: "open", origin: "decisions", pinned: true, framed_at: anchor.toISOString() },
    { id: fixtureUuid("decision:car-cost"), user_id: ownerUserId, household_id: householdId, title: "How should we plan for the next large car cost?", context: "A recent repair reduced the small cash buffer.", decision_context: { scenario: SCENARIO, demo: true }, status: "open", origin: "decisions", pinned: false, framed_at: anchor.toISOString() },
  ];

  return {
    scenario: SCENARIO, version: FIXTURE_VERSION,
    household: { id: householdId, name: HOUSEHOLD_NAME },
    membership: { id: fixtureUuid("membership:owner"), household_id: householdId, user_id: ownerUserId, role: "owner" },
    connection, accounts, externalAccounts, transactions, confirmations,
    familyMembers, pets, recurringIncome, recurringBills, moneyBuckets, bucketAllocations, goals, decisions,
  };
}

export function assertSingleParentTightFixtureIsolation(ownerUserIdA, ownerUserIdB) {
  if (ownerUserIdA === ownerUserIdB) throw new Error("Fixture isolation requires two different owner user IDs.");
  const anchorDate = new Date("2026-07-01T00:00:00.000Z");
  const fixtureA = buildSingleParentTightFixture({ ownerUserId: ownerUserIdA, anchorDate });
  const fixtureB = buildSingleParentTightFixture({ ownerUserId: ownerUserIdB, anchorDate });
  const pairs = [
    [fixtureA.household.id, fixtureB.household.id], [fixtureA.membership.id, fixtureB.membership.id],
    [fixtureA.connection.id, fixtureB.connection.id], [fixtureA.accounts[0].id, fixtureB.accounts[0].id],
    [fixtureA.transactions[0].id, fixtureB.transactions[0].id], [fixtureA.confirmations[0].id, fixtureB.confirmations[0].id],
    [fixtureA.familyMembers[0].id, fixtureB.familyMembers[0].id], [fixtureA.pets[0].id, fixtureB.pets[0].id],
    [fixtureA.recurringIncome[0].id, fixtureB.recurringIncome[0].id], [fixtureA.recurringBills[0].id, fixtureB.recurringBills[0].id],
    [fixtureA.moneyBuckets[0].id, fixtureB.moneyBuckets[0].id], [fixtureA.bucketAllocations[0].id, fixtureB.bucketAllocations[0].id],
    [fixtureA.goals[0].id, fixtureB.goals[0].id], [fixtureA.decisions[0].id, fixtureB.decisions[0].id],
  ];
  if (pairs.some(([idA, idB]) => idA === idB)) throw new Error("Single-parent fixture IDs are not isolated.");
  return { passed: true, compared: pairs.length };
}
