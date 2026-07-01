import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

function cookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const { householdId } = await params;
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "We couldn’t leave this household yet." }, { status: 400 });
    }

    const { error: leaveError } = await supabase.rpc("leave_household", {
      p_household_id: householdId,
    });

    if (leaveError) {
      if (leaveError.message.includes("cannot_leave_last_owner")) {
        return NextResponse.json(
          {
            ok: false,
            code: "cannot_leave_last_owner",
            error: "You’re the only owner. Add another owner before leaving.",
          },
          { status: 409 },
        );
      }
      if (leaveError.message.includes("membership_not_found") || leaveError.message.includes("household_not_found")) {
        return NextResponse.json(
          { ok: false, code: "household_access_not_found", error: "We couldn’t access this household." },
          { status: 404 },
        );
      }
      throw leaveError;
    }

    const { data: remainingMemberships, error: membershipsError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (membershipsError) throw membershipsError;

    const activeHouseholdId = remainingMemberships?.[0]?.household_id ?? null;
    const cookieStore = await cookies();

    if (activeHouseholdId) {
      cookieStore.set(COOKIE_NAME, activeHouseholdId, cookieOptions());
      const { error: preferenceError } = await supabase
        .from("household_preferences")
        .upsert({ user_id: user.id, active_household_id: activeHouseholdId }, { onConflict: "user_id" });

      if (preferenceError) {
        console.error("leave_household_preference_update_failed", { code: preferenceError.code });
      }
    } else {
      cookieStore.delete(COOKIE_NAME);
      const { error: preferenceError } = await supabase
        .from("household_preferences")
        .delete()
        .eq("user_id", user.id);

      if (preferenceError) {
        console.error("leave_household_preference_clear_failed", { code: preferenceError.code });
      }
    }

    return NextResponse.json({
      ok: true,
      left_household_id: householdId,
      active_household_id: activeHouseholdId,
      needs_household: !activeHouseholdId,
    });
  } catch (error: unknown) {
    console.error("leave_household_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, error: "We couldn’t leave this household yet." },
      { status: 500 },
    );
  }
}
