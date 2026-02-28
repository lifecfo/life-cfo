// app/api/households/create/route.ts
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    const householdName = name || "Household";

    // Create household
    const { data: hh, error: hhErr } = await supabase
      .from("households")
      .insert({ name: householdName })
      .select("id,name,created_at")
      .maybeSingle();

    if (hhErr) throw hhErr;
    if (!hh?.id) return NextResponse.json({ ok: false, error: "Household create failed." }, { status: 500 });

    // Add creator as owner
    const { error: memErr } = await supabase
      .from("household_members")
      .insert({ household_id: hh.id, user_id: user.id, role: "owner" });

    if (memErr) throw memErr;

    // Set active household cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, hh.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });

    // Persist preference (cross-device)
    const { error: prefErr } = await supabase
      .from("household_preferences")
      .upsert({ user_id: user.id, active_household_id: hh.id }, { onConflict: "user_id" });

    if (prefErr) throw prefErr;

    return NextResponse.json({ ok: true, household: hh, active_household_id: hh.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Household create failed" }, { status: 500 });
  }
}