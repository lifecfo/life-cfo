// app/api/households/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const cookieStore = cookies();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const { data: membershipsRaw, error } = await supabase
      .from("household_members")
      .select("household_id, role, households!inner(id,name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const memberships =
      membershipsRaw?.map((m: any) => ({
        household_id: String(m.household_id),
        role: String(m.role ?? "viewer"),
        household_name: String(m.households?.name ?? "Household"),
      })) ?? [];

    const cookieValue = cookieStore.get(COOKIE_NAME)?.value ?? null;

    const active_household_id =
      (cookieValue && memberships.some((m) => m.household_id === cookieValue) ? cookieValue : null) ??
      memberships[0]?.household_id ??
      null;

    return NextResponse.json({ ok: true, active_household_id, memberships });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to load households." }, { status: 500 });
  }
}