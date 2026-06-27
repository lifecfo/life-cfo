import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";
import { explainSnapshot } from "@/lib/money/reasoning/explainSnapshot";
import { deriveTransactionOutflowSummary } from "@/lib/money/reasoning/deriveTransactionOutflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
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

    const [truth, confirmationsResult] = await Promise.all([
      getHouseholdMoneyTruth(supabase, { householdId }),
      supabase
        .from("transaction_pattern_confirmations")
        .select(
          "id,pattern_key,kind,label,amount_cents,currency,cadence,confidence,source_provider,first_seen_at,last_seen_at,created_at,updated_at"
        )
        .eq("household_id", householdId)
        .order("updated_at", { ascending: false }),
    ]);

    if (confirmationsResult.error) throw confirmationsResult.error;

    const snapshot = buildFinancialSnapshot(truth);
    const explanation = explainSnapshot(snapshot);
    const transactionOutflows = deriveTransactionOutflowSummary({
      monthTransactions: truth.month_transactions,
      rollingTransactions: truth.rolling_transactions,
      connections: truth.external_connections,
      nowIso: truth.as_of_iso,
    });

    return NextResponse.json({
      snapshot,
      explanation,
      transaction_outflows: transactionOutflows,
      pattern_confirmations: confirmationsResult.data ?? [],
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Money overview fetch failed") },
      { status: 500 }
    );
  }
}
