// app/api/money/connections/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intOr(v: unknown, fallback: number) {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

async function supabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

async function getHouseholdIdForUser(supabase: any, userId: string): Promise<string | null> {
  // pick the first household link (owner/member) for this user
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
    const supabase = await supabaseServer();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await getHouseholdIdForUser(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("external_connections")
      .select("id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at")
      .eq("user_id", user.id)
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, connections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connections fetch failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await getHouseholdIdForUser(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));

    const provider = typeof body?.provider === "string" ? body.provider : "manual";
    const display_name = typeof body?.display_name === "string" ? body.display_name : null;

    // 1) Create connection row
    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .insert({
        user_id: user.id,
        household_id: householdId,
        provider,
        status: "active",
        display_name,
        // provider-specific ids/tokens get filled later by adapters
      })
      .select("id,provider,status,display_name,created_at")
      .maybeSingle();

    if (connErr) throw connErr;

    // 2) Auto-create starter accounts IF user has none (avoid duplicates)
    const { count: existingCount, error: countErr } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("archived", false);

    if (countErr) throw countErr;

    let seeded_accounts: any[] = [];

    if ((existingCount ?? 0) === 0) {
      const currency = typeof body?.currency === "string" ? body.currency : "AUD";

      const seed = [
        { name: "Everyday Spending", type: "cash" },
        { name: "Bills Buffer", type: "cash" },
        { name: "Savings", type: "cash" },
      ];

      const rows = seed.map((s) => ({
        user_id: user.id,
        provider: provider,
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
        .select("id,name,provider,type,status,currency,current_balance_cents,updated_at");

      if (seedErr) throw seedErr;

      seeded_accounts = created ?? [];
    }

    return NextResponse.json({
      ok: true,
      connection,
      seeded_accounts,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}