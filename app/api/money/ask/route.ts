// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import type { FinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { PressureInterpretation } from "@/lib/money/reasoning/interpretPressure";
import { runHouseholdMoneyReasoning } from "@/lib/money/reasoning/runHouseholdMoneyReasoning";
import {
  detectMoneyAskIntent,
  detectReasoningFallbackMode,
} from "@/lib/money/reasoning/intentDetection";
import { joinNonEmptyWithSpace } from "@/lib/ask/responseComposition";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";
import { extractMoneyAskCandidates } from "@/lib/memory/candidateExtraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};
type RouteSupabase = Awaited<ReturnType<typeof supabaseRoute>>;

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

type ChangeTx = {
  date?: string | null;
  amount_cents?: number | null;
  pending?: boolean | null;
  category?: string | null;
  description?: string | null;
  merchant?: string | null;
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

  const sumOutflow = (items: ChangeTx[]) =>
    items.reduce((sum, tx) => {
      const cents = txAmountCents(tx);
      return cents < 0 ? sum + Math.abs(cents) : sum;
    }, 0);

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

  const recentOutflow = sumOutflow(recent);
  const priorOutflow = sumOutflow(prior);
  const recentBillOutflow = sumOutflow(recent.filter(isBillLikeTx));
  const priorBillOutflow = sumOutflow(prior.filter(isBillLikeTx));
  const recentIncome = sumIncomeLikeInflow(recent);
  const priorIncome = sumIncomeLikeInflow(prior);

  const lines: Array<{ score: number; text: string }> = [];

  if (priorBillOutflow > 0) {
    const billDelta = recentBillOutflow - priorBillOutflow;
    const billRatio = recentBillOutflow / priorBillOutflow;
    if (billDelta >= 20000 && billRatio >= 1.12) {
      lines.push({
        score: billDelta,
        text: "Bill-related spending looks higher than the prior period, which means there is less breathing room.",
      });
    }
  }

  if (priorOutflow > 0) {
    const spendDelta = recentOutflow - priorOutflow;
    const spendRatio = recentOutflow / priorOutflow;
    if (spendDelta >= 30000 && spendRatio >= 1.12) {
      lines.push({
        score: spendDelta * 0.9,
        text: "Spending has ticked up recently, which means there is less left over.",
      });
    }
  }

  if (priorIncome > 0) {
    const incomeDelta = priorIncome - recentIncome;
    const incomeRatio = recentIncome / priorIncome;
    if (incomeDelta >= 30000 && incomeRatio <= 0.9) {
      lines.push({
        score: incomeDelta,
        text: "Income-like inflows look lower than the prior period, which can make things feel tighter day to day.",
      });
    }
  }

  return lines
    .sort((a, b) => b.score - a.score)
    .map((x) => x.text)
    .slice(0, 2);
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
        ? "This usually means there is less left over each month."
        : main.key === "discretionary"
          ? "This can reduce day-to-day flexibility."
          : main.key === "timing"
            ? "This can make things feel tighter when money out lands before money in."
            : "This can make the picture feel tighter because confidence is lower right now.";
    lines.push(`${main.summary} ${meaning}`);
    if (main.why_now) lines.push(main.why_now);
  } else {
    lines.push(main.summary);
  }

  if (interpretation.secondary_pressure?.summary) {
    lines.push(`A secondary pressure signal is ${interpretation.secondary_pressure.summary}`);
  }

  const includeConfidence =
    interpretation.confidence.freshness !== "fresh" ||
    interpretation.confidence.evidence === "limited";
  if (includeConfidence && interpretation.confidence.note) {
    lines.push(`Grounding note: ${interpretation.confidence.note}`);
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
  if (prior <= 0) return `recent flexible outflow is ${formatMoney(recent)} in the last 30 days`;

  const delta = recent - prior;
  const pct = Math.round((Math.abs(delta) / Math.max(prior, 1)) * 100);
  if (delta >= 10000) {
    return `flexible outflow is up about ${pct}% versus the prior 30 days (${formatMoney(recent)} vs ${formatMoney(prior)})`;
  }
  if (delta <= -10000) {
    return `flexible outflow is down about ${pct}% versus the prior 30 days (${formatMoney(recent)} vs ${formatMoney(prior)})`;
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

  const headline =
    key === "none"
      ? "Your household money picture looks mostly steady right now."
      : mode === "diagnosis"
        ? `${mainPressureLabel(key)[0].toUpperCase()}${mainPressureLabel(key).slice(1)} is the main pressure right now.`
        : {
            structural: "Regular commitments are the main pressure right now.",
            discretionary: "Recent spending drift is the main pressure right now.",
            timing: "Cash-flow timing is the main pressure right now.",
            stability: "Data and income stability are the main pressure right now.",
          }[key];

  const happening =
    key === "none"
      ? "Right now, no single pressure point is dominating."
      : mode === "diagnosis"
        ? `Right now, ${mainPressureLabel(key)} is driving most of the strain.`
        : `Right now, your money picture is being led by ${mainPressureLabel(key)}.`;

  const why =
    facts.length > 0
      ? mode === "diagnosis"
        ? `That is showing up because ${facts.slice(0, 2).join(", and ")}.`
        : `This is mainly because ${facts.slice(0, 2).join(", and ")}.`
      : interpretation.main_pressure.why_now || fallbackSummary;

  const impact =
    key === "none"
      ? "That usually means day-to-day pressure can still appear, but it is coming from smaller factors rather than one major issue."
      : key === "timing"
        ? "That means things can feel tighter at certain points in the month even when the broader picture is still manageable."
        : key === "stability"
          ? "That means this read is useful, but confidence can improve as fresh data comes in."
          : "That usually means there is less breathing room, so money can feel tighter day to day.";

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

    // Orientation path: empty query or simple keyword match
    if (looksOrientation || reasoningFallbackMode === "snapshot") {
      const money = await runHouseholdMoneyReasoning(supabase as any, { householdId });
      const { snapshot, explanation, interpretation } = money;
      const snapshotNarrative = buildCausalNarrative({
        mode: "snapshot",
        snapshot,
        interpretation,
        fallbackSummary: explanation.summary,
      });

      return NextResponse.json({
        ok: true,
        mode: "snapshot",
        household_id: householdId,
        snapshot,
        explanation: {
          ...explanation,
          headline: snapshotNarrative.headline,
          summary: snapshotNarrative.summary,
        },
        interpretation,
      });
    }

    if (looksDiagnosis || reasoningFallbackMode === "diagnosis") {
      const money = await runHouseholdMoneyReasoning(supabase as any, { householdId });
      const { truth, snapshot, explanation, interpretation } = money;

      const signals = snapshot.pressure;

      const rankedSignals: Array<{ name: string; summary: string; score: number }> = [
        { name: "structural", summary: signals.structural_pressure.summary, score: signals.structural_pressure.score },
        { name: "discretionary", summary: signals.discretionary_drift.summary, score: signals.discretionary_drift.score },
        { name: "timing", summary: signals.timing_mismatch.summary, score: signals.timing_mismatch.score },
        { name: "stability", summary: signals.stability_risk.summary, score: signals.stability_risk.score },
      ].sort((a, b) => b.score - a.score);

      const drivers = buildDiagnosisDrivers(rankedSignals, interpretation);
      const recentChangeLines = isRecentChangeQuestion(lowerQ)
        ? buildRecentChangeDiagnosisLines({
            nowIso: truth.windows?.now_iso || truth.as_of_iso,
            rollingTransactions: (truth.rolling_transactions ?? []) as ChangeTx[],
          })
        : [];
      const diagnosisDrivers = recentChangeLines.length
        ? [
            ...drivers.slice(0, Math.max(1, 4 - recentChangeLines.length)),
            ...recentChangeLines,
          ].slice(0, 4)
        : drivers;

      const diagnosisNarrative = buildCausalNarrative({
        mode: "diagnosis",
        snapshot,
        interpretation,
        fallbackSummary: explanation.summary,
      });

      const diagnosis = {
        headline: diagnosisNarrative.headline,
        summary: diagnosisNarrative.summary,
        drivers: diagnosisDrivers,
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
      const money = await runHouseholdMoneyReasoning(supabase as any, { householdId });
      const { snapshot, explanation, interpretation } = money;
      const recurringAmountCents = extractRecurringAmountCents(parseQ);
      const oneOffAmountCents =
        recurringAmountCents === null ? extractCurrencyAmountCents(parseQ) : null;
      const parsingAmbiguous = isParsingAmbiguous(parseQ);

      const signals: string[] = [
        `Available cash is ${formatMoney(snapshot.liquidity.availableCashCents)}.`,
        `Recurring commitments are about ${formatMoney(
          snapshot.commitments.recurringMonthlyCents
        )} per month across ${snapshot.commitments.billCount} tracked bill(s).`,
        `Current pressure: ${explanation.pressure.structural}`,
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
      const money = await runHouseholdMoneyReasoning(supabase as any, { householdId });
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
        "This combines upcoming timing with current pressure signals so you can see where the next few weeks may feel tighter.",
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
      const money = await runHouseholdMoneyReasoning(supabase as any, { householdId });
      const { snapshot, explanation, interpretation } = money;
      const incomeDropPercent = extractIncomeDropPercent(parseQ);
      const incomeDropAmountCents =
        incomeDropPercent === null ? extractIncomeDropAmountCents(parseQ) : null;

      const watch: string[] = [
        `Recurring commitments are about ${formatMoney(
          snapshot.commitments.recurringMonthlyCents
        )} per month across ${snapshot.commitments.billCount} tracked bill(s).`,
        `Available cash is ${formatMoney(snapshot.liquidity.availableCashCents)} across ${
          snapshot.liquidity.accountCount
        } account(s).`,
        `Current pressure: ${explanation.pressure.structural}`,
      ];

      if (explanation.pressure.timing) {
        watch.push(`Timing context: ${explanation.pressure.timing}`);
      } else if (explanation.pressure.stability) {
        watch.push(`Stability context: ${explanation.pressure.stability}`);
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
      const caveat = broadPrompt
        ? "This scenario is still broad, so this is a baseline view. A little more detail on amount and timing would sharpen the picture."
        : snapshot.connections.stale > 0
          ? `${snapshot.connections.stale} of ${snapshot.connections.total} connections are stale, so scenario confidence may be lower.`
          : undefined;

      const summary = joinNonEmptyWithSpace([
        explanation.summary,
        "This is the before-change baseline, so you can see what would shift if that scenario happens.",
      ]);
      const scenario = {
        headline: "Here is the current baseline for that what-if question.",
        summary,
        watch: watch.slice(0, 4),
        caveat,
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

    const like = `%${q}%`;

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

