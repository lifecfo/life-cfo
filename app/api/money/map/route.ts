import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { deriveEffectiveMoneyTruth } from "@/lib/money/reasoning/effectiveMoneySources";
import { deriveHomeMoneySummary } from "@/lib/money/reasoning/deriveHomeMoneySummary";
import { deriveMoneyMap } from "@/lib/money/reasoning/deriveMoneyMap";
import { deriveMoneySetupStatus } from "@/lib/money/reasoning/deriveMoneySetupStatus";
import { deriveTransactionOutflowSummary } from "@/lib/money/reasoning/deriveTransactionOutflows";
import { deriveYearMoneySummary } from "@/lib/money/reasoning/deriveYearMoneySummary";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Please sign in again." },
        { status: 401 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const rawTruth = await getHouseholdMoneyTruth(supabase, { householdId });
    const { truth, dataCoverage } = deriveEffectiveMoneyTruth(rawTruth);
    const homeSummary = deriveHomeMoneySummary({ truth, dataCoverage });
    const yearSummary = deriveYearMoneySummary(truth);
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
    const moneyMap = deriveMoneyMap({
      truth,
      dataCoverage,
      homeSummary,
      yearSummary,
      pendingReviewCount: setupStatus.evidence.pending_review_count,
    });

    return NextResponse.json({ ok: true, money_map: moneyMap });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t load the Money Map yet." },
      { status: 500 }
    );
  }
}
