// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { explainSnapshot } from "@/lib/money/reasoning/explainSnapshot";
import { formatMoneyFromCents } from "@/lib/money/formatMoney";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};

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

const AFFORDABILITY_KEYWORDS = [
  "can we afford",
  "could we afford",
  "can i afford",
  "could i afford",
  "can we manage this",
  "could we manage this",
  "can we manage that",
  "would this stretch us",
  "would that stretch us",
  "is this affordable",
  "is that affordable",
];

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// --- Affordability: amount parsing -----------------------------------------

function normalizeForAmountParsing(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .trim();
}

function toCentsFromDollars(raw: string): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

function extractAmountCents(lowerQ: string): number | null {
  const q = normalizeForAmountParsing(lowerQ);

  const dollarPrefixed = q.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  if (dollarPrefixed?.[1]) return toCentsFromDollars(dollarPrefixed[1]);

  const codePrefixed = q.match(/\b(?:aud|usd|cad|eur|gbp|nzd)\s*(\d+(?:\.\d{1,2})?)\b/);
  if (codePrefixed?.[1]) return toCentsFromDollars(codePrefixed[1]);

  const suffixed = q.match(/\b(\d+(?:\.\d{1,2})?)\s*(?:aud|usd|cad|eur|gbp|nzd|dollars?|bucks)\b/);
  if (suffixed?.[1]) return toCentsFromDollars(suffixed[1]);

  return null;
}

function looksRecurringAmount(lowerQ: string): boolean {
  const q = normalizeForAmountParsing(lowerQ);
  return (
    /(per\s*(month|week|fortnight|year)|\/\s*month|monthly|weekly|fortnightly|annually|yearly|every\s*month|a\s*month|a\s*week|a\s*year)/.test(
      q
    ) || /\b(rent|mortgage|subscription|repayment|premium)\b/.test(q)
  );
}

// --- Affordability: verdict tiers -------------------------------------------

type AffordabilityVerdict = "fits_comfortably" | "tight" | "doesnt_fit_now";

function tierForOneOffRatio(ratio: number): AffordabilityVerdict {
  if (ratio <= 0.15) return "fits_comfortably";
  if (ratio <= 0.4) return "tight";
  return "doesnt_fit_now";
}

function tierForRecurringShare(share: number): AffordabilityVerdict {
  if (share >= 0.75) return "doesnt_fit_now";
  if (share >= 0.5) return "tight";
  return "fits_comfortably";
}

// Downgrade is capped at exactly one notch regardless of how many pressure
// signals qualify -- the boolean is OR'd together by the caller first, so
// multiple simultaneous high-pressure signals never compound into a harsher
// verdict than a single one would.
function applyPressureDowngrade(
  tier: AffordabilityVerdict,
  anyHighPressureSignal: boolean
): AffordabilityVerdict {
  if (!anyHighPressureSignal) return tier;
  if (tier === "fits_comfortably") return "tight";
  return "doesnt_fit_now";
}

function headlineForVerdict(verdict: AffordabilityVerdict): string {
  if (verdict === "fits_comfortably") {
    return "This looks like it would fit comfortably within your current position.";
  }
  if (verdict === "tight") {
    return "This would fit, but it would use a meaningful share of your current buffer, so it may feel tight.";
  }
  return "Based on your current position, this doesn't look like it fits comfortably right now.";
}

function pressureCallout(flags: {
  structuralHigh: boolean;
  discretionaryHigh: boolean;
  timingShortfall: boolean;
  stabilityHigh: boolean;
}): string {
  if (flags.timingShortfall) {
    return "Some obligations are due before your next expected income, which adds pressure right now.";
  }
  if (flags.structuralHigh) {
    return "A large share of income is already committed, so day-to-day flexibility is limited.";
  }
  if (flags.discretionaryHigh) {
    return "Flexible spending has been running well above the usual recent pattern.";
  }
  if (flags.stabilityHigh) {
    return "Income or data freshness looks less predictable right now, which adds some caution.";
  }
  return "";
}

