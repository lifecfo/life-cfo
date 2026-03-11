import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import { buildFinancialSnapshot } from "@/lib/money/reasoning/buildFinancialSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const truth = await getHouseholdMoneyTruth(supabase, { householdId });
    const snapshot = buildFinancialSnapshot(truth);

    return NextResponse.json(snapshot);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Money overview fetch failed" },
      { status: 500 }
    );
  }
}
