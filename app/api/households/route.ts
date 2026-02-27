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

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const { data: memberships, error } = await supabase
      .from("household_members")
      .select("household_id, role, households ( id, name )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows =
      memberships?.map((m: any) => ({
        id: m.household_id,
        name: m.households?.name ?? "Untitled",
        role: m.role,
      })) ?? [];

    const cookieStore = await cookies(); // ✅ MUST AWAIT
    const cookieValue = cookieStore.get(COOKIE_NAME)?.value ?? null;

    const active_household_id =
      (cookieValue && rows.some((m) => m.id === cookieValue) ? cookieValue : null) ??
      rows[0]?.id ??
      null;

    return NextResponse.json({
      ok: true,
      households: rows,
      active_household_id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Households fetch failed" },
      { status: 500 }
    );
  }
}