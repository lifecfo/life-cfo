// app/api/money/accounts/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

async function resolveHouseholdId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value ?? null;

  if (cookieValue) {
    const { data, error } = await supabase
      .from("household_members")
      .select("id")
      .eq("user_id", userId)
      .eq("household_id", cookieValue)
      .limit(1);

    if (!error && data?.length) return cookieValue;
  }

  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (!householdId) return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });

    const { data, error } = await supabase
      .from("accounts")
      .select("id,household_id,name,provider,type,status,archived,current_balance_cents,currency,updated_at,created_at")
      .eq("household_id", householdId)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ ok: true, household_id: householdId, accounts: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Accounts fetch failed" }, { status: 500 });
  }
}