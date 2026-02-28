// app/api/households/active/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const householdId = typeof body?.household_id === "string" ? body.household_id : null;

    if (!householdId) {
      return NextResponse.json({ ok: false, error: "Missing household_id." }, { status: 400 });
    }

    // Validate membership
    const { data, error } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("household_id", householdId)
      .limit(1);

    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json({ ok: false, error: "User not linked to that household." }, { status: 403 });
    }

    // Persist cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, householdId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });

    // Preference (cross-device)
    const { error: upsertErr } = await supabase
      .from("household_preferences")
      .upsert({ user_id: user.id, active_household_id: householdId }, { onConflict: "user_id" });

    if (upsertErr) throw upsertErr;

    return NextResponse.json({ ok: true, active_household_id: householdId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Active household set failed" }, { status: 500 });
  }
}