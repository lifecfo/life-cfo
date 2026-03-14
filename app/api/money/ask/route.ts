// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { explainSnapshot } from "@/lib/money/reasoning/explainSnapshot";
import { PressureInterpretation } from "@/lib/money/reasoning/interpretPressure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};
type RouteSupabase = Awaited<ReturnType<typeof supabaseRoute>>;

const ORIENTATION_KEYWORDS = [
  "are we okay",
  "how are things looking",
  "financial status",
];

const DIAGNOSIS_KEYWORDS = [
  "why does money feel tight",
  "why does money feel",
  "what changed recently",
  "what is the main pressure",
  "main pressure",
  "feel tight",
  "pressure right now",
];

const PLANNING_KEYWORDS = [
  "what should we plan for this month",
  "what should we plan for",
  "plan for this month",
  "what is coming up",
  "what's coming up",
  "what do we need to keep in mind financially",
  "what do we need to keep in mind",
  "keep in mind financially",
];

const AFFORDABILITY_KEYWORDS = [
  "can we afford this",
  "can we afford it",
  "can we afford a house",
  "can we afford",
  "could we manage this payment",
  "could we manage this",
  "would this stretch us too much",
  "would this stretch us",
];

const SCENARIO_KEYWORDS = [
  "what if income drops",
  "what if our income drops",
  "what if income goes down",
  "what if we move",
  "what if we moved",
  "what if we add another bill",
  "what if we add a bill",
  "what if we add another recurring bill",
  "what if we pause saving for a while",
  "what if we pause saving",
  "what if we stop saving for a while",
  "what happens if income drops",
  "what happens if we move",
  "what happens if we add another bill",
  "what happens if we pause saving",
];

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
  const amount = Number.isFinite(n) ? n / 100 : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
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

function hasComingUpPlanningContext(lowerQ: string): boolean {
  if (!lowerQ.includes("coming up")) return false;
  const contextHints = [
    "what",
    "month",
    "financial",
    "money",
    "bill",
    "bills",
    "commitment",
    "plan",
    "keep in mind",
  ];
  return contextHints.some((hint) => lowerQ.includes(hint));
}

