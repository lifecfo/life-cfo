import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

async function supabaseServer() {
  const cookieStore = await Promise.resolve(cookies() as any);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll?.() ?? [];
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              cookieStore.set?.(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}

async function getUserHouseholdId(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data?.household_id ?? null;
}

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const uid = auth?.user?.id;
    if (!uid)
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );

    const { data, error } = await supabase
      .from("external_connections")
      .select(
        "id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, connections: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Connections fetch failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;

    const uid = auth?.user?.id;
    if (!uid)
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );

    const householdId = await getUserHouseholdId(supabase, uid);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const provider =
      typeof body?.provider === "string" ? body.provider : "manual";
    const display_name =
      typeof body?.display_name === "string"
        ? body.display_name
        : "Manual connection";

    const { data, error } = await supabase
      .from("external_connections")
      .insert({
        user_id: uid,
        household_id: householdId,
        provider,
        status: "active",
        display_name,
        metadata: {},
      })
      .select("id,provider,status,display_name,created_at")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ ok: true, connection: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Connection create failed" },
      { status: 500 }
    );
  }
}