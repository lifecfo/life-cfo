// app/api/money/sync/[connectionId]/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getProvider } from "@/lib/money/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { connectionId: string } }
) {
  try {
    const supabase = await supabaseRoute();

    // 1️⃣ Auth
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const connectionId = params.connectionId;
    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "Missing connection id." },
        { status: 400 }
      );
    }

    // 2️⃣ Fetch connection (must belong to user)
    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .select("id, provider, status, user_id")
      .eq("id", connectionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (connErr) throw connErr;

    if (!connection) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 }
      );
    }

    // 3️⃣ Provider dispatch
    const provider = getProvider(connection.provider);

    const result = await provider.sync(connection.id);

    // 4️⃣ Update last_sync_at
    await supabase
      .from("external_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        status: "active",
      })
      .eq("id", connection.id)
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      synced: true,
      result,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Sync failed" },
      { status: 500 }
    );
  }
}