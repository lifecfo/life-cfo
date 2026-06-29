// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseRoute } from "@/lib/supabaseRoute";
import type { FinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { PressureInterpretation } from "@/lib/money/reasoning/interpretPressure";
import { runHouseholdMoneyReasoning } from "@/lib/money/reasoning/runHouseholdMoneyReasoning";
import { deriveTransactionOutflowSummary } from "@/lib/money/reasoning/deriveTransactionOutflows";
import {
  detectMoneyAskIntent,
  detectReasoningFallbackMode,
} from "@/lib/money/reasoning/intentDetection";
import { joinNonEmptyWithSpace } from "@/lib/ask/responseComposition";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { extractMoneyAskCandidates } from "@/lib/memory/candidateExtraction";
import { isDemoMoneySource } from "@/lib/money/reasoning/effectiveMoneySources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};
type RouteSupabase = Awaited<ReturnType<typeof supabaseRoute>>;
type FamilyMemberRelationshipRow = { relationship?: string | null };
type HouseholdFamilyContext = {
  peopleCount: number;
  dependentsCount: number;
  childrenCount: number;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function formatMoney(cents: unknown, currency = "AUD") {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : Number(cents);
  return formatMoneyFromCents(Number.isFinite(n) ? n : 0, currency);
}

function softDate(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return "an upcoming date";
  const ms = Date.parse(isoOrDate);
  if (!Number.isFinite(ms)) return "an upcoming date";
  return new Date(ms).toLocaleDateString();
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function looksCommitmentsQuestion(lowerQ: string): boolean {
  return /\b(bills?|commitments?|subscriptions?|regular payments?|regular outflows?|outflows?)\b/i.test(
    lowerQ
  );
}

function looksRegularPaymentsQuestion(lowerQ: string): boolean {
  return /\b(regular payments?|recurring payments?|subscriptions?|regular outflows?)\b/i.test(
    lowerQ
  );
}

function looksIncomeQuestion(lowerQ: string): boolean {
  return /\b(income|pay|salary|wages?|earnings?|deposits?)\b/i.test(lowerQ);
}

function looksThisMonthQuestion(lowerQ: string): boolean {
  return /\b(this month|how (?:am|are) (?:i|we) looking)\b/i.test(lowerQ);
}

function looksTightnessQuestion(lowerQ: string): boolean {
  return /\b(why|what).*(tight|tighter|stretched|breathing room|pressure)\b/i.test(lowerQ);
}

function looksDataLayersQuestion(lowerQ: string): boolean {
  const hasLayerTerms = /\b(observed|confirmed|formally set up|formal setup|set up)\b/i.test(lowerQ);
  const hasMoneyTerms = /\b(data|money|accounts?|transactions?|payments?|income|bills?|patterns?)\b/i.test(lowerQ);
  return hasLayerTerms && hasMoneyTerms;
}

function looksTransferLabel(label: string): boolean {
  return /\b(internal transfer|bank transfer|transfer (?:to|from)|move to|move from)\b/i.test(label);
}

function outflowPatternKey(currency: string, label: string): string {
  const normalizedLabel = label
    .toUpperCase()
    .replace(/\b\d{4,}\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `outflow:${String(currency || "AUD").toUpperCase()}:${normalizedLabel}`;
}

function outgoingCategoriesByPatternKey(
  transactions: Array<{
    amount?: number | null;
    amount_cents?: number | null;
    merchant?: string | null;
    description?: string | null;
    category?: string | null;
    currency?: string | null;
  }>
): Map<string, string> {
  const categories = new Map<string, string>();
  for (const transaction of transactions) {
    const cents =
      typeof transaction.amount_cents === "number"
        ? transaction.amount_cents
        : typeof transaction.amount === "number"
          ? Math.round(transaction.amount * 100)
          : 0;
    if (cents >= 0) continue;
    const label = safeStr(transaction.merchant || transaction.description).trim();
    const category = safeStr(transaction.category).trim();
    if (!label || !category) continue;
    categories.set(
      outflowPatternKey(transaction.currency || "AUD", label),
      category
    );
  }
  return categories;
}

type OutgoingPatternBucket = "commitment" | "spending" | "transfer" | "ignored";

function classifyOutgoingPattern(input: {
  kind?: "bill" | "income" | "transfer" | "ignore" | null;
  label: string;
  category?: string | null;
  cadence?: string | null;
}): OutgoingPatternBucket {
  const kind = input.kind ?? null;
  const label = safeStr(input.label).trim();
  const category = safeStr(input.category).trim();
  const text = `${label} ${category}`.toLowerCase();

  if (kind === "ignore") return "ignored";
  if (
    kind === "transfer" ||
    looksTransferLabel(label) ||
    /\b(transfer|savings movement|internal movement)\b/i.test(category)
  ) {
    return "transfer";
  }
  if (
    /\b(aldi|coles|woolworths|supermarket|grocer(?:y|ies)?|food|dining|restaurant|cafe|fuel|petrol|pharmacy|shopping)\b/i.test(
      text
    )
  ) {
    return "spending";
  }
  if (
    /\b(home loan|mortgage|rent|childcare|daycare|school fees?|insurance|electric(?:ity)?|gas|water|internet|phone|mobile|rates|repayment|subscription)\b/i.test(
      text
    )
  ) {
    return "commitment";
  }
  if (kind === "bill") return "commitment";
  if (/\b(weekly|fortnightly|monthly)\b/i.test(safeStr(input.cadence))) {
    return "spending";
  }
  return "spending";
}

function patternLine(input: {
  label: string;
  amountCents: number | null | undefined;
  currency?: string | null;
  cadence?: string | null;
  occurrences?: number;
}): string {
  const amount =
    typeof input.amountCents === "number"
      ? `about ${formatMoney(input.amountCents, input.currency || "AUD")}`
      : "amount not recorded";
  const cadence = safeStr(input.cadence).trim();
  const observed = input.occurrences
    ? `${input.occurrences} recent ${cadence || "repeated"} payments, `
    : "";
  return `${input.label}: ${observed}${amount}${cadence && !input.occurrences ? ` ${cadence}` : ""}.`;
}

function safeSearchTerm(input: string): string {
  return String(input || "")
    .replace(/[^a-z0-9\s&-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function sourceWording(connections: Array<{ provider?: string | null; status?: string | null; metadata?: Record<string, unknown> | null }>) {
  const hasDemo = connections.some(isDemoMoneySource);
  const hasNonDemo = connections.some((connection) => !isDemoMoneySource(connection));
  const hasManualNonDemo = connections.some(
    (connection) =>
      String(connection.provider || "").trim().toLowerCase() === "manual" &&
      !isDemoMoneySource(connection)
  );

  if (hasDemo && !hasNonDemo) {
    return {
      data: "demo data",
      transactions: "demo transactions",
      source: "Manual demo data",
    };
  }
  if (!hasDemo && !hasManualNonDemo) {
    return {
      data: "connected bank data",
      transactions: "connected transactions",
      source: "Connected bank data",
    };
  }
  return {
    data: "visible money data",
    transactions: "visible transactions",
    source: "Visible money data",
  };
}

function buildMonthlyPositionLines(
  inflows: Array<{ currency: string; cents: number }>,
  outflows: Array<{ currency: string; cents: number }>
): string[] {
  const byCurrency = new Map<string, { inflow: number; outflow: number }>();
  for (const row of inflows) {
    byCurrency.set(row.currency, { ...(byCurrency.get(row.currency) ?? { inflow: 0, outflow: 0 }), inflow: row.cents });
  }
  for (const row of outflows) {
    byCurrency.set(row.currency, { ...(byCurrency.get(row.currency) ?? { inflow: 0, outflow: 0 }), outflow: row.cents });
  }

  const showCurrency = byCurrency.size > 1;
  return Array.from(byCurrency.entries()).map(([currency, values]) => {
    const net = values.inflow - values.outflow;
    const prefix = showCurrency ? `${currency}: ` : "";
    return `${prefix}Money in: ${formatMoney(values.inflow, currency)}. Money out: ${formatMoney(
      values.outflow,
      currency
    )}. Difference: ${formatMoney(Math.abs(net), currency)} ${net >= 0 ? "ahead" : "behind"}.`;
  });
}

function hasExplicitCostDetail(lowerQ: string): boolean {
  return /(\$|aud|usd|dollars?|cents?|\d)/i.test(lowerQ);
}

function normalizeQuestionForParsing(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function toCents(amountRaw: string): number | null {
  const value = Number(amountRaw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function extractCurrencyAmountCents(lowerQ: string): number | null {
  const q = normalizeQuestionForParsing(lowerQ);
  const dollarPrefixed = q.match(/\$\s*(\d+(?:\.\d{1,2})?)/i);
  if (dollarPrefixed?.[1]) {
    return toCents(dollarPrefixed[1]);
  }

  const codePrefixed = q.match(/\b(?:aud|usd|cad|eur|gbp|nzd)\s*(\d+(?:\.\d{1,2})?)\b/i);
  if (codePrefixed?.[1]) {
    return toCents(codePrefixed[1]);
  }

  const codeSuffixed = q.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:aud|usd|cad|eur|gbp|nzd|dollars?|bucks)\b/i);
  if (codeSuffixed?.[1]) {
    return toCents(codeSuffixed[1]);
  }

  return null;
}

function looksRecurringAmount(lowerQ: string): boolean {
  const q = normalizeQuestionForParsing(lowerQ);
  return (
    /(per\s*(month|week|fortnight|year)|monthly|weekly|fortnightly|annual|yearly|every month)/i.test(
      q
    ) ||
    /\b(payment|repayment|rent|mortgage|subscription|bill)\b/i.test(q)
  );
}

function extractRecurringAmountCents(lowerQ: string): number | null {
  if (!looksRecurringAmount(lowerQ)) return null;
  return extractCurrencyAmountCents(lowerQ);
}

function hasIncomeDropContext(lowerQ: string): boolean {
  const q = normalizeQuestionForParsing(lowerQ);
  return /(income\s+drops?|income\s+goes\s+down|pay\s+drops?|salary\s+drops?)/i.test(q);
}

function extractIncomeDropPercent(lowerQ: string): number | null {
  if (!hasIncomeDropContext(lowerQ)) return null;
  const q = normalizeQuestionForParsing(lowerQ);
  const match = q.match(/(\d+(?:\.\d+)?)\s*(?:%|percent)/i);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value;
}

function extractIncomeDropAmountCents(lowerQ: string): number | null {
  if (!hasIncomeDropContext(lowerQ)) return null;
  return extractCurrencyAmountCents(lowerQ);
}

function buildAffordabilityParsedLine(params: {
  snapshot: FinancialSnapshot;
  oneOffAmountCents: number | null;
  recurringAmountCents: number | null;
  ambiguous: boolean;
}): string | null {
  const { snapshot, oneOffAmountCents, recurringAmountCents, ambiguous } = params;

  if (typeof recurringAmountCents === "number" && recurringAmountCents > 0) {
    const newCommitments = snapshot.commitments.recurringMonthlyCents + recurringAmountCents;
    const income = snapshot.income.recurringMonthlyCents;
    if (income > 0) {
      const ratio = Math.round((newCommitments / income) * 100);
      return `As a baseline, adding ${formatMoney(
        recurringAmountCents
      )} per month would move recurring commitments to about ${formatMoney(
        newCommitments
      )} per month (around ${ratio}% of recurring income).`;
    }
    return `As a baseline, adding ${formatMoney(
      recurringAmountCents
    )} per month would raise recurring commitments to about ${formatMoney(
      newCommitments
    )} per month. Recurring income is not fully mapped yet, so this read stays cautious.`;
  }

  if (typeof oneOffAmountCents === "number" && oneOffAmountCents > 0) {
    const availableCash = snapshot.liquidity.availableCashCents;
    if (availableCash > 0) {
      const share = Math.round((oneOffAmountCents / availableCash) * 100);
      return ambiguous
        ? `As a baseline, ${formatMoney(
            oneOffAmountCents
          )} is around ${share}% of available cash (${formatMoney(
            availableCash
          )}). If this is a monthly amount rather than one-off, the baseline would be tighter.`
        : `As a baseline, ${formatMoney(
            oneOffAmountCents
          )} is around ${share}% of available cash (${formatMoney(
            availableCash
          )}). This would likely be easier to absorb if timing is flexible.`;
    }
    return `As a baseline, ${formatMoney(
      oneOffAmountCents
    )} can be compared against current cash once available balances are clearer.`;
  }

  return null;
}

function buildScenarioParsedLine(params: {
  snapshot: FinancialSnapshot;
  incomeDropPercent: number | null;
  incomeDropAmountCents: number | null;
}): string | null {
  const { snapshot, incomeDropPercent, incomeDropAmountCents } = params;
  if (incomeDropPercent === null && incomeDropAmountCents === null) {
    return null;
  }

  const income = snapshot.income.recurringMonthlyCents;
  const commitments = snapshot.commitments.recurringMonthlyCents;

  if (income <= 0) {
    return "As a baseline, recurring income is not fully mapped yet, so income-drop sizing stays approximate.";
  }

  if (typeof incomeDropPercent === "number" && incomeDropPercent > 0) {
    const dropCents = Math.round((income * incomeDropPercent) / 100);
    const postDropIncome = Math.max(0, income - dropCents);
    return `As a baseline, a ${incomeDropPercent}% income drop is about ${formatMoney(
      dropCents
    )} per month. This would likely leave about ${formatMoney(
      postDropIncome
    )} against recurring commitments of ${formatMoney(commitments)} per month.`;
  }

  if (typeof incomeDropAmountCents === "number" && incomeDropAmountCents > 0) {
    const postDropIncome = Math.max(0, income - incomeDropAmountCents);
    return `As a baseline, an income drop of ${formatMoney(
      incomeDropAmountCents
    )} per month would likely leave about ${formatMoney(
      postDropIncome
    )} against recurring commitments of ${formatMoney(commitments)} per month.`;
  }

  return null;
}

function isParsingAmbiguous(lowerQ: string): boolean {
  const q = normalizeQuestionForParsing(lowerQ);
  const hasAmount = /\d/.test(q);
  if (!hasAmount) return false;
  const recurring = looksRecurringAmount(q);
  const oneOffHints = /\b(this|that|it|cost|price|buy|purchase)\b/i.test(q);
  return !recurring && !oneOffHints;
}

function hasConcretePurchaseContext(lowerQ: string): boolean {
  const contextHints = [
    "house",
    "home",
    "rent",
    "mortgage",
    "payment",
    "loan",
    "car",
    "holiday",
    "vacation",
    "school",
    "fees",
    "bill",
    "subscription",
    "purchase",
    "buy",
    "upgrade",
    "move",
  ];
  return contextHints.some((hint) => lowerQ.includes(hint));
}

function isSpecificScenarioPrompt(lowerQ: string): boolean {
  const specificHints = [
    "income drops",
    "income drop",
    "income goes down",
    "move",
    "moving",
    "add another bill",
    "add a bill",
    "pause saving",
    "stop saving",
  ];
  return specificHints.some((hint) => lowerQ.includes(hint));
}

function isRecentChangeQuestion(lowerQ: string): boolean {
  return /\b(lately|recently|what changed|why.*worse now|worse now|tighter lately|tight lately)\b/i.test(
    lowerQ
  );
}

function isMeRelationship(relationship: string | null | undefined): boolean {
  const rel = safeStr(relationship).trim().toLowerCase();
  return rel === "me" || rel === "self" || rel === "myself";
}

function isChildRelationship(relationship: string | null | undefined): boolean {
  const rel = safeStr(relationship).trim().toLowerCase();
  return /\b(child|children|kid|kids|son|daughter|toddler|baby|teen)\b/i.test(rel);
}

function isDependentRelationship(relationship: string | null | undefined): boolean {
  const rel = safeStr(relationship).trim().toLowerCase();
  return /\b(dependent|dependant)\b/i.test(rel);
}

async function readHouseholdFamilyContext(
  supabase: RouteSupabase,
  householdId: string
): Promise<HouseholdFamilyContext> {
  const fallback: HouseholdFamilyContext = {
    peopleCount: 0,
    dependentsCount: 0,
    childrenCount: 0,
  };

  try {
    const { data, error } = await supabase
      .from("family_members")
      .select("relationship")
      .eq("household_id", householdId)
      .limit(100);

    if (error || !Array.isArray(data) || data.length === 0) {
      return fallback;
    }

    const rows = data as FamilyMemberRelationshipRow[];
    const peopleRows = rows.filter((r) => !isMeRelationship(r.relationship));
    const peopleCount = peopleRows.length;
    const childrenCount = peopleRows.filter((r) => isChildRelationship(r.relationship)).length;
    const dependentsCount = peopleRows.filter((r) => isDependentRelationship(r.relationship)).length;

    return {
      peopleCount,
      dependentsCount,
      childrenCount,
    };
  } catch {
    return fallback;
  }
}

function shouldIncludeFamilyContextLine(params: {
  mode: "snapshot" | "diagnosis" | "affordability" | "scenario";
  lowerQ: string;
  familyContext: HouseholdFamilyContext;
}): boolean {
  const { mode, lowerQ, familyContext } = params;
  if (familyContext.peopleCount <= 0) return false;

  const questionHasFamilyCue =
    /\b(family|household|kids?|children|child|dependent|dependents|school|childcare|daycare)\b/i.test(
      lowerQ
    );

  if (questionHasFamilyCue) return true;

  if ((mode === "affordability" || mode === "scenario") && familyContext.dependentsCount > 0) {
    return true;
  }

  return false;
}

function buildFamilyContextFragment(params: {
  mode: "snapshot" | "diagnosis" | "affordability" | "scenario";
  lowerQ: string;
  familyContext: HouseholdFamilyContext;
}): string | null {
  const { mode, lowerQ, familyContext } = params;
  if (!shouldIncludeFamilyContextLine({ mode, lowerQ, familyContext })) return null;

  const peopleLabel = `${familyContext.peopleCount} ${
    familyContext.peopleCount === 1 ? "person" : "people"
  }`;

  if (familyContext.dependentsCount > 0) {
    return `With ${peopleLabel} in your household, including ${familyContext.dependentsCount} ${
      familyContext.dependentsCount === 1 ? "dependent" : "dependents"
    }`;
  }

  if (familyContext.childrenCount > 0) {
    return `With ${peopleLabel} in your household, including ${familyContext.childrenCount} ${
      familyContext.childrenCount === 1 ? "child" : "children"
    }`;
  }

  return `With ${peopleLabel} in your household`;
}

type ChangeTx = {
  date?: string | null;
  amount_cents?: number | null;
  pending?: boolean | null;
  category?: string | null;
  description?: string | null;
  merchant?: string | null;
  currency?: string | null;
};

function txDateMs(tx: ChangeTx): number | null {
  const raw = typeof tx.date === "string" ? tx.date : null;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

function txAmountCents(tx: ChangeTx): number {
  const n = typeof tx.amount_cents === "number" ? tx.amount_cents : Number(tx.amount_cents);
  return Number.isFinite(n) ? n : 0;
}

function txText(tx: ChangeTx): string {
  return `${tx.category ?? ""} ${tx.description ?? ""} ${tx.merchant ?? ""}`.toLowerCase();
}

function isBillLikeTx(tx: ChangeTx): boolean {
  return /\b(rent|mortgage|bill|utility|electric|gas|water|internet|phone|insurance|subscription|repayment|loan)\b/i.test(
    txText(tx)
  );
}

function isIncomeLikeTx(tx: ChangeTx): boolean {
  return /\b(salary|payroll|wage|pay|income|deposit|benefit|pension)\b/i.test(txText(tx));
}

function buildRecentChangeDiagnosisLines(params: {
  nowIso: string;
  rollingTransactions: ChangeTx[];
}): string[] {
  const nowMs = Date.parse(params.nowIso);
  if (!Number.isFinite(nowMs)) return [];

  const dayMs = 24 * 60 * 60 * 1000;
  const recentStart = nowMs - 30 * dayMs;
  const priorStart = nowMs - 60 * dayMs;
  const txs = params.rollingTransactions.filter((tx) => tx.pending !== true);

  const inRecent = (tx: ChangeTx) => {
    const ms = txDateMs(tx);
    return ms !== null && ms >= recentStart && ms <= nowMs;
  };
  const inPrior = (tx: ChangeTx) => {
    const ms = txDateMs(tx);
    return ms !== null && ms >= priorStart && ms < recentStart;
  };

  const outflowTransactions = (items: ChangeTx[]) =>
    items.filter(
      (tx) => txAmountCents(tx) < 0 && !looksTransferLabel(txText(tx))
    );
  const sumOutflow = (items: ChangeTx[]) =>
    outflowTransactions(items).reduce(
      (sum, tx) => sum + Math.abs(txAmountCents(tx)),
      0
    );

  const sumIncomeLikeInflow = (items: ChangeTx[]) =>
    items.reduce((sum, tx) => {
      const cents = txAmountCents(tx);
      if (cents <= 0) return sum;
      if (!isIncomeLikeTx(tx)) return sum;
      return sum + cents;
    }, 0);

  const recent = txs.filter(inRecent);
  const prior = txs.filter(inPrior);
  if (!recent.length || !prior.length) return [];

  const currency = safeStr(recent[0]?.currency || prior[0]?.currency) || "AUD";
  const recentOutflow = sumOutflow(recent);
  const priorOutflow = sumOutflow(prior);
  const recentBillOutflow = sumOutflow(recent.filter(isBillLikeTx));
  const priorBillOutflow = sumOutflow(prior.filter(isBillLikeTx));
  const recentIncome = sumIncomeLikeInflow(recent);
  const priorIncome = sumIncomeLikeInflow(prior);

  const lines: string[] = [];

  const spendDelta = recentOutflow - priorOutflow;
  const movement =
    Math.abs(spendDelta) < 1000
      ? "about the same as"
      : spendDelta > 0
        ? `${formatMoney(spendDelta, currency)} more than`
        : `${formatMoney(Math.abs(spendDelta), currency)} less than`;
  lines.push(
    `Money out over the last 30 days was ${formatMoney(recentOutflow, currency)}, ${movement} the prior 30 days (${formatMoney(priorOutflow, currency)}).`
  );

  const categoryTotals = new Map<string, number>();
  for (const tx of outflowTransactions(recent)) {
    const category = safeStr(tx.category).trim();
    if (!category || /^transfer$/i.test(category)) continue;
    categoryTotals.set(
      category,
      (categoryTotals.get(category) ?? 0) + Math.abs(txAmountCents(tx))
    );
  }
  const topCategories = Array.from(categoryTotals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2);
  if (topCategories.length) {
    lines.push(
      `The largest recent categories were ${topCategories
        .map(([category, cents]) => `${category} (${formatMoney(cents, currency)})`)
        .join(" and ")}.`
    );
  }

  const largestPayments = outflowTransactions(recent)
    .map((tx) => ({
      label: safeStr(tx.merchant || tx.description).trim() || "Unlabelled payment",
      cents: Math.abs(txAmountCents(tx)),
    }))
    .sort((left, right) => right.cents - left.cents)
    .slice(0, 2);
  if (largestPayments.length) {
    lines.push(
      `The largest recent payments were ${largestPayments
        .map((payment) => `${payment.label} (${formatMoney(payment.cents, currency)})`)
        .join(" and ")}.`
    );
  }

  if (priorBillOutflow > 0) {
    const billDelta = recentBillOutflow - priorBillOutflow;
    const billRatio = recentBillOutflow / priorBillOutflow;
    if (billDelta >= 20000 && billRatio >= 1.12) {
      lines.push(
        `Bill-like payments were ${formatMoney(billDelta, currency)} higher than the prior 30 days, which can reduce breathing room.`
      );
    }
  }

  if (priorIncome > 0) {
    const incomeDelta = priorIncome - recentIncome;
    const incomeRatio = recentIncome / priorIncome;
    if (incomeDelta >= 30000 && incomeRatio <= 0.9) {
      lines.push(
        `Income-like money in was ${formatMoney(incomeDelta, currency)} lower than the prior 30 days, which can make timing feel tighter.`
      );
    }
  }

  return lines.slice(0, 4);
}

function buildDiagnosisDrivers(
  rankedSignals: Array<{ name: string; summary: string; score: number }>,
  interpretation: PressureInterpretation
): string[] {
  const lines: string[] = [];

  const main = interpretation.main_pressure;
  if (main.key !== "none") {
    const meaning =
      main.key === "structural"
        ? "That often leaves less left over each month."
        : main.key === "discretionary"
          ? "It can reduce day-to-day flexibility."
          : main.key === "timing"
            ? "It can make things feel tighter when money out lands before money in."
            : "It can make the picture feel tighter because confidence is lower right now.";
    lines.push(`${main.summary} ${meaning}`);
    if (main.why_now) lines.push(main.why_now);
  } else {
    lines.push(main.summary);
  }

  if (interpretation.secondary_pressure?.summary) {
    lines.push(`Another signal in the mix is ${interpretation.secondary_pressure.summary}`);
  }

  const includeConfidence =
    interpretation.confidence.freshness !== "fresh" ||
    interpretation.confidence.evidence === "limited";
  if (includeConfidence && interpretation.confidence.note) {
    lines.push(`Data note: ${interpretation.confidence.note}`);
  }

  if (lines.length) return lines.slice(0, 4);

  return rankedSignals
    .filter((s) => s.score >= 0.15)
    .slice(0, 4)
    .map((s) => s.summary);
}

type PressureKey = PressureInterpretation["main_pressure"]["key"];

function parseEvidenceNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mainPressureLabel(key: PressureKey): string {
  switch (key) {
    case "structural":
      return "structural pressure";
    case "discretionary":
      return "discretionary pressure";
    case "timing":
      return "timing pressure";
    case "stability":
      return "stability pressure";
    default:
      return "pressure";
  }
}

function recurringCommitmentFact(snapshot: FinancialSnapshot): string | null {
  const income = snapshot.income.recurringMonthlyCents;
  const commitments = snapshot.commitments.recurringMonthlyCents;
  if (income > 0 && commitments > 0) {
    const pct = Math.round((commitments / income) * 100);
    return `${pct}% of recurring income is already committed (${formatMoney(commitments)} of ${formatMoney(income)} per month)`;
  }
  if (commitments > 0) {
    return `recurring commitments are about ${formatMoney(commitments)} per month while recurring income is still partly mapped`;
  }
  return null;
}

function discretionaryDriftFact(snapshot: FinancialSnapshot): string | null {
  const evidence = snapshot.pressure.discretionary_drift.evidence ?? {};
  const recent = parseEvidenceNumber(evidence.recent_outflow_cents);
  const prior = parseEvidenceNumber(evidence.prior_outflow_cents);
  if (recent === null || prior === null) return null;
  if (recent <= 0 && prior <= 0) return null;
  if (prior <= 0) return `recent flexible spending is ${formatMoney(recent)} in the last 30 days`;

  const delta = recent - prior;
  const pct = Math.round((Math.abs(delta) / Math.max(prior, 1)) * 100);
  if (delta >= 10000) {
    return `flexible spending is up about ${pct}% versus the prior 30 days (${formatMoney(recent)} vs ${formatMoney(prior)})`;
  }
  if (delta <= -10000) {
    return `flexible spending is down about ${pct}% versus the prior 30 days (${formatMoney(recent)} vs ${formatMoney(prior)})`;
  }
  return null;
}

function timingMismatchFact(snapshot: FinancialSnapshot): string | null {
  const evidence = snapshot.pressure.timing_mismatch.evidence ?? {};
  const obligations = parseEvidenceNumber(evidence.obligations_before_income_cents);
  const available = parseEvidenceNumber(evidence.available_cash_cents);
  const shortfall = parseEvidenceNumber(evidence.shortfall_cents);
  if (obligations === null || available === null || obligations <= 0) return null;

  if (shortfall !== null && shortfall > 0) {
    return `${formatMoney(obligations)} in bills land before the next income against ${formatMoney(available)} available cash, leaving about ${formatMoney(shortfall)} short`;
  }
  return `${formatMoney(obligations)} in bills land before the next income and are currently being covered by about ${formatMoney(available)} available cash`;
}

function stabilityFact(snapshot: FinancialSnapshot): string | null {
  if (snapshot.connections.total <= 0) return "no connected sources are active yet, so this read has lower confidence";
  if (snapshot.connections.stale > 0) {
    return `${snapshot.connections.stale} of ${snapshot.connections.total} connected sources may be stale`;
  }
  if (snapshot.income.sourceCount <= 0 && snapshot.commitments.billCount > 0) {
    return "recurring bills are visible but recurring income sources are still sparse";
  }
  return null;
}

function strongestCausalFacts(params: {
  snapshot: FinancialSnapshot;
  interpretation: PressureInterpretation;
}): string[] {
  const { snapshot, interpretation } = params;
  const byKey: Record<Exclude<PressureKey, "none">, string | null> = {
    structural: recurringCommitmentFact(snapshot),
    discretionary: discretionaryDriftFact(snapshot),
    timing: timingMismatchFact(snapshot),
    stability: stabilityFact(snapshot),
  };

  const ranked = [
    { key: "structural", score: snapshot.pressure.structural_pressure.score },
    { key: "discretionary", score: snapshot.pressure.discretionary_drift.score },
    { key: "timing", score: snapshot.pressure.timing_mismatch.score },
    { key: "stability", score: snapshot.pressure.stability_risk.score },
  ].sort((a, b) => b.score - a.score) as Array<{
    key: Exclude<PressureKey, "none">;
    score: number;
  }>;

  const orderedKeys: Array<Exclude<PressureKey, "none">> = [];
  if (interpretation.main_pressure.key !== "none") {
    orderedKeys.push(interpretation.main_pressure.key as Exclude<PressureKey, "none">);
  }
  for (const item of ranked) {
    if (!orderedKeys.includes(item.key)) orderedKeys.push(item.key);
  }

  const out: string[] = [];
  for (const key of orderedKeys) {
    const text = byKey[key];
    if (!text) continue;
    if (out.some((line) => line.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length >= 3) break;
  }
  return out;
}

function buildCausalNarrative(params: {
  mode: "snapshot" | "diagnosis";
  snapshot: FinancialSnapshot;
  interpretation: PressureInterpretation;
  fallbackSummary: string;
}): { headline: string; summary: string } {
  const { mode, snapshot, interpretation, fallbackSummary } = params;
  const facts = strongestCausalFacts({ snapshot, interpretation });
  const key = interpretation.main_pressure.key;
  const factPair = facts.slice(0, 2);
  const whyFromFacts =
    factPair.length === 0
      ? ""
      : factPair.length === 1
        ? factPair[0]
        : `${factPair[0]}. ${factPair[1]}.`;

  const headline =
    key === "none"
      ? "Your household money picture looks mostly steady."
      : mode === "diagnosis"
        ? `${mainPressureLabel(key)[0].toUpperCase()}${mainPressureLabel(key).slice(1)} looks like the main driver.`
        : {
            structural: "Regular commitments are setting the tone.",
            discretionary: "Recent spending drift is shaping the picture.",
            timing: "Cash-flow timing is shaping the picture.",
            stability: "Data and income stability are shaping the picture.",
          }[key];

  const happening =
    key === "none"
      ? "No single pressure point is standing out."
      : mode === "diagnosis"
        ? `Most of the strain is coming from ${mainPressureLabel(key)}.`
        : `${mainPressureLabel(key)[0].toUpperCase()}${mainPressureLabel(key).slice(1)} is leading the picture.`;

  const why =
    whyFromFacts
      ? mode === "diagnosis"
        ? `That shows up clearly in the numbers: ${whyFromFacts}`
        : `The numbers behind that are clear: ${whyFromFacts}`
      : interpretation.main_pressure.why_now || fallbackSummary;

  const impact =
    key === "none"
      ? "Day-to-day pressure can still appear, but it is coming from smaller factors rather than one major issue."
      : key === "timing"
        ? "It can make parts of the month feel tighter, even when the broader picture is still manageable."
        : key === "stability"
          ? "This read is still useful, and confidence should improve as fresh data comes in."
          : "It usually means there is less breathing room, so money can feel tighter day to day.";

  return {
    headline,
    summary: joinNonEmptyWithSpace([happening, why, impact]),
  };
}

async function readCookie(name: string) {
  // Next.js cookies() is async
  const jar = await cookies();
  return jar.get(name)?.value?.trim() || null;
}

async function resolveActiveHouseholdId(
  supabase: RouteSupabase,
  userId: string
): Promise<string | null> {
  // cookie-first (must be a valid membership)
  const preferred = await readCookie(COOKIE_NAME);

  if (preferred) {
    const { data: okRows, error: okErr } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .eq("household_id", preferred)
      .limit(1);

    if (!okErr && okRows?.length) return preferred;
  }

  // fallback to earliest membership
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

async function ensureHouseholdMember(
  supabase: RouteSupabase,
  userId: string,
  householdId: string
) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.household_id) throw new Error("Not a member of this household.");
  return { role: (data.role as string | null) ?? null };
}

export async function POST(req: Request) {
  try {
    // Create supabase client using your canonical helper
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AskBody;
    const q = safeStr(body.q).trim();
    const limit = clampInt(body.limit, 3, 30, 10);

    const householdId = await resolveActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { role } = await ensureHouseholdMember(supabase, user.id, householdId);
    const familyContext = await readHouseholdFamilyContext(supabase, householdId);

    const lowerQ = q.toLowerCase();
    const parseQ = normalizeQuestionForParsing(q);
    const {
      looksOrientation,
      looksDiagnosis,
      looksPlanning,
      looksAffordability,
      looksScenario,
    } = detectMoneyAskIntent(q);

    const hasExplicitModeMatch =
      looksOrientation ||
      looksDiagnosis ||
      looksPlanning ||
      looksAffordability ||
      looksScenario;

    const reasoningFallbackMode = !hasExplicitModeMatch ? detectReasoningFallbackMode(q) : null;

    if (looksDataLayersQuestion(lowerQ)) {
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, {
        householdId,
      });
      const { truth, snapshot } = money;
      const wording = sourceWording(truth.external_connections);
      const outflows = deriveTransactionOutflowSummary({
        monthTransactions: truth.month_transactions,
        rollingTransactions: truth.rolling_transactions,
        connections: truth.external_connections,
        nowIso: truth.as_of_iso,
      });
      const confirmations = truth.transaction_pattern_confirmations ?? [];
      const detectedPatterns = new Map(
        [...outflows.likely_regular_outflows, ...outflows.likely_income].map((pattern) => [
          pattern.pattern_key,
          pattern,
        ])
      );
      const outgoingBuckets = confirmations.reduce(
        (counts, confirmation) => {
          if (confirmation.kind === "income") return counts;
          const label =
            safeStr(confirmation.label) ||
            detectedPatterns.get(confirmation.pattern_key)?.label ||
            "Money pattern";
          const bucket = classifyOutgoingPattern({
            kind: confirmation.kind,
            label,
            cadence: confirmation.cadence,
          });
          counts[bucket] += 1;
          return counts;
        },
        { commitment: 0, spending: 0, transfer: 0, ignored: 0 }
      );
      const confirmedIncome = confirmations.filter((confirmation) => confirmation.kind === "income");
      const formalBills = (truth.recurring_bills ?? []).filter((bill) => bill.active !== false);
      const formalIncome = (truth.recurring_income ?? []).filter((income) => income.active !== false);

      return NextResponse.json({
        ok: true,
        mode: "data_layers",
        household_id: householdId,
        data_layers: {
          headline: "Life CFO keeps three types of money data separate.",
          summary: `${wording.source} is current for this household.`,
          observed: [
            `Seen in accounts and transactions: ${truth.accounts.length} account${truth.accounts.length === 1 ? "" : "s"} and ${truth.rolling_transactions.length} recent transaction${truth.rolling_transactions.length === 1 ? "" : "s"}.`,
            `Cash buffer: ${formatMoney(snapshot.liquidity.availableCashCents)}.`,
          ],
          confirmed: [
            `User-reviewed: ${outgoingBuckets.commitment} regular payment${outgoingBuckets.commitment === 1 ? "" : "s"}, ${outgoingBuckets.spending} regular spending pattern${outgoingBuckets.spending === 1 ? "" : "s"}, and ${confirmedIncome.length} income pattern${confirmedIncome.length === 1 ? "" : "s"}.`,
            `${outgoingBuckets.ignored} pattern${outgoingBuckets.ignored === 1 ? "" : "s"} ignored${outgoingBuckets.transfer ? ` and ${outgoingBuckets.transfer} marked as a transfer or savings movement` : ""}.`,
          ],
          formal: [
            `Set up in Life CFO: ${formalBills.length} recurring bill${formalBills.length === 1 ? "" : "s"} and ${formalIncome.length} income source${formalIncome.length === 1 ? "" : "s"}.`,
          ],
        },
      });
    }

    const directMonthlyQuestion =
      looksThisMonthQuestion(lowerQ) && !looksTightnessQuestion(lowerQ);
    const directCommitmentsQuestion =
      (looksCommitmentsQuestion(lowerQ) || looksIncomeQuestion(lowerQ)) &&
      !looksDiagnosis &&
      !looksPlanning &&
      !looksAffordability &&
      !looksScenario &&
      reasoningFallbackMode !== "diagnosis";

    if (directCommitmentsQuestion || directMonthlyQuestion) {
      const focus = looksRegularPaymentsQuestion(lowerQ)
        ? "regular"
        : looksCommitmentsQuestion(lowerQ)
          ? "bills"
        : looksIncomeQuestion(lowerQ)
          ? "income"
          : "month";
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, {
        householdId,
      });
      const { truth, snapshot } = money;
      const wording = sourceWording(truth.external_connections);
      const observedDataLabel = wording.data;
      const mappedBills = (truth.recurring_bills ?? []).filter((bill) => bill.active !== false);
      const mappedIncome = (truth.recurring_income ?? []).filter((income) => income.active !== false);
      const outflows = deriveTransactionOutflowSummary({
        monthTransactions: truth.month_transactions,
        rollingTransactions: truth.rolling_transactions,
        connections: truth.external_connections,
        nowIso: truth.as_of_iso,
      });
      const confirmations = truth.transaction_pattern_confirmations ?? [];
      const confirmationsByPatternKey = new Map(
        confirmations.map((confirmation) => [confirmation.pattern_key, confirmation])
      );
      const ignoredPatternKeys = new Set(
        confirmations
          .filter((confirmation) => confirmation.kind === "ignore")
          .map((confirmation) => confirmation.pattern_key)
      );
      const detectedPatternsByKey = new Map(
        [...outflows.likely_regular_outflows, ...outflows.likely_income].map((pattern) => [
          pattern.pattern_key,
          pattern,
        ])
      );
      const categoryByPatternKey = outgoingCategoriesByPatternKey(
        truth.rolling_transactions
      );
      const confirmedIncome = confirmations.filter(
        (confirmation) => confirmation.kind === "income"
      );
      const hasIgnoredTransfer = confirmations.some((confirmation) => {
        if (confirmation.kind !== "ignore") return false;
        const detectedLabel = detectedPatternsByKey.get(confirmation.pattern_key)?.label;
        const label = safeStr(confirmation.label || detectedLabel);
        return looksTransferLabel(label) || /\btransfer\b/i.test(confirmation.pattern_key);
      });
      const confirmedCommitmentLines: string[] = [];
      const regularSpendingLines: string[] = [];
      const transferLines: string[] = [];

      for (const confirmation of confirmations) {
        if (confirmation.kind === "income") continue;
        const detected = detectedPatternsByKey.get(confirmation.pattern_key);
        const label = safeStr(confirmation.label || detected?.label) || "Regular payment";
        const bucket = classifyOutgoingPattern({
          kind: confirmation.kind,
          label,
          category: categoryByPatternKey.get(confirmation.pattern_key),
          cadence: confirmation.cadence,
        });
        if (bucket === "ignored") continue;
        if (
          bucket === "transfer" &&
          hasIgnoredTransfer &&
          confirmation.kind !== "transfer"
        ) {
          continue;
        }
        const line = patternLine({
          label,
          amountCents: confirmation.amount_cents,
          currency: confirmation.currency,
          cadence: confirmation.cadence,
        });
        if (bucket === "commitment") confirmedCommitmentLines.push(line);
        if (bucket === "spending") regularSpendingLines.push(line);
        if (bucket === "transfer") transferLines.push(line);
      }
      const confirmedIncomeLines = confirmedIncome.slice(0, 6).map((confirmation) => {
        const label =
          safeStr(confirmation.label) ||
          detectedPatternsByKey.get(confirmation.pattern_key)?.label ||
          "Income pattern";
        return patternLine({
          label,
          amountCents: confirmation.amount_cents,
          currency: confirmation.currency,
          cadence: confirmation.cadence,
        });
      });
      const mappedLines = mappedBills.slice(0, 4).map((bill) => {
        const label = safeStr(bill.name) || "Bill";
        return `${label}: ${formatMoney(bill.amount_cents, bill.currency || "AUD")} (${bill.cadence || "monthly"}).`;
      });
      const mappedIncomeLines = mappedIncome.slice(0, 4).map((income) => {
        const label = safeStr(income.name) || "Income you have set up";
        return `${label}: ${formatMoney(income.amount_cents, income.currency || "AUD")} (${income.cadence || "monthly"}).`;
      });
      const monthInflowLines = outflows.month_inflow_by_currency.map(
        (row) => `${formatMoney(row.cents, row.currency)} has come in so far this month.`
      );
      const monthOutflowLines = outflows.month_outflow_by_currency.map(
        (row) => `${formatMoney(row.cents, row.currency)} has gone out so far this month.`
      );
      const largestLines = outflows.largest_outflows
        .filter(
          (item) =>
            !item.uncertain_label &&
            !looksTransferLabel(item.label) &&
            !ignoredPatternKeys.has(outflowPatternKey(item.currency, item.label))
        )
        .slice(0, 3)
        .map((item) => `${item.label}: ${formatMoney(item.cents, item.currency)}.`);
      const largestUnlabelledLines = outflows.largest_outflows
        .filter((item) => item.uncertain_label)
        .slice(0, 3)
        .map((item) => formatMoney(item.cents, item.currency));
      const possibleCommitmentLines: string[] = [];
      for (const item of outflows.likely_regular_outflows) {
        if (
          confirmationsByPatternKey.has(item.pattern_key) ||
          item.uncertain_label ||
          item.confidence !== "likely"
        ) {
          continue;
        }
        const bucket = classifyOutgoingPattern({
          label: item.label,
          category: categoryByPatternKey.get(item.pattern_key),
          cadence: item.cadence,
        });
        if (bucket === "transfer" && hasIgnoredTransfer) continue;
        const line = patternLine({
          label: item.label,
          amountCents: item.average_cents,
          currency: item.currency,
          cadence: item.cadence,
          occurrences: item.occurrences,
        });
        if (bucket === "commitment") possibleCommitmentLines.push(line);
        if (bucket === "spending") regularSpendingLines.push(line);
        if (bucket === "transfer") transferLines.push(line);
      }
      const likelyIncomeLines = outflows.likely_income
        .filter(
          (item) =>
            !confirmationsByPatternKey.has(item.pattern_key) &&
            !item.uncertain_label &&
            !looksTransferLabel(item.label) &&
            item.confidence === "likely"
        )
        .slice(0, 3)
        .map((item) =>
        `${item.label}: ${item.occurrences} recent ${item.cadence} amounts of money in, about ${formatMoney(
          item.average_cents,
          item.currency
        )} each.`
      );
      const hasUnreviewedUnclearPayments = outflows.likely_regular_outflows.some(
        (item) => item.uncertain_label && !confirmationsByPatternKey.has(item.pattern_key)
      );
      const formallyMapped = mappedBills.length > 0;
      const incomeMapped = mappedIncome.length > 0;
      const monthlyPosition = buildMonthlyPositionLines(
        outflows.month_inflow_by_currency,
        outflows.month_outflow_by_currency
      );
      const primaryMonthCurrency =
        outflows.month_inflow_by_currency[0]?.currency ||
        outflows.month_outflow_by_currency[0]?.currency ||
        "AUD";
      const primaryMonthIn =
        outflows.month_inflow_by_currency.find(
          (row) => row.currency === primaryMonthCurrency
        )?.cents ?? 0;
      const primaryMonthOut =
        outflows.month_outflow_by_currency.find(
          (row) => row.currency === primaryMonthCurrency
        )?.cents ?? 0;
      const primaryMonthDifference = primaryMonthIn - primaryMonthOut;
      const summary = focus === "income"
        ? confirmedIncome.length > 0
          ? `Life CFO found ${confirmedIncome.length} confirmed income pattern${confirmedIncome.length === 1 ? "" : "s"}.`
          : incomeMapped
          ? "Money in and income set up in Life CFO are shown separately."
          : outflows.inflow_transaction_count > 0
            ? `This is the money in seen in ${observedDataLabel} this month.`
            : "No money in is visible for this month yet."
        : focus === "regular"
          ? confirmedCommitmentLines.length > 0 || regularSpendingLines.length > 0
            ? `Life CFO found ${confirmedCommitmentLines.length} regular payment${confirmedCommitmentLines.length === 1 ? "" : "s"} and ${regularSpendingLines.length} regular spending pattern${regularSpendingLines.length === 1 ? "" : "s"}.`
            : formallyMapped
            ? "Life CFO found regular payments that are formally set up."
            : possibleCommitmentLines.length > 0
              ? `${observedDataLabel} shows possible regular payments that are not confirmed yet.`
              : "No clear regular payments or spending patterns are visible yet."
          : focus === "bills"
          ? confirmedCommitmentLines.length > 0
            ? `Life CFO found ${confirmedCommitmentLines.length} confirmed ${confirmedCommitmentLines.length === 1 ? "bill" : "bills"}.`
            : formallyMapped
            ? "Bills set up in Life CFO are shown separately from money out."
            : outflows.transaction_count > 0
              ? `No bills are set up yet. Money out is still visible in ${observedDataLabel}.`
              : "No bills or money out are visible yet."
          : `Based on ${wording.transactions}.`;
      const caveat =
        focus === "month"
          ? "Formal bills and income are still separate from transaction activity."
          : focus === "regular"
            ? "These are confirmed or seen repeatedly in transactions. Bills set up in Life CFO stay separate."
          : focus === "bills"
            ? confirmedCommitmentLines.length > 0
              ? null
              : `Bills have not been confirmed yet, so this is a first look from your ${observedDataLabel}.`
            : confirmedIncome.length > 0
              ? null
              : "Income has not been confirmed yet, so this is a first look rather than a final income summary.";

      return NextResponse.json({
        ok: true,
        mode: "commitments",
        household_id: householdId,
        commitments: {
          focus,
          headline:
            focus === "income"
              ? "Money in this month"
              : focus === "regular"
                ? "Regular payments and spending"
              : focus === "bills"
                ? "Bills this month"
                : primaryMonthDifference >= 0
                  ? "This month is ahead so far."
                  : "This month is tighter so far.",
          summary,
          confirmed: focus === "bills" || focus === "regular" ? confirmedCommitmentLines.slice(0, 6) : [],
          confirmed_income: focus === "income" ? confirmedIncomeLines : [],
          regular_spending: focus === "regular" ? regularSpendingLines.slice(0, 6) : [],
          transfers: focus === "regular" ? transferLines.slice(0, 4) : [],
          possible_commitments:
            focus === "bills" || focus === "regular"
              ? possibleCommitmentLines.slice(0, 4)
              : [],
          mapped: focus === "income" ? [] : mappedLines,
          mapped_income: focus === "bills" || focus === "regular" ? [] : mappedIncomeLines,
          current_month: focus === "income" || focus === "regular" ? [] : monthOutflowLines,
          current_month_income: focus === "bills" || focus === "regular" ? [] : monthInflowLines,
          largest_outflows: focus === "bills" ? largestLines : [],
          largest_unlabelled_outflows: focus === "bills" ? largestUnlabelledLines : [],
          likely_regular: focus === "bills" ? possibleCommitmentLines.slice(0, 4) : [],
          likely_income: focus === "income" ? likelyIncomeLines : [],
          monthly_position: focus === "month" ? monthlyPosition : [],
          available_cash:
            focus === "month"
              ? `Cash buffer: ${formatMoney(snapshot.liquidity.availableCashCents)}.`
              : null,
          source_note: null,
          label_note:
            (focus === "bills" || focus === "regular") && hasUnreviewedUnclearPayments
              ? focus === "bills"
                ? "The bank labels are unclear, so Life CFO cannot reliably name these as bills yet."
                : "The bank labels are too unclear for Life CFO to reliably name the payments yet."
              : null,
          caveat,
        },
      });
    }

    // Orientation path: empty query or simple keyword match
    if (looksOrientation || reasoningFallbackMode === "snapshot") {
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, { householdId });
      const { snapshot, explanation, interpretation } = money;
      const snapshotNarrative = buildCausalNarrative({
        mode: "snapshot",
        snapshot,
        interpretation,
        fallbackSummary: explanation.summary,
      });
      const familyContextFragment = buildFamilyContextFragment({
        mode: "snapshot",
        lowerQ,
        familyContext,
      });
      const familyNarrativeTail = familyContextFragment
        ? `${familyContextFragment}, that context can shape how tight things feel month to month.`
        : null;

      return NextResponse.json({
        ok: true,
        mode: "snapshot",
        household_id: householdId,
        snapshot,
        explanation: {
          ...explanation,
          headline: snapshotNarrative.headline,
          summary: joinNonEmptyWithSpace([snapshotNarrative.summary, familyNarrativeTail]),
        },
        interpretation,
      });
    }

    if (looksDiagnosis || reasoningFallbackMode === "diagnosis") {
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, { householdId });
      const { truth, snapshot, explanation, interpretation } = money;

      const signals = snapshot.pressure;

      const rankedSignals: Array<{ name: string; summary: string; score: number }> = [
        { name: "structural", summary: signals.structural_pressure.summary, score: signals.structural_pressure.score },
        { name: "discretionary", summary: signals.discretionary_drift.summary, score: signals.discretionary_drift.score },
        { name: "timing", summary: signals.timing_mismatch.summary, score: signals.timing_mismatch.score },
        { name: "stability", summary: signals.stability_risk.summary, score: signals.stability_risk.score },
      ].sort((a, b) => b.score - a.score);

      const drivers = buildDiagnosisDrivers(rankedSignals, interpretation);
      const comparisonRequested =
        isRecentChangeQuestion(lowerQ) || looksTightnessQuestion(lowerQ);
      const recentChangeLines = comparisonRequested
        ? buildRecentChangeDiagnosisLines({
            nowIso: truth.windows?.now_iso || truth.as_of_iso,
            rollingTransactions: (truth.rolling_transactions ?? []) as ChangeTx[],
          })
        : [];
      const outflows = deriveTransactionOutflowSummary({
        monthTransactions: truth.month_transactions,
        rollingTransactions: truth.rolling_transactions,
        connections: truth.external_connections,
        nowIso: truth.as_of_iso,
      });
      const monthlyLines = buildMonthlyPositionLines(
        outflows.month_inflow_by_currency,
        outflows.month_outflow_by_currency
      );
      const cashLine = `Available cash is ${formatMoney(snapshot.liquidity.availableCashCents)} across ${snapshot.liquidity.accountCount} account${snapshot.liquidity.accountCount === 1 ? "" : "s"}.`;
      const spendingComparison = recentChangeLines[0] || "";
      const incomeLooksLower = recentChangeLines.some((line) =>
        line.startsWith("Income-like money in was")
      );
      const spendingLooksLower = spendingComparison.includes(" less than ");
      const spendingLooksHigher = spendingComparison.includes(" more than ");
      const comparisonHeadline = incomeLooksLower && spendingLooksLower
        ? "It may feel tighter because money in is lower, even though spending is down."
        : incomeLooksLower
          ? "It may feel tighter because money in is lower than the prior 30 days."
          : spendingLooksHigher
            ? "It may feel tighter because money out increased."
            : spendingLooksLower
              ? "It does not look tighter from spending alone."
              : "Recent spending is broadly similar to the prior 30 days.";
      const diagnosisDrivers = comparisonRequested
        ? [...recentChangeLines.slice(1), ...monthlyLines.slice(0, 1), cashLine, ...drivers].slice(0, 5)
        : drivers;

      const diagnosisNarrative = buildCausalNarrative({
        mode: "diagnosis",
        snapshot,
        interpretation,
        fallbackSummary: explanation.summary,
      });
      const familyContextFragment = buildFamilyContextFragment({
        mode: "diagnosis",
        lowerQ,
        familyContext,
      });
      const familyNarrativeTail = familyContextFragment
        ? `${familyContextFragment}, that context can affect how quickly pressure shows up day to day.`
        : null;

      const diagnosis = {
        headline: comparisonRequested
          ? comparisonHeadline
          : diagnosisNarrative.headline,
        summary: comparisonRequested
          ? `${spendingComparison || "There is not enough prior activity for a clean 30-day comparison yet."} Based on current ${sourceWording(truth.external_connections).transactions}.`
          : joinNonEmptyWithSpace([diagnosisNarrative.summary, familyNarrativeTail]),
        drivers: comparisonRequested ? diagnosisDrivers.slice(0, 3) : diagnosisDrivers,
        concise: comparisonRequested,
        follow_up: comparisonRequested ? "Which payments changed the most?" : null,
        signals: {
          structural: signals.structural_pressure.summary,
          discretionary: signals.discretionary_drift.summary,
          timing: signals.timing_mismatch.summary,
          stability: signals.stability_risk.summary,
        },
      };
      const candidates = extractMoneyAskCandidates({
        userId: user.id,
        householdId,
        question: q,
        mode: "diagnosis",
        headline: diagnosis.headline,
        summary: diagnosis.summary,
        drivers: diagnosis.drivers,
      });

      return NextResponse.json({
        ok: true,
        mode: "diagnosis",
        household_id: householdId,
        diagnosis,
        interpretation,
        candidates,
      });
    }

    if (looksAffordability) {
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, { householdId });
      const { snapshot, explanation, interpretation } = money;
      const recurringAmountCents = extractRecurringAmountCents(parseQ);
      const oneOffAmountCents =
        recurringAmountCents === null ? extractCurrencyAmountCents(parseQ) : null;
      const parsingAmbiguous = isParsingAmbiguous(parseQ);

      const familyContextFragment = buildFamilyContextFragment({
        mode: "affordability",
        lowerQ,
        familyContext,
      });
      const currentPressureSignal = joinNonEmptyWithSpace([
        `Current pressure: ${explanation.pressure.structural}`,
        familyContextFragment
          ? `${familyContextFragment}, affordability is usually more sensitive to day-to-day cash flow.`
          : null,
      ]);

      const signals: string[] = [
        `Available cash is ${formatMoney(snapshot.liquidity.availableCashCents)}.`,
        `Recurring commitments are about ${formatMoney(
          snapshot.commitments.recurringMonthlyCents
        )} per month across ${snapshot.commitments.billCount} tracked bill(s).`,
        currentPressureSignal,
      ];
      if (explanation.pressure.timing) {
        signals.push(`Timing context: ${explanation.pressure.timing}`);
      }
      const parsedAffordabilityLine = buildAffordabilityParsedLine({
        snapshot,
        oneOffAmountCents,
        recurringAmountCents,
        ambiguous: parsingAmbiguous,
      });
      if (parsedAffordabilityLine) {
        signals.push(parsedAffordabilityLine);
      }
      const missingCostDetail = !hasExplicitCostDetail(lowerQ);
      const missingPurchaseContext = !hasConcretePurchaseContext(lowerQ);
      const caveatNeeded = missingCostDetail || missingPurchaseContext;

      const summary = joinNonEmptyWithSpace([
        explanation.summary,
        "This gives a grounded affordability baseline from your current household position before exact amount and timing details are added.",
      ]);

      const caveat = caveatNeeded
        ? "The question is still broad, so this is a baseline rather than a precise affordability call. Amount and payment timing would sharpen it."
        : parsingAmbiguous
          ? "There is an amount in the question, but it is not clear whether it is one-off or monthly, so this remains a cautious baseline."
        : snapshot.connections.stale > 0
          ? `${snapshot.connections.stale} of ${snapshot.connections.total} connections are stale, so affordability confidence may be lower.`
          : undefined;
      const affordability = {
        headline: "Here is your current affordability baseline.",
        summary,
        signals: signals.slice(0, 4),
        caveat,
      };
      const candidates = extractMoneyAskCandidates({
        userId: user.id,
        householdId,
        question: q,
        mode: "affordability",
        headline: affordability.headline,
        summary: affordability.summary,
        signals: affordability.signals,
        caveat: affordability.caveat,
      });

      return NextResponse.json({
        ok: true,
        mode: "affordability",
        household_id: householdId,
        interpretation,
        affordability,
        candidates,
      });
    }

    if (looksPlanning) {
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, { householdId });
      const { truth, snapshot, explanation, interpretation } = money;

      const nowMs = toMs(truth.windows?.now_iso) ?? toMs(truth.as_of_iso) ?? Date.now();
      const next30Ms =
        toMs(truth.windows?.next30_iso) ?? nowMs + 30 * 24 * 60 * 60 * 1000;

      const dueSoon = (truth.recurring_bills ?? [])
        .map((bill) => ({
          bill,
          dueMs: toMs(bill.next_due_at),
        }))
        .filter(
          ({ bill, dueMs }) =>
            bill.active !== false &&
            dueMs !== null &&
            dueMs >= nowMs &&
            dueMs <= next30Ms
        )
        .sort((a, b) => (a.dueMs as number) - (b.dueMs as number));

      const upcoming: string[] = [];
      upcoming.push(
        dueSoon.length > 0
          ? `${dueSoon.length} recurring bill(s) are due in the next 30 days.`
          : "No recurring bills are due in the next 30 days from the tracked set."
      );
      if (snapshot.commitments.billCount > 0) {
        upcoming.push(
          `Recurring commitments are about ${formatMoney(
            snapshot.commitments.recurringMonthlyCents
          )} per month.`
        );
      }
      dueSoon.slice(0, 2).forEach(({ bill }) => {
        upcoming.push(
          `${bill.name || "A bill"} is due around ${softDate(bill.next_due_at)} (${formatMoney(
            bill.amount_cents,
            bill.currency || "AUD"
          )}).`
        );
      });

      const notes: string[] = [];
      if (explanation.pressure.timing) notes.push(explanation.pressure.timing);
      if (explanation.pressure.structural) notes.push(explanation.pressure.structural);
      if (snapshot.connections.stale > 0) {
        notes.push(
          `${snapshot.connections.stale} of ${snapshot.connections.total} connections are stale, so near-term timing may be incomplete.`
        );
      }

      const headline = dueSoon.length
        ? "Here is your near-term household money timeline."
        : "Here is your near-term household money picture.";

      const summary = joinNonEmptyWithSpace([
        snapshot.commitments.billCount > 0
          ? `${snapshot.commitments.billCount} recurring commitment(s) are currently tracked.`
          : "No recurring commitments are currently tracked.",
        "This combines upcoming timing with the money currently visible.",
      ]);
      const planning = {
        headline,
        summary,
        upcoming: upcoming.slice(0, 4),
        notes: notes.slice(0, 3),
      };
      const candidates = extractMoneyAskCandidates({
        userId: user.id,
        householdId,
        question: q,
        mode: "planning",
        headline: planning.headline,
        summary: planning.summary,
        upcoming: planning.upcoming,
      });

      return NextResponse.json({
        ok: true,
        mode: "planning",
        household_id: householdId,
        interpretation,
        planning,
        candidates,
      });
    }

    if (looksScenario) {
      const money = await runHouseholdMoneyReasoning(supabase as unknown as SupabaseClient, { householdId });
      const { truth, snapshot, interpretation } = money;
      const incomeDropPercent = extractIncomeDropPercent(parseQ);
      const incomeDropAmountCents =
        incomeDropPercent === null ? extractIncomeDropAmountCents(parseQ) : null;
      const outflows = deriveTransactionOutflowSummary({
        monthTransactions: truth.month_transactions,
        rollingTransactions: truth.rolling_transactions,
        connections: truth.external_connections,
        nowIso: truth.as_of_iso,
      });
      const inflowByCurrency = new Map(
        outflows.month_inflow_by_currency.map((row) => [row.currency, row.cents])
      );
      const outflowByCurrency = new Map(
        outflows.month_outflow_by_currency.map((row) => [row.currency, row.cents])
      );
      const currencies = Array.from(
        new Set([...inflowByCurrency.keys(), ...outflowByCurrency.keys()])
      );
      const primaryCurrency = currencies[0] || "AUD";
      const currentInflow = inflowByCurrency.get(primaryCurrency) ?? 0;
      const currentOutflow = outflowByCurrency.get(primaryCurrency) ?? 0;
      const currentMovement = currentInflow - currentOutflow;
      const explicitMonthlyCost = /\b(per month|monthly|each month|a month)\b/i.test(parseQ)
        ? extractCurrencyAmountCents(parseQ)
        : null;

      const scenarioDetectedPatterns = new Map(
        [...outflows.likely_regular_outflows, ...outflows.likely_income].map((pattern) => [
          pattern.pattern_key,
          pattern,
        ])
      );
      const scenarioCategories = outgoingCategoriesByPatternKey(
        truth.rolling_transactions
      );
      const scenarioPatternCounts = truth.transaction_pattern_confirmations.reduce(
        (counts, confirmation) => {
          if (confirmation.kind === "income") {
            counts.income += 1;
            return counts;
          }
          const detected = scenarioDetectedPatterns.get(confirmation.pattern_key);
          const bucket = classifyOutgoingPattern({
            kind: confirmation.kind,
            label:
              safeStr(confirmation.label || detected?.label) || "Money pattern",
            category: scenarioCategories.get(confirmation.pattern_key),
            cadence: confirmation.cadence,
          });
          if (bucket === "commitment") counts.commitments += 1;
          if (bucket === "spending") counts.spending += 1;
          if (bucket === "transfer") counts.transfers += 1;
          return counts;
        },
        { commitments: 0, spending: 0, transfers: 0, income: 0 }
      );
      const watch: string[] = [];

      if (explicitMonthlyCost && explicitMonthlyCost > 0) {
        watch.push(
          `${formatMoney(explicitMonthlyCost, primaryCurrency)}/month → about ${formatMoney(currentMovement - explicitMonthlyCost, primaryCurrency)} breathing room.`
        );
      } else {
        watch.push(
          `${formatMoney(50000, primaryCurrency)}/month → about ${formatMoney(currentMovement - 50000, primaryCurrency)} breathing room.`,
          `${formatMoney(100000, primaryCurrency)}/month → about ${formatMoney(currentMovement - 100000, primaryCurrency)} breathing room.`
        );
      }
      const parsedScenarioLine = buildScenarioParsedLine({
        snapshot,
        incomeDropPercent,
        incomeDropAmountCents,
      });
      if (parsedScenarioLine) {
        watch.push(parsedScenarioLine);
      }
      const broadPrompt = !isSpecificScenarioPrompt(lowerQ);
      const caveat = explicitMonthlyCost === null
        ? "To calculate this properly, Life CFO needs the likely monthly cost and start date. This is a scenario estimate, not advice."
        : broadPrompt
          ? "A start date and payment timing would make this more precise. This is a scenario estimate, not advice."
        : snapshot.connections.stale > 0
          ? `${snapshot.connections.stale} of ${snapshot.connections.total} connections are stale, so scenario confidence may be lower.`
          : "This is a scenario estimate, not advice.";

      const scenarioSubject = /\bprivate school\b/i.test(lowerQ)
        ? "Private school"
        : /\bchildcare|daycare\b/i.test(lowerQ)
          ? "Higher childcare costs"
          : /\bmortgage\b/i.test(lowerQ)
            ? "A mortgage increase"
            : /\bholiday|vacation\b/i.test(lowerQ)
              ? "A holiday"
              : /\bcar\b/i.test(lowerQ)
                ? "A car change"
                : /\brenovation\b/i.test(lowerQ)
                  ? "A renovation"
                  : "This change";
      const summary = `Right now, this household is ${formatMoney(Math.abs(currentMovement), primaryCurrency)} ${currentMovement >= 0 ? "ahead" : "behind"} this month. Based on ${sourceWording(truth.external_connections).transactions}.`;
      const scenario = {
        headline: `${scenarioSubject} would reduce your monthly breathing room.`,
        summary,
        watch: watch.slice(0, 3),
        caveat,
        pattern_counts: scenarioPatternCounts,
      };
      const candidates = extractMoneyAskCandidates({
        userId: user.id,
        householdId,
        question: q,
        mode: "scenario",
        headline: scenario.headline,
        summary: scenario.summary,
        signals: scenario.watch,
        caveat: scenario.caveat,
      });

      return NextResponse.json({
        ok: true,
        mode: "scenario",
        household_id: householdId,
        interpretation,
        scenario,
        candidates,
      });
    }

    const searchTerm = safeSearchTerm(q);
    const like = `%${searchTerm || "no direct match"}%`;

    // NOTE: keep this as retrieval-only (no "AI answers" here)
    const [accountsRes, billsRes, txRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,provider,type,status,currency,current_balance_cents,updated_at,archived")
        .eq("household_id", householdId)
        .or(`name.ilike.${like},provider.ilike.${like},type.ilike.${like},status.ilike.${like}`)
        .order("updated_at", { ascending: false })
        .limit(limit),

      supabase
        .from("recurring_bills")
        .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,updated_at")
        .eq("household_id", householdId)
        .ilike("name", like)
        .order("next_due_at", { ascending: true })
        .limit(limit),

      supabase
        .from("transactions")
        .select("id,account_id,posted_at,amount_cents,currency,merchant,description,category")
        .eq("household_id", householdId)
        .or(`merchant.ilike.${like},description.ilike.${like},category.ilike.${like}`)
        .order("posted_at", { ascending: false })
        .limit(limit),
    ]);

    const firstErr = accountsRes.error || billsRes.error || txRes.error;
    if (firstErr) {
      return NextResponse.json(
        {
          ok: false,
          error: firstErr.message,
          debug: {
            accounts_ok: !accountsRes.error,
            bills_ok: !billsRes.error,
            transactions_ok: !txRes.error,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "search",
      household_id: householdId,
      role,
      q,
      results: {
        accounts: accountsRes.data ?? [],
        bills: billsRes.data ?? [],
        transactions: txRes.data ?? [],
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error && e.message ? e.message : "Ask failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

