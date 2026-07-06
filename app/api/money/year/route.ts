import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { deriveEffectiveMoneyTruth } from "@/lib/money/reasoning/effectiveMoneySources";
import { deriveMoneyTimeline } from "@/lib/money/reasoning/deriveMoneyTimeline";
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
    const { truth } = deriveEffectiveMoneyTruth(rawTruth);
    const year = deriveYearMoneySummary(truth);
    const timeline = deriveMoneyTimeline(year);

    return NextResponse.json({ ok: true, year, timeline });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn't load the year view yet." },
      { status: 500 }
    );
  }
}
