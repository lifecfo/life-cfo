// app/api/money/connections/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function supabaseServer() {
  // In newer Next versions, cookies() is async and returns a cookie store.
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // ✅ Use ANON key for user-scoped routes (keeps RLS protection)
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // For now we don't need to mutate cookies in this route.
        // If/when you add session refresh handling here, we can wire set/remove properly.
        set() {},
        remove() {},
      },
    }
  );
}

export async function GET() {
  try {
    const supabase = await supabaseServer();

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const { data, error } = await supabase
      .from("external_connections")
      .select("id,provider,status,provider_connection_id,display_name,last_sync_at,created_at,updated_at")
      .eq("user_id", uid)
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

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    if (!uid) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === "string" ? body.provider : "manual";
    const display_name = typeof body?.display_name === "string" ? body.display_name : null;

    // For now: create a placeholder connection record (provider adapters plug in later)
    const { data, error } = await supabase
      .from("external_connections")
      .insert({
        user_id: uid,
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
    return NextResponse.json({ ok: false, error: e?.message ?? "Connection create failed" }, { status: 500 });
  }
}