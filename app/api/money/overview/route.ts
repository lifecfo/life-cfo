import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { explainSnapshot } from "@/lib/money/reasoning/explainSnapshot";
import { deriveTransactionOutflowSummary } from "@/lib/money/reasoning/deriveTransactionOutflows";
import { deriveEffectiveMoneyTruth } from "@/lib/money/reasoning/effectiveMoneySources";
import { deriveMoneySetupStatus } from "@/lib/money/reasoning/deriveMoneySetupStatus";
import { deriveBreathingRoom } from "@/lib/money/reasoning/deriveBreathingRoom";
import { deriveHomeMoneySummary } from "@/lib/money/reasoning/deriveHomeMoneySummary";
import type {
  AccountsTruthRow,
  MoneyGoalsTruthRow,
  MoneyPrimaryGoalSummary,
} from "@/lib/money/reasoning/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function cashByCurrency(accounts: AccountsTruthRow[]) {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    const currency = String(account.currency || "AUD").trim().toUpperCase() || "AUD";
    const cents = account.available_balance_cents ?? account.current_balance_cents ?? 0;
    totals.set(currency, (totals.get(currency) ?? 0) + cents);
  }
  return [...totals.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function primaryGoal(goals: MoneyGoalsTruthRow[]): MoneyPrimaryGoalSummary | null {
  const eligible = goals.filter((goal) => {
    const status = String(goal.status || "active").trim().toLowerCase();
    return (
      typeof goal.target_cents === "number" &&
      goal.target_cents > 0 &&
      status !== "archived" &&
      status !== "completed"
    );
  });
  const goal = eligible.find((item) => item.is_primary === true) ?? eligible[0];
  if (!goal || typeof goal.target_cents !== "number") return null;
  const currentCents = Math.max(0, goal.current_cents ?? 0);
  return {
    title: String(goal.title || "Goal").trim() || "Goal",
    currency: String(goal.currency || "AUD").trim().toUpperCase() || "AUD",
    current_cents: currentCents,
    target_cents: goal.target_cents,
    progress_percent: Math.max(
      0,
      Math.min(100, Math.round((currentCents / goal.target_cents) * 100))
    ),
  };
}

export async function GET() {
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

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);

    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const rawTruth = await getHouseholdMoneyTruth(supabase, { householdId });
    const { truth, dataCoverage } = deriveEffectiveMoneyTruth(rawTruth);
    const snapshot = buildFinancialSnapshot(truth);
    const explanation = explainSnapshot(snapshot);
    const transactionOutflows = deriveTransactionOutflowSummary({
      monthTransactions: truth.month_transactions,
      rollingTransactions: truth.rolling_transactions,
      connections: truth.external_connections,
      nowIso: truth.as_of_iso,
    });
    const setupStatus = deriveMoneySetupStatus({
      truth,
      dataCoverage,
      transactionOutflows,
    });
    const breathingRoom = deriveBreathingRoom({ truth, dataCoverage });
    const homeSummary = deriveHomeMoneySummary({ truth, dataCoverage });

    return NextResponse.json({
      snapshot,
      explanation,
      transaction_outflows: transactionOutflows,
      pattern_confirmations: truth.transaction_pattern_confirmations,
      recent_transactions: truth.recent_transactions,
      data_coverage: dataCoverage,
      setup_status: setupStatus,
      breathing_room: breathingRoom,
      cash_by_currency: cashByCurrency(truth.accounts),
      primary_goal: primaryGoal(truth.goals),
      home_summary: homeSummary,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Money overview fetch failed") },
      { status: 500 }
    );
  }
}
