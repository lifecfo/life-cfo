// app/api/money/connections/route.ts
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

function normalizeProvider(input: unknown): string {
  if (typeof input !== "string") return "manual";
  const p = input.trim().toLowerCase();
  return p || "manual";
}

function connectionStatusForProvider(provider: string): string {
  return provider === "manual" ? "manual" : "needs_auth";
}

function defaultDisplayName(provider: string): string | null {
  if (provider === "manual") return "Manual";
  return provider.toUpperCase();
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
      .from("external_connections")
      .select("id,household_id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, household_id: householdId, connections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connections fetch failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const householdId = await resolveHouseholdId(supabase, user.id);
    if (!householdId) return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });

    const body = await req.json().catch(() => ({}));

    const provider = normalizeProvider(body?.provider);
    const status = connectionStatusForProvider(provider);
    const display_name = typeof body?.display_name === "string" ? body.display_name : defaultDisplayName(provider);
    const currency = typeof body?.currency === "string" ? body.currency : "AUD";

    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .insert({
        household_id: householdId,
        provider,
        status,
        display_name,
        provider_connection_id: null,
        encrypted_access_token: null,
      })
      .select("id,household_id,provider,status,display_name,created_at")
      .maybeSingle();

    if (connErr) throw connErr;

    // Seed simple accounts if none exist for this household
    const { count: existingCount, error: countErr } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("archived", false);

    if (countErr) throw countErr;

    let seeded_accounts: any[] = [];

    if ((existingCount ?? 0) === 0) {
      const seed = [
        { name: "Everyday Spending", type: "cash" },
        { name: "Bills Buffer", type: "cash" },
        { name: "Savings", type: "cash" },
      ];

      const rows = seed.map((s) => ({
        household_id: householdId,
        provider,
        name: s.name,
        type: s.type,
        status: "active",
        currency,
        current_balance_cents: 0,
        archived: false,
      }));

      const { data: created, error: seedErr } = await supabase
        .from("accounts")
        .insert(rows)
        .select("id,household_id,name,provider,type,status,currency,current_balance_cents,updated_at,created_at");

      if (seedErr) throw seedErr;
      seeded_accounts = created ?? [];
    }

    return NextResponse.json({ ok: true, household_id: householdId, connection, seeded_accounts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}