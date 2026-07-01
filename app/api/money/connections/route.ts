// app/api/money/connections/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeProvider(input: unknown): string {
  if (typeof input !== "string") return "manual";
  const p = input.trim().toLowerCase();
  return p || "manual";
}

function connectionStatusForProvider(provider: string): string {
  return provider === "manual" ? "manual" : "needs_auth";
}

function defaultDisplayName(provider: string): string | null {
  if (provider === "manual") return "Manual";
  return provider.toUpperCase();
}

function isOwnerOrEditor(role: unknown) {
  const r = typeof role === "string" ? role.trim().toLowerCase() : "";
  return r === "owner" || r === "editor";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isReusableBasiqStatus(status: unknown) {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "needs_auth" || s === "error";
}

function hasBasiqConsentMetadata(itemId: unknown): boolean {
  if (typeof itemId !== "string" || !itemId.trim()) return false;
  try {
    const item = JSON.parse(itemId) as Record<string, unknown>;
    return Boolean(
      (typeof item.basiq_job_id === "string" && item.basiq_job_id.trim()) ||
        (Array.isArray(item.basiq_job_ids) && item.basiq_job_ids.length) ||
        (typeof item.basiq_source === "string" && item.basiq_source.trim())
    );
  } catch {
    return false;
  }
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function connectionSourceKind(input: {
  provider: string;
  status: string;
  metadata: Record<string, unknown>;
}) {
  if (
    input.provider === "manual" &&
    input.status === "demo" &&
    input.metadata.demo === true
  ) {
    return "demo";
  }
  if (
    input.provider === "manual" &&
    input.metadata.manual_csv === true &&
    input.metadata.source_type === "csv_upload"
  ) {
    return "uploaded_bank_files";
  }
  if (input.provider === "manual") return "manual_account_related";
  if (input.provider === "plaid" || input.provider === "basiq") {
    return "connected_bank";
  }
  return "unknown";
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("external_connections")
      .select(
        "id,household_id,user_id,provider,status,display_name,last_sync_at,created_at,updated_at,provider_institution_name,institution_name,item_id,metadata"
      )
      .eq("household_id", householdId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const connections = await Promise.all(
      (data ?? []).map(async (connection) => {
        const provider = normalizeProvider(connection.provider);
        const status = typeof connection.status === "string" ? connection.status.trim() : "";
        const source_kind = connectionSourceKind({
          provider,
          status,
          metadata: metadataRecord(connection.metadata),
        });
        const can_refresh_after_consent =
          provider === "basiq" &&
          status === "needs_auth" &&
          hasBasiqConsentMetadata(connection.item_id);
        const { item_id: _itemId, metadata: _metadata, ...safeConnection } = connection;
        void _itemId;
        void _metadata;

        if (provider !== "manual") {
          return {
            ...safeConnection,
            source_kind,
            can_refresh_after_consent,
            linked_account_count: null,
            linked_transaction_count: null,
          };
        }

        const [accountResult, transactionResult] = await Promise.all([
          supabase
            .from("accounts")
            .select("id", { count: "exact", head: true })
            .eq("household_id", householdId)
            .eq("connection_id", connection.id),
          supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("household_id", householdId)
            .or(
              `connection_id.eq.${connection.id},external_connection_id.eq.${connection.id}`
            ),
        ]);

        if (accountResult.error) throw accountResult.error;
        if (transactionResult.error) throw transactionResult.error;

        return {
          ...safeConnection,
          source_kind,
          can_refresh_after_consent,
          linked_account_count: accountResult.count ?? 0,
          linked_transaction_count: transactionResult.count ?? 0,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      connections,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Connections fetch failed") },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const { data: hm, error: hmErr } = await supabase
      .from("household_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("household_id", householdId)
      .maybeSingle();

    if (hmErr) throw hmErr;

    const { data: ownerCheck, error: ownerCheckErr } = await supabase.rpc(
      "is_household_owner_or_editor",
      {
        p_household_id: householdId,
      }
    );

    if (ownerCheckErr) {
      return NextResponse.json(
        {
          ok: false,
          error: ownerCheckErr.message,
          debug: {
            step: "rpc_is_household_owner_or_editor_failed",
            household_id: householdId,
            auth_user_id: user.id,
            household_role: hm?.role ?? null,
          },
        },
        { status: 500 }
      );
    }

    if (!isOwnerOrEditor(hm?.role) || ownerCheck !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: "Not allowed to add connections for this household (need owner/editor).",
          debug: {
            step: "preflight_failed",
            household_id: householdId,
            auth_user_id: user.id,
            household_role: hm?.role ?? null,
            owner_check: ownerCheck ?? null,
          },
        },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const provider = normalizeProvider(body?.provider);
    const status = connectionStatusForProvider(provider);
    const display_name =
      typeof body?.display_name === "string"
        ? body.display_name
        : defaultDisplayName(provider);
    const currency = typeof body?.currency === "string" ? body.currency : "AUD";

    if (provider === "basiq") {
      const { data: existingRows, error: existingErr } = await supabase
        .from("external_connections")
        .select("id,household_id,user_id,provider,status,display_name,created_at,updated_at")
        .eq("household_id", householdId)
        .eq("provider", "basiq")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);

      if (existingErr) throw existingErr;

      const active = (existingRows ?? []).find(
        (row) =>
          typeof row?.status === "string" &&
          row.status.trim().toLowerCase() === "active"
      );

      if (active) {
        return NextResponse.json({
          ok: true,
          household_id: householdId,
          connection: active,
          seeded_accounts: [],
        });
      }

      const reusable = (existingRows ?? []).find((row) =>
        isReusableBasiqStatus(row?.status)
      );

      if (reusable) {
        if (reusable.status !== "needs_auth") {
          const { error: reuseUpdateErr } = await supabase
            .from("external_connections")
            .update({
              status: "needs_auth",
              display_name: display_name ?? reusable.display_name ?? defaultDisplayName("basiq"),
              updated_at: new Date().toISOString(),
              last_error: null,
              last_error_at: null,
            })
            .eq("id", reusable.id)
            .eq("household_id", householdId);

          if (reuseUpdateErr) throw reuseUpdateErr;
        }

        const { data: refreshedReusable, error: refreshedErr } = await supabase
          .from("external_connections")
          .select("id,household_id,user_id,provider,status,display_name,created_at")
          .eq("id", reusable.id)
          .eq("household_id", householdId)
          .maybeSingle();

        if (refreshedErr) throw refreshedErr;

        return NextResponse.json({
          ok: true,
          household_id: householdId,
          connection: refreshedReusable ?? reusable,
          seeded_accounts: [],
        });
      }
    }

    const { data: connection, error: connErr } = await supabase
      .from("external_connections")
      .insert({
        household_id: householdId,
        user_id: user.id,
        provider,
        status,
        display_name,
        provider_connection_id: null,
        encrypted_access_token: null,
      })
      .select("id,household_id,user_id,provider,status,display_name,created_at")
      .maybeSingle();

    if (connErr) {
      return NextResponse.json(
        {
          ok: false,
          error: connErr.message,
          debug: {
            step: "insert_external_connections_failed",
            household_id: householdId,
            auth_user_id: user.id,
            household_role: hm?.role ?? null,
            owner_check: ownerCheck ?? null,
            provider,
            status,
          },
        },
        { status: 500 }
      );
    }

    const { count: existingCount, error: countErr } = await supabase
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .eq("archived", false);

    if (countErr) throw countErr;

    let seeded_accounts: unknown[] = [];

    if (provider === "manual" && (existingCount ?? 0) === 0) {
      const seed = [
        { name: "Everyday Spending", type: "cash" },
        { name: "Bills Buffer", type: "cash" },
        { name: "Savings", type: "cash" },
      ];

      const rows = seed.map((s) => ({
        user_id: user.id,
        household_id: householdId,
        provider,
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
        .select(
          "id,user_id,household_id,name,provider,type,status,currency,current_balance_cents,updated_at,created_at"
        );

      if (seedErr) throw seedErr;
      seeded_accounts = created ?? [];
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      connection,
      seeded_accounts,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: errorMessage(e, "Connection create failed") },
      { status: 500 }
    );
  }
}
