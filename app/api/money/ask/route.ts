// app/api/money/ask/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

type AskBody = {
  q?: string;
  limit?: number;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * We don't assume what your supabaseRoute.ts exports are called.
 * We try a few common names and finally default export.
 */
function getCreateRouteClient(): (args: any) => any {
  const anyMod = RouteSupabase as any;

  return (
    anyMod.createSupabaseRouteClient ||
    anyMod.createRouteClient ||
    anyMod.supabaseRouteClient ||
    anyMod.createClient ||
    anyMod.default
  );
}

async function readCookie(name: string) {
  const jar = await cookies();
  return jar.get(name)?.value?.trim() || null;
}

async function resolveActiveHouseholdId(supabase: any, userId: string): Promise<string | null> {
  // cookie-first (must be a valid membership)
  const preferred = await readCookie(COOKIE_NAME);

  if (preferred) {
    const { data: okRows, error: okErr } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", userId)
      .eq("household_id", preferred)
      .limit(1);

    if (!okErr && okRows?.length) return preferred;
  }

  // fallback to earliest membership
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.household_id ?? null;
}

async function ensureHouseholdMember(supabase: any, userId: string, householdId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.household_id) throw new Error("Not a member of this household.");
  return { role: (data.role as string | null) ?? null };
}

export async function POST(req: Request) {
  try {
    // ✅ Next.js cookies() is async now
    const jar = await cookies();

    const createRouteClient = getCreateRouteClient();
    if (!createRouteClient) {
      return NextResponse.json(
        { ok: false, error: "Missing supabase route client factory (supabase/supabaseRoute.ts)." },
        { status: 500 }
      );
    }

    // Try a couple common calling conventions
    let supabase: any;
    try {
      supabase = createRouteClient({ cookies: () => jar });
    } catch {
      supabase = createRouteClient({ cookieStore: jar });
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as AskBody;
    const q = safeStr(body.q).trim();
    const limit = clampInt(body.limit, 3, 30, 10);

    const householdId = await resolveActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });
    }

    const { role } = await ensureHouseholdMember(supabase, user.id, householdId);

    // No query → return light readiness + counts (fast + calm)
    if (!q) {
      const [accountsCount, billsCount, txCount] = await Promise.all([
        supabase.from("accounts").select("id", { count: "exact", head: true }).eq("household_id", householdId),
        supabase.from("recurring_bills").select("id", { count: "exact", head: true }).eq("household_id", householdId),
        supabase.from("transactions").select("id", { count: "exact", head: true }).eq("household_id", householdId),
      ]);

      return NextResponse.json({
        ok: true,
        household_id: householdId,
        role,
        hint: "Ask a money question or search for an account, bill, or transaction.",
        counts: {
          accounts: accountsCount.count ?? 0,
          bills: billsCount.count ?? 0,
          transactions: txCount.count ?? 0,
        },
      });
    }

    const like = `%${q}%`;

    // NOTE: keep this as retrieval-only (no “AI answers” here)
    const [accountsRes, billsRes, txRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,provider,type,status,currency,current_balance_cents,updated_at,archived")
        .eq("household_id", householdId)
        .or(`name.ilike.${like},provider.ilike.${like},type.ilike.${like},status.ilike.${like}`)
        .order("updated_at", { ascending: false })
        .limit(limit),

      supabase
        .from("recurring_bills")
        .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,updated_at")
        .eq("household_id", householdId)
        .ilike("name", like)
        .order("next_due_at", { ascending: true })
        .limit(limit),

      supabase
        .from("transactions")
        .select("id,account_id,posted_at,amount_cents,currency,merchant,description,category")
        .eq("household_id", householdId)
        .or(`merchant.ilike.${like},description.ilike.${like},category.ilike.${like}`)
        .order("posted_at", { ascending: false })
        .limit(limit),
    ]);

    const firstErr = accountsRes.error || billsRes.error || txRes.error;
    if (firstErr) {
      return NextResponse.json(
        {
          ok: false,
          error: firstErr.message,
          debug: {
            accounts_ok: !accountsRes.error,
            bills_ok: !billsRes.error,
            transactions_ok: !txRes.error,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      role,
      q,
      results: {
        accounts: accountsRes.data ?? [],
        bills: billsRes.data ?? [],
        transactions: txRes.data ?? [],
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Ask failed." }, { status: 500 });
  }
}