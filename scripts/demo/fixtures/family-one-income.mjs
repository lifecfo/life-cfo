import { createHash } from "node:crypto";

export const SCENARIO = "family-one-income";
export const FIXTURE_VERSION = "family-one-income-v2";
export const HOUSEHOLD_NAME = "[DEMO] Family of Four - One Income";

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

function postedAt(date) {
  return `${date}T09:00:00.000Z`;
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

export function buildFamilyOneIncomeFixture({ ownerUserId, anchorDate = new Date() }) {
  const anchor = new Date(anchorDate);
  const fixtureNamespace = `${SCENARIO}:${ownerUserId}:${FIXTURE_VERSION}`;
  const fixtureUuid = (key) => deterministicUuid(`${fixtureNamespace}:${key}`);
  const externalNamespace = `demo:${SCENARIO}:${FIXTURE_VERSION}:${ownerUserId}`;
  const random = seededRandom(`${fixtureNamespace}:${anchor.toISOString().slice(0, 10)}`);
  const householdId = fixtureUuid("household");
  const membershipId = fixtureUuid("membership:owner");
  const connectionId = fixtureUuid("connection");
  const accountIds = {
    everyday: fixtureUuid("account:everyday"),
    bills: fixtureUuid("account:bills"),
    savings: fixtureUuid("account:savings"),
    card: fixtureUuid("account:card"),
  };
  const accountDefinitions = [
    { key: "everyday", name: "Everyday account", type: "cash", subtype: "checking", balance: 235000, available: 235000, mask: "4101" },
    { key: "bills", name: "Bills account", type: "cash", subtype: "checking", balance: 485000, available: 485000, mask: "4102" },
    { key: "savings", name: "Savings / buffer account", type: "cash", subtype: "savings", balance: 1485000, available: 1485000, mask: "4103" },
    { key: "card", name: "Family spending card", type: "credit", subtype: "credit card", balance: -218000, available: null, mask: "4104" },
  ];
  const connectionMetadata = {
    demo: true,
    scenario: SCENARIO,
    version: FIXTURE_VERSION,
  };
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
    metadata: connectionMetadata,
    last_sync_at: null,
    updated_at: anchor.toISOString(),
  };
  const accounts = accountDefinitions.map((account) => ({
    id: accountIds[account.key],
    user_id: ownerUserId,
    household_id: householdId,
    connection_id: connectionId,
    provider: "manual",
    external_id: `${externalNamespace}:account:${account.key}`,
    provider_account_id: `${externalNamespace}:account:${account.key}`,
    name: account.name,
    official_name: account.name,
    type: account.type,
    subtype: account.subtype,
    status: "active",
    currency: "AUD",
    current_balance_cents: account.balance,
    available_balance_cents: account.available,
    mask: account.mask,
    archived: false,
    updated_at: anchor.toISOString(),
  }));
  const externalAccounts = accountDefinitions.map((account) => ({
    id: fixtureUuid(`external-account:${account.key}`),
    household_id: householdId,
    provider: "manual",
    connection_id: connectionId,
    provider_account_id: `${externalNamespace}:account:${account.key}`,
    name: account.name,
    mask: account.mask,
    type: account.type,
    subtype: account.subtype,
    currency: "AUD",
    archived: false,
    metadata: connectionMetadata,
    updated_at: anchor.toISOString(),
  }));

  const transactions = [];
  let sequence = 0;
  const addTransaction = ({ account, daysAgo, amountCents, merchant, description, category }) => {
    sequence += 1;
    const date = dateDaysAgo(anchor, Math.max(0, daysAgo));
    const externalId = `${externalNamespace}:transaction:${String(sequence).padStart(4, "0")}`;
    transactions.push({
      id: fixtureUuid(`transaction:${sequence}:${date}`),
      user_id: ownerUserId,
      household_id: householdId,
      account_id: accountIds[account],
      connection_id: connectionId,
      external_connection_id: connectionId,
      provider: "manual",
      external_id: externalId,
      date,
      posted_at: postedAt(date),
      description,
      merchant,
      category,
      pending: false,
      amount_cents: amountCents,
      amount: amountCents / 100,
      currency: "AUD",
      updated_at: anchor.toISOString(),
    });
  };
  const jitter = (base, spread) => Math.round(base + (random() * 2 - 1) * spread);
  const grocers = ["Woolworths", "Coles", "Aldi"];
  const fuelMerchants = ["Ampol", "BP", "Shell Coles Express"];

  for (let fortnight = 0; fortnight < 13; fortnight += 1) {
    addTransaction({ account: "everyday", daysAgo: 3 + fortnight * 14, amountCents: 452000, merchant: "Harbour Engineering Payroll", description: "Primary salary", category: "Income" });
  }
  for (let payment = 0; payment < 3; payment += 1) {
    addTransaction({ account: "everyday", daysAgo: 24 + payment * 62, amountCents: jitter(62000, 12000), merchant: "Freelance Design", description: "Occasional project income", category: "Income" });
  }
  for (let week = 0; week < 26; week += 1) {
    const base = week * 7;
    addTransaction({ account: "card", daysAgo: base + 1, amountCents: -jitter(14200, 2800), merchant: grocers[week % grocers.length], description: "Family groceries", category: "Groceries" });
    addTransaction({ account: "card", daysAgo: base + 4, amountCents: -jitter(7800, 1600), merchant: grocers[(week + 1) % grocers.length], description: "Grocery top-up", category: "Groceries" });
    addTransaction({ account: "card", daysAgo: base + 2, amountCents: -jitter(8600, 1700), merchant: fuelMerchants[week % fuelMerchants.length], description: "Petrol", category: "Transport" });
    addTransaction({ account: "everyday", daysAgo: base + 3, amountCents: -18000, merchant: "Little Oaks Childcare", description: "Childcare", category: "Childcare" });
    addTransaction({ account: "card", daysAgo: base + 5, amountCents: -3800, merchant: "Northside Junior Sport", description: "Kids sport and activities", category: "Kids" });
    addTransaction({ account: "card", daysAgo: base + 6, amountCents: -jitter(4200, 1700), merchant: week % 2 === 0 ? "Local Cafe" : "Family Takeaway", description: "Family spending", category: "Dining" });
    if (week % 3 === 0) {
      addTransaction({ account: "card", daysAgo: base + 2, amountCents: -jitter(4600, 1800), merchant: "Priceline Pharmacy", description: "Pharmacy and medical", category: "Health" });
    }
  }
  for (let month = 0; month < 6; month += 1) {
    const base = 5 + month * 30;
    addTransaction({ account: "bills", daysAgo: base, amountCents: -315000, merchant: "Harbour Home Loan", description: "Mortgage repayment", category: "Housing" });
    addTransaction({ account: "bills", daysAgo: base + 2, amountCents: -jitter(16800, 2400), merchant: "Origin Energy", description: "Electricity", category: "Utilities" });
    addTransaction({ account: "bills", daysAgo: base + 4, amountCents: -9500, merchant: "Aussie Broadband", description: "Home internet", category: "Utilities" });
    addTransaction({ account: "bills", daysAgo: base + 6, amountCents: -7200, merchant: "Telstra", description: "Mobile phones", category: "Utilities" });
    addTransaction({ account: "bills", daysAgo: base + 8, amountCents: -18500, merchant: "Allianz Insurance", description: "Home and car insurance", category: "Insurance" });
    addTransaction({ account: "everyday", daysAgo: base + 10, amountCents: -24000, merchant: "Riverside Public School", description: "School costs", category: "Education" });
    addTransaction({ account: "card", daysAgo: base + 12, amountCents: -2299, merchant: "Netflix", description: "Streaming subscription", category: "Subscriptions" });
    addTransaction({ account: "everyday", daysAgo: base + 14, amountCents: -15000, merchant: "Community Church", description: "Regular giving", category: "Giving" });
    addTransaction({ account: "everyday", daysAgo: base + 16, amountCents: -30000, merchant: "Internal Transfer to Savings", description: "Family buffer transfer", category: "Transfer" });
    addTransaction({ account: "savings", daysAgo: base + 16, amountCents: 30000, merchant: "Internal Transfer from Everyday", description: "Family buffer transfer", category: "Transfer" });
  }
  addTransaction({ account: "card", daysAgo: 42, amountCents: -138500, merchant: "Northside Auto Repairs", description: "Unexpected car repair", category: "Transport" });
  addTransaction({ account: "everyday", daysAgo: 71, amountCents: -18500, merchant: "Riverside School Camp", description: "School camp", category: "Education" });
  addTransaction({ account: "card", daysAgo: 116, amountCents: -22400, merchant: "Family Medical Centre", description: "Specialist appointment", category: "Health" });

  const salaryRange = observedRange(transactions, "Harbour Engineering Payroll");
  const mortgageRange = observedRange(transactions, "Harbour Home Loan");
  const transferRange = observedRange(transactions, "Internal Transfer to Savings");
  const confirmations = [
    { id: fixtureUuid("confirmation:salary"), household_id: householdId, pattern_key: "income:AUD:HARBOUR ENGINEERING PAYROLL", kind: "income", label: "Main salary", amount_cents: 452000, currency: "AUD", cadence: "fortnightly", confidence: "confirmed", source_provider: "manual", first_seen_at: salaryRange.first, last_seen_at: salaryRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
    { id: fixtureUuid("confirmation:mortgage"), household_id: householdId, pattern_key: "outflow:AUD:HARBOUR HOME LOAN", kind: "bill", label: "Home loan", amount_cents: 315000, currency: "AUD", cadence: "monthly", confidence: "confirmed", source_provider: "manual", first_seen_at: mortgageRange.first, last_seen_at: mortgageRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
    { id: fixtureUuid("confirmation:transfer"), household_id: householdId, pattern_key: "outflow:AUD:INTERNAL TRANSFER TO SAVINGS", kind: "ignore", label: "Move to family buffer", amount_cents: 30000, currency: "AUD", cadence: "monthly", confidence: "confirmed", source_provider: "manual", first_seen_at: transferRange.first, last_seen_at: transferRange.last, created_by: ownerUserId, updated_at: anchor.toISOString() },
  ];
  const decision = {
    id: fixtureUuid("decision:private-school"),
    user_id: ownerUserId,
    household_id: householdId,
    title: "What would private school next year do to our breathing room?",
    context: "The family wants to understand the monthly trade-offs before making a commitment.",
    decision_context: { scenario: SCENARIO, demo: true },
    status: "open",
    origin: "decisions",
    pinned: true,
    framed_at: anchor.toISOString(),
  };
  const targetDate = dateDaysAgo(anchor, -180);
  const goal = {
    id: fixtureUuid("goal:emergency-buffer"),
    user_id: ownerUserId,
    household_id: householdId,
    title: "Emergency buffer",
    currency: "AUD",
    target_cents: 2000000,
    current_cents: 1485000,
    target_date: targetDate,
    deadline_at: `${targetDate}T09:00:00.000Z`,
    notes: "A calm family buffer for repairs, health costs, or a change in income.",
    status: "active",
    is_primary: true,
    updated_at: anchor.toISOString(),
  };

  return {
    scenario: SCENARIO,
    version: FIXTURE_VERSION,
    household: { id: householdId, name: HOUSEHOLD_NAME },
    membership: { id: membershipId, household_id: householdId, user_id: ownerUserId, role: "owner" },
    connection,
    accounts,
    externalAccounts,
    transactions,
    confirmations,
    decision,
    goal,
  };
}

export function assertFamilyOneIncomeFixtureIsolation(ownerUserIdA, ownerUserIdB) {
  if (ownerUserIdA === ownerUserIdB) {
    throw new Error("Fixture isolation requires two different owner user IDs.");
  }
  const anchorDate = new Date("2026-07-01T00:00:00.000Z");
  const fixtureA = buildFamilyOneIncomeFixture({ ownerUserId: ownerUserIdA, anchorDate });
  const fixtureB = buildFamilyOneIncomeFixture({ ownerUserId: ownerUserIdB, anchorDate });
  const comparedIds = {
    household: [fixtureA.household.id, fixtureB.household.id],
    membership: [fixtureA.membership.id, fixtureB.membership.id],
    connection: [fixtureA.connection.id, fixtureB.connection.id],
    account: [fixtureA.accounts[0].id, fixtureB.accounts[0].id],
    transaction: [fixtureA.transactions[0].id, fixtureB.transactions[0].id],
    confirmation: [fixtureA.confirmations[0].id, fixtureB.confirmations[0].id],
    goal: [fixtureA.goal.id, fixtureB.goal.id],
    decision: [fixtureA.decision.id, fixtureB.decision.id],
  };
  for (const [objectType, [idA, idB]] of Object.entries(comparedIds)) {
    if (idA === idB) throw new Error(`${objectType} fixture IDs are not isolated.`);
  }
  return { passed: true, compared: Object.keys(comparedIds) };
}
