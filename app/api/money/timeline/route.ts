import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { buildTimelineBuckets, DEFAULT_BUCKET_SPAN } from "@/lib/money/reasoning/moneyTimelineBuckets";
import { deriveEffectiveMoneyTruth } from "@/lib/money/reasoning/effectiveMoneySources";
import { deriveMoneyZoomTimeline } from "@/lib/money/reasoning/deriveZoomTimeline";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";
import type { TimelineGranularity } from "@/lib/money/reasoning/types";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_GRANULARITIES: TimelineGranularity[] = ["week", "month", "quarter", "year"];

function isSupportedGranularity(value: string | null): value is TimelineGranularity {
  return !!value && (SUPPORTED_GRANULARITIES as string[]).includes(value);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const granularityParam = url.searchParams.get("granularity") || "month";
    if (!isSupportedGranularity(granularityParam)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported granularity. Use week, month, quarter, or year." },
        { status: 400 }
      );
    }
    const granularity = granularityParam;

    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "No active household was found." }, { status: 400 });
    }

    const rawTruth = await getHouseholdMoneyTruth(supabase, { householdId });
    const { truth } = deriveEffectiveMoneyTruth(rawTruth);

    const nowIso = truth.windows.now_iso || truth.as_of_iso;
    const span = DEFAULT_BUCKET_SPAN[granularity];
    const buckets = buildTimelineBuckets(granularity, nowIso, span.past, span.future);

    // Actuals need a wider, independent window than getHouseholdMoneyTruth's
    // built-in windows (last 100 rows / this month / rolling 60 days) --
    // those are too narrow for Quarter/Year granularity. Bounded to this
    // request's own bucket span, so no unbounded household history is ever
    // pulled.
    const { data: actualRows, error: actualError } = await supabase
      .from("transactions")
      .select(
        "id,connection_id,external_connection_id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,provider,created_at,updated_at"
      )
      .eq("household_id", householdId)
      .gte("date", buckets[0].start_iso.slice(0, 10))
      .lte("date", nowIso.slice(0, 10))
      .order("date", { ascending: false })
      .limit(5000);

    if (actualError) throw actualError;

    const timeline = deriveMoneyZoomTimeline(truth, actualRows ?? [], granularity, nowIso);

    return NextResponse.json({ ok: true, timeline });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn't load the timeline yet." },
      { status: 500 }
    );
  }
}
