import { NextResponse } from "next/server";
import { getLifeCfoAccess } from "@/lib/server/access/lifeCfoAccess";
import { getDemoSetupStatus } from "@/lib/server/demo/demoProvisioning";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }
    if (!getLifeCfoAccess(user).isDemoMode) {
      return NextResponse.json({ ok: false, error: "Not available." }, { status: 403 });
    }

    const status = await getDemoSetupStatus(user.id);
    return NextResponse.json({
      ok: true,
      demo_ready: status.demo_ready,
      household_count: status.household_count,
      missing_scenarios: status.missing_scenarios,
    });
  } catch {
    console.error("demo_status_failed");
    return NextResponse.json(
      { ok: false, error: "We couldnâ€™t check the demo yet." },
      { status: 500 }
    );
  }
}
