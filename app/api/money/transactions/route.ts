// app/api/money/transactions/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

async function resolveHouseholdId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
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

function intOr(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (!householdId) return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });

    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pending = url.searchParams.get("pending");
    const limit = Math.min(intOr(url.searchParams.get("limit"), 50), 250);

    let q = supabase
      .from("transactions")
      .select(
        "id,household_id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,connection_id,provider,external_id,created_at,updated_at"
      )
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (accountId) q = q.eq("account_id", accountId);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (pending === "true") q = q.eq("pending", true);
    if (pending === "false") q = q.eq("pending", false);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ ok: true, household_id: householdId, transactions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Transactions fetch failed" }, { status: 500 });
  }
}