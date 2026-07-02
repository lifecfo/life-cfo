import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getLifeCfoAccess } from "@/lib/server/access/lifeCfoAccess";
import { provisionDemoHouseholds } from "@/lib/server/demo/demoProvisioning";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
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

    const result = await provisionDemoHouseholds(user.id);
    if (result.first_household_id) {
      const cookieStore = await cookies();
      cookieStore.set("lifecfo_household", result.first_household_id, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      household_count: result.household_count,
    });
  } catch {
    console.error("demo_setup_failed");
    return NextResponse.json(
      { ok: false, error: "We couldnâ€™t set up the demo yet." },
      { status: 500 }
    );
  }
}