async function buildAffordabilityAnswer(
  supabase: any,
  householdId: string,
  lowerQ: string
) {
  const truth = await getHouseholdMoneyTruth(supabase, { householdId });
  const snapshot = buildFinancialSnapshot(truth);
  const pressure = snapshot.pressure;

  const activeCurrencies = new Set(
    (truth.accounts ?? [])
      .filter((a: { archived?: boolean | null }) => a?.archived !== true)
      .map((a: { currency?: string | null }) => String(a?.currency || "AUD").toUpperCase())
  );
  const mixedCurrency = activeCurrencies.size > 1;

  const amountCents = extractAmountCents(lowerQ);

  if (amountCents === null) {
    return {
      verdict: "insufficient_data" as const,
      headline:
        "I don't have enough to give you a clear answer on that yet — here's what I can tell you instead.",
      data_points: [
        `Available cash is ${formatMoneyFromCents(snapshot.liquidity.availableCashCents, "AUD")}${
          mixedCurrency ? " (combines more than one currency, so treat it as approximate)" : ""
        }.`,
        `Current pressure: ${pressure.structural_pressure.summary}`,
      ],
    };
  }

  const structuralHigh = pressure.structural_pressure.level === "high";
  const stabilityHigh = pressure.stability_risk.level === "high";
  const discretionaryHigh = pressure.discretionary_drift.level === "high";
  const timingShortfall = Number(pressure.timing_mismatch.evidence.shortfall_cents ?? 0) > 0;

  if (looksRecurringAmount(lowerQ)) {
    const income = snapshot.income.recurringMonthlyCents;
    if (income <= 0) {
      return {
        verdict: "insufficient_data" as const,
        headline:
          "Recurring income isn't set up yet, so I can't project a new monthly cost against it — here's what I can tell you instead.",
        data_points: [
          `Recurring commitments are currently ${formatMoneyFromCents(
            snapshot.commitments.recurringMonthlyCents,
            "AUD"
          )} per month across ${snapshot.commitments.billCount} tracked bill(s).`,
          `Available cash is ${formatMoneyFromCents(snapshot.liquidity.availableCashCents, "AUD")}${
            mixedCurrency ? " (combines more than one currency)" : ""
          }.`,
        ],
      };
    }

    const newCommitments = snapshot.commitments.recurringMonthlyCents + amountCents;
    const share = newCommitments / income;
    const baseTier = tierForRecurringShare(share);
    // Structural pressure is excluded here: `share` already *is* structural
    // pressure projected forward with the new amount added, so folding
    // structural_pressure.level in too would double-count the same signal.
    const anyHigh = stabilityHigh || discretionaryHigh || timingShortfall;
    const verdict = applyPressureDowngrade(baseTier, anyHigh);

    const dataPoints = [
      `Adding ${formatMoneyFromCents(amountCents, "AUD")} a month would take recurring commitments to about ${formatMoneyFromCents(
        newCommitments,
        "AUD"
      )} per month, around ${Math.round(share * 100)}% of recurring income.`,
      anyHigh
        ? pressureCallout({ structuralHigh: false, discretionaryHigh, timingShortfall, stabilityHigh })
        : `Current pressure: ${pressure.structural_pressure.summary}`,
    ].filter(Boolean);

    return {
      verdict,
      headline: headlineForVerdict(verdict),
      data_points: dataPoints.slice(0, 3),
    };
  }

  // One-off amount.
  const availableCash = snapshot.liquidity.availableCashCents;
  if (availableCash <= 0) {
    return {
      verdict: "insufficient_data" as const,
      headline:
        "I don't have a clear read on available cash yet, so I can't give a confident answer on that — here's what I can tell you instead.",
      data_points: [`Current pressure: ${pressure.structural_pressure.summary}`],
    };
  }

  const ratio = amountCents / availableCash;
  const baseTier = tierForOneOffRatio(ratio);
  // Unlike the recurring path, structural pressure is included here: the
  // one-off ratio (amount vs. available cash) has no relationship to
  // committed-income-share, so there's no double-counting risk, and a
  // household with high structural pressure can have a healthy-looking cash
  // balance that's largely earmarked for bills about to land.
  const anyHigh = stabilityHigh || discretionaryHigh || timingShortfall || structuralHigh;
  const verdict = applyPressureDowngrade(baseTier, anyHigh);

  const dataPoints = [
    `${formatMoneyFromCents(amountCents, "AUD")} is ${mixedCurrency ? "roughly " : ""}${Math.round(
      ratio * 100
    )}% of your available cash (${formatMoneyFromCents(availableCash, "AUD")}).`,
    mixedCurrency
      ? "This combines more than one currency into one figure, so treat the comparison as approximate rather than exact."
      : null,
    anyHigh ? pressureCallout({ structuralHigh, discretionaryHigh, timingShortfall, stabilityHigh }) : null,
  ].filter((v): v is string => Boolean(v));

  return {
    verdict,
    headline: headlineForVerdict(verdict),
    data_points: dataPoints.slice(0, 3),
  };
}