function hasScenarioTopicHint(lowerQ: string): boolean {
  const hints = [
    "income",
    "move",
    "moving",
    "bill",
    "bills",
    "saving",
    "savings",
    "payment",
    "rent",
    "mortgage",
    "commitment",
  ];
  return hints.some((hint) => lowerQ.includes(hint));
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

function buildDiagnosisDrivers(
  rankedSignals: Array<{ name: string; summary: string; score: number }>,
  interpretation: PressureInterpretation
): string[] {
  const lines: string[] = [];

  if (interpretation.main_pressure.key !== "none") {
    lines.push(interpretation.main_pressure.summary);
    if (interpretation.main_pressure.why_now) {
      lines.push(interpretation.main_pressure.why_now);
    }
  }

  if (interpretation.secondary_pressure?.summary) {
    lines.push(interpretation.secondary_pressure.summary);
  }

  if (interpretation.confidence.note) {
    lines.push(interpretation.confidence.note);
  }

  if (lines.length) return lines.slice(0, 4);

  return rankedSignals
    .filter((s) => s.score >= 0.15)
    .slice(0, 4)
    .map((s) => s.summary);
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
    const looksOrientation =
      !q ||
      ORIENTATION_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksDiagnosis = q && DIAGNOSIS_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksPlanning =
      q &&
      (PLANNING_KEYWORDS.some((kw) => lowerQ.includes(kw)) ||
        hasComingUpPlanningContext(lowerQ));
    const looksAffordability = q && AFFORDABILITY_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksScenario =
      q &&
      (SCENARIO_KEYWORDS.some((kw) => lowerQ.includes(kw)) ||
        ((lowerQ.includes("what if") || lowerQ.includes("what happens if")) &&
          hasScenarioTopicHint(lowerQ)));

    // Orientation path: empty query or simple keyword match
    if (looksOrientation) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);
      const interpretation = explanation.interpretation;

      return NextResponse.json({
        ok: true,
        mode: "snapshot",
        household_id: householdId,
        snapshot,
        explanation,
        interpretation,
      });
    }

    if (looksDiagnosis) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);
      const interpretation = explanation.interpretation;

      const signals = snapshot.pressure;

      const rankedSignals: Array<{ name: string; summary: string; score: number }> = [
        { name: "structural", summary: signals.structural_pressure.summary, score: signals.structural_pressure.score },
        { name: "discretionary", summary: signals.discretionary_drift.summary, score: signals.discretionary_drift.score },
        { name: "timing", summary: signals.timing_mismatch.summary, score: signals.timing_mismatch.score },
        { name: "stability", summary: signals.stability_risk.summary, score: signals.stability_risk.score },
      ].sort((a, b) => b.score - a.score);

      const drivers = buildDiagnosisDrivers(rankedSignals, interpretation);

      const diagnosis = {
        headline: explanation.headline || "Here is what seems to be creating pressure right now.",
        summary:
          explanation.summary ||
          "This is the current pressure pattern based on your latest household data.",
        drivers,
        signals: {
          structural: signals.structural_pressure.summary,
          discretionary: signals.discretionary_drift.summary,
          timing: signals.timing_mismatch.summary,
          stability: signals.stability_risk.summary,
        },
      };

      return NextResponse.json({
        ok: true,
        mode: "diagnosis",
        household_id: householdId,
        diagnosis,
        interpretation,
      });
    }

    if (looksAffordability) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);
      const interpretation = explanation.interpretation;

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

      const missingCostDetail = !hasExplicitCostDetail(lowerQ);
      const missingPurchaseContext = !hasConcretePurchaseContext(lowerQ);
      const caveatNeeded = missingCostDetail || missingPurchaseContext;

      const summary = [
        "This is a grounded affordability baseline from your current household position.",
        explanation.summary,
      ]
        .filter(Boolean)
        .join(" ");

      const caveat = caveatNeeded
        ? "The question is still broad, so this is a baseline rather than a precise affordability call. Amount and payment timing would sharpen it."
        : snapshot.connections.stale > 0
          ? `${snapshot.connections.stale} of ${snapshot.connections.total} connections are stale, so affordability confidence may be lower.`
          : undefined;

      return NextResponse.json({
        ok: true,
        mode: "affordability",
        household_id: householdId,
        interpretation,
        affordability: {
          headline: "Here is your current affordability baseline.",
          summary,
          signals: signals.slice(0, 4),
          caveat,
        },
      });
    }

    if (looksPlanning) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);
      const interpretation = explanation.interpretation;

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
        ? "Here is what is coming up in your household money."
        : "Here is your near-term money baseline.";

      const summary = [
        snapshot.commitments.billCount > 0
          ? `${snapshot.commitments.billCount} recurring commitment(s) are currently tracked.`
          : "No recurring commitments are currently tracked.",
        explanation.summary,
      ]
        .filter(Boolean)
        .join(" ");

      return NextResponse.json({
        ok: true,
        mode: "planning",
        household_id: householdId,
        interpretation,
        planning: {
          headline,
          summary,
          upcoming: upcoming.slice(0, 4),
          notes: notes.slice(0, 3),
        },
      });
    }

    if (looksScenario) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);
      const interpretation = explanation.interpretation;

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

      const broadPrompt = !isSpecificScenarioPrompt(lowerQ);
      const caveat = broadPrompt
        ? "This scenario is still broad, so this is a baseline view. A little more detail on amount and timing would sharpen the picture."
        : snapshot.connections.stale > 0
          ? `${snapshot.connections.stale} of ${snapshot.connections.total} connections are stale, so scenario confidence may be lower.`
          : undefined;

      const summary = [
        "This is the current baseline before any scenario change is layered in.",
        explanation.summary,
      ]
        .filter(Boolean)
        .join(" ");

      return NextResponse.json({
        ok: true,
        mode: "scenario",
        household_id: householdId,
        interpretation,
        scenario: {
          headline: "Here is the baseline for that what-if question.",
          summary,
          watch: watch.slice(0, 4),
          caveat,
        },
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

