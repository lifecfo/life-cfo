import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { getProvider } from "@/lib/money/providers";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectionStatusRow = {
  id: string;
  household_id: string;
  provider: string;
  status: string | null;
  last_sync_at: string | null;
};

function normalizeStatus(status: unknown): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

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

    if (normalizeStatus(connection.provider) !== "basiq") {
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
    }

    const { data: statusAfterSync, error: statusAfterSyncErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status, last_sync_at")
      .eq("id", connection.id)
      .eq("household_id", householdId)
      .maybeSingle();

    if (statusAfterSyncErr) throw statusAfterSyncErr;

    const previousStatus = normalizeStatus((statusAfterSync as ConnectionStatusRow | null)?.status);

    if (previousStatus === "active") {
      return NextResponse.json({
        ok: true,
        household_id: householdId,
        synced: true,
        result,
      });
    }

    const nowIso = new Date().toISOString();
    const { error: fallbackUpdateErr } = await supabase
      .from("external_connections")
      .update({
        status: "active",
        last_sync_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", connection.id)
      .eq("household_id", householdId);

    if (fallbackUpdateErr) {
      console.error("Basiq sync finalization fallback update failed", {
        connection_id: connection.id,
        provider: connection.provider,
        previous_status: previousStatus || null,
        error: fallbackUpdateErr.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Sync completed but connection status could not be finalized.",
          connection_id: connection.id,
          provider: connection.provider,
          previous_status: previousStatus || null,
          current_status: previousStatus || null,
        },
        { status: 500 }
      );
    }

    const { data: statusAfterFallback, error: statusAfterFallbackErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status, last_sync_at")
      .eq("id", connection.id)
      .eq("household_id", householdId)
      .maybeSingle();

    if (statusAfterFallbackErr) {
      console.error("Basiq sync finalization fallback verification failed", {
        connection_id: connection.id,
        provider: connection.provider,
        previous_status: previousStatus || null,
        error: statusAfterFallbackErr.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Sync completed but connection status verification failed.",
          connection_id: connection.id,
          provider: connection.provider,
          previous_status: previousStatus || null,
          current_status: null,
        },
        { status: 500 }
      );
    }

    const currentStatus = normalizeStatus(
      (statusAfterFallback as ConnectionStatusRow | null)?.status
    );

    if (currentStatus !== "active") {
      console.error("Basiq sync finalization did not stick", {
        connection_id: connection.id,
        provider: connection.provider,
        previous_status: previousStatus || null,
        current_status: currentStatus || null,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Sync completed but connection status remained non-active.",
          connection_id: connection.id,
          provider: connection.provider,
          previous_status: previousStatus || null,
          current_status: currentStatus || null,
        },
        { status: 500 }
      );
    }

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
