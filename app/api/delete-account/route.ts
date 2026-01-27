// app/api/delete-account/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

export async function POST() {
  try {
    const url = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const anon = envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const service = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ Next.js 16: cookies() is async
    const cookieStore = await cookies();

    // 1) Read signed-in user from cookies (server-side, secure)
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(_cookies) {
          // no-op: this route only READS auth cookies
        },
      },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const userId = auth.user.id;

    // 2) Delete all app-owned data
    // IMPORTANT: this RPC must be SECURITY DEFINER and scoped to auth.uid()
    const { error: rpcErr } = await supabase.rpc("keystone_delete_my_data");
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    }

    // 3) Delete Supabase auth user (service role only)
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
    if (delAuthErr) {
      return NextResponse.json({ error: delAuthErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Account deletion failed." },
      { status: 500 }
    );
  }
}
