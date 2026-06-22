import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeStatus(status: unknown): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function normalizeProvider(provider: unknown): string {
  return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}

function isOwnerOrEditor(role: unknown): boolean {
  const r = typeof role === "string" ? role.trim().toLowerCase() : "";
  return r === "owner" || r === "editor";
}

function cleanupErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("foreign key")) {
    return "This setup still has local records that need review before it can be removed.";
  }

  return "This setup could not be removed. Your connected bank data was not changed.";
}

async function assertOwnerOrEditorAccess(
  supabase: Awaited<ReturnType<typeof supabaseRoute>>,
  userId: string,
  householdId: string
) {
  const { data: hm, error: hmErr } = await supabase
    .from("household_members")
    .select("role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (hmErr) throw hmErr;

  const { data: ownerCheck, error: ownerCheckErr } = await supabase.rpc(
    "is_household_owner_or_editor",
    { p_household_id: householdId }
  );

  if (ownerCheckErr) {
    throw new Error(ownerCheckErr.message || "Could not verify household permissions.");
  }

  if (!isOwnerOrEditor(hm?.role) || ownerCheck !== true) {
    return false;
  }

  return true;
}

export async function DELETE(
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

    const canWrite = await assertOwnerOrEditorAccess(supabase, user.id, householdId);
    if (!canWrite) {
      return NextResponse.json(
        { ok: false, error: "Not allowed to remove connections for this household." },
        { status: 403 }
      );
    }

    const { connectionId } = await params;
    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "Missing connection id." },
        { status: 400 }
      );
    }

    const { data: connection, error: connectionErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status")
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connectionErr) throw connectionErr;

    if (!connection) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 }
      );
    }

    const provider = normalizeProvider(connection.provider);
    const status = normalizeStatus(connection.status);
    const canDelete = provider === "basiq" && (status === "needs_auth" || status === "error");

    if (provider === "basiq" && status === "active") {
      return NextResponse.json(
        {
          ok: false,
          error: "Bank disconnection is not available yet. We're preparing secure consent management before enabling it.",
        },
        { status: 409 }
      );
    }

    if (!canDelete) {
      return NextResponse.json(
        {
          ok: false,
          error: "Only incomplete Basiq setup attempts can be removed in this pass.",
        },
        { status: 409 }
      );
    }

    const admin = supabaseAdmin();

    const { error: transactionDeleteError } = await admin
      .from("transactions")
      .delete()
      .eq("household_id", householdId)
      .or(`connection_id.eq.${connectionId},external_connection_id.eq.${connectionId}`);
    if (transactionDeleteError) throw transactionDeleteError;

    const { error: externalAccountsDeleteError } = await admin
      .from("external_accounts")
      .delete()
      .eq("household_id", householdId)
      .eq("connection_id", connectionId);
    if (externalAccountsDeleteError) throw externalAccountsDeleteError;

    const { error: accountsDeleteError } = await admin
      .from("accounts")
      .delete()
      .eq("household_id", householdId)
      .eq("connection_id", connectionId);
    if (accountsDeleteError) throw accountsDeleteError;

    const { data: deletedRows, error: deleteErr } = await admin
      .from("external_connections")
      .delete()
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .select("id");

    if (deleteErr) {
      console.error("Failed to remove Basiq setup attempt", {
        connection_id: connectionId,
        household_id: householdId,
        error: deleteErr.message,
      });
      throw new Error("Could not remove setup attempt.");
    }

    if (!deletedRows || deletedRows.length === 0) {
      console.error("Basiq setup attempt delete returned no rows", {
        connection_id: connectionId,
        household_id: householdId,
      });
      return NextResponse.json(
        {
          ok: false,
          error: "This setup could not be removed. Your connected bank data was not changed.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      removed_connection_id: connectionId,
      disconnected: false,
      household_id: householdId,
    });
  } catch (e: unknown) {
    console.error("Failed to clean up incomplete Basiq setup attempt", {
      error: e instanceof Error ? e.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, error: cleanupErrorMessage(e) },
      { status: 500 }
    );
  }
}