async function readCookie(name: string) {
  const jar = await cookies();
  return jar.get(name)?.value?.trim() || null;
}

async function resolveActiveHouseholdId(
  supabase: any,
  userId: string
): Promise<string | null> {
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
  supabase: any,
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
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );
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
      !q || ORIENTATION_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksDiagnosis =
      !!q && DIAGNOSIS_KEYWORDS.some((kw) => lowerQ.includes(kw));
    const looksAffordability =
      !!q && AFFORDABILITY_KEYWORDS.some((kw) => lowerQ.includes(kw));

    if (looksOrientation) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);

      return NextResponse.json({
        ok: true,
        mode: "snapshot",
        household_id: householdId,
        snapshot,
        explanation,
      });
    }

    if (looksDiagnosis) {
      const truth = await getHouseholdMoneyTruth(supabase, { householdId });
      const snapshot = buildFinancialSnapshot(truth);
      const explanation = explainSnapshot(snapshot);

      const signals = snapshot.pressure;

      const rankedSignals: Array<{
        name: string;
        summary: string;
        score: number;
      }> = [
        {
          name: "structural",
          summary: signals.structural_pressure.summary,
          score: signals.structural_pressure.score,
        },
        {
          name: "discretionary",
          summary: signals.discretionary_drift.summary,
          score: signals.discretionary_drift.score,
        },
        {
          name: "timing",
          summary: signals.timing_mismatch.summary,
          score: signals.timing_mismatch.score,
        },
        {
          name: "stability",
          summary: signals.stability_risk.summary,
          score: signals.stability_risk.score,
        },
      ].sort((a, b) => b.score - a.score);

      const drivers = rankedSignals
        .filter((s) => s.score >= 0.15)
        .slice(0, 4)
        .map((s) => s.summary);

      const diagnosis = {
        headline: explanation.headline || "Current money pressure overview",
        summary:
          explanation.summary || "Here is what the current money signals show.",
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
      });
    }

    if (looksAffordability) {
      const affordability = await buildAffordabilityAnswer(supabase, householdId, lowerQ);

      return NextResponse.json({
        ok: true,
        mode: "affordability",
        household_id: householdId,
        affordability,
      });
    }

    const like = `%${q}%`;

    const [accountsRes, billsRes, txRes] = await Promise.all([
      supabase
        .from("accounts")
        .select(
          "id,name,provider,type,status,currency,current_balance_cents,updated_at,archived"
        )
        .eq("household_id", householdId)
        .or(
          `name.ilike.${like},provider.ilike.${like},type.ilike.${like},status.ilike.${like}`
        )
        .order("updated_at", { ascending: false })
        .limit(limit),

      supabase
        .from("recurring_bills")
        .select(
          "id,name,amount_cents,currency,cadence,next_due_at,autopay,active,updated_at"
        )
        .eq("household_id", householdId)
        .ilike("name", like)
        .order("next_due_at", { ascending: true })
        .limit(limit),

      supabase
        .from("transactions")
        .select(
          "id,account_id,posted_at,amount_cents,currency,merchant,description,category"
        )
        .eq("household_id", householdId)
        .or(
          `merchant.ilike.${like},description.ilike.${like},category.ilike.${like}`
        )
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ask failed." },
      { status: 500 }
    );
  }
}