import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

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

    if (!canDelete) {
      return NextResponse.json(
        {
          ok: false,
          error: "Only incomplete Basiq setup attempts can be removed in this pass.",
        },
        { status: 409 }
      );
    }

    const [{ count: externalAccountsCount, error: externalAccountsErr }, { count: accountsCount, error: accountsErr }, { count: transactionsCount, error: transactionsErr }] = await Promise.all([
      supabase
        .from("external_accounts")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("connection_id", connectionId),
      supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("connection_id", connectionId),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .or(`connection_id.eq.${connectionId},external_connection_id.eq.${connectionId}`),
    ]);

    if (externalAccountsErr) throw externalAccountsErr;
    if (accountsErr) throw accountsErr;
    if (transactionsErr) throw transactionsErr;

    const linkedCounts = {
      external_accounts: externalAccountsCount ?? 0,
      accounts: accountsCount ?? 0,
      transactions: transactionsCount ?? 0,
    };

    if (linkedCounts.external_accounts > 0 || linkedCounts.accounts > 0 || linkedCounts.transactions > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "This setup attempt already has imported data and cannot be removed here.",
        },
        { status: 409 }
      );
    }

    const { data: deletedRows, error: deleteErr } = await supabase
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
        { ok: false, error: "Could not remove setup attempt." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      removed_connection_id: connectionId,
      household_id: householdId,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Could not remove setup attempt.";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
