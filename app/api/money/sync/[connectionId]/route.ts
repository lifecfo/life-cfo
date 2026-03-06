import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getProvider } from "@/lib/money/providers";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { connectionId } = await params;

    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "Missing connection id." },
        { status: 400 }
      );
    }

    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status")
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connErr) throw connErr;

    if (!connection) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 }
      );
    }

    const provider = getProvider(connection.provider);
    const result = await provider.sync(connection.id);

    await supabase
      .from("external_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("household_id", householdId);

    return NextResponse.json({
      ok: true,
      household_id: householdId,
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