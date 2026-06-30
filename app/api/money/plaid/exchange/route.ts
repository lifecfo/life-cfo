import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getPlaidClient, getPlaidDiag } from "@/lib/money/plaidClient";
import { encryptPlaidToken } from "@/lib/server/security/plaidTokenCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const diag = getPlaidDiag();

  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in.", diag }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household.", diag },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const connectionId = cleanStr(body?.connection_id);
    const publicToken = cleanStr(body?.public_token);
    const institutionId = cleanStr(body?.institution_id);
    const institutionName = cleanStr(body?.institution_name);

    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "Missing connection_id.", diag },
        { status: 400 }
      );
    }

    if (!publicToken) {
      return NextResponse.json(
        { ok: false, error: "Missing public_token.", diag },
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
        { ok: false, error: "Connection not found.", diag, connection_id: connectionId, household_id: householdId },
        { status: 404 }
      );
    }

    if (connection.provider !== "plaid") {
      return NextResponse.json(
        { ok: false, error: "Not a Plaid connection.", diag },
        { status: 400 }
      );
    }

    const plaid = getPlaidClient();

    const exchange = await plaid.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = cleanStr(exchange.data.access_token);
    const itemId = cleanStr(exchange.data.item_id);

    if (!accessToken || !itemId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Plaid token exchange returned missing access_token or item_id.",
          diag,
        },
        { status: 500 }
      );
    }

    const encryptedAccessToken = encryptPlaidToken(accessToken, {
      provider: "plaid",
      household_id: householdId,
      connection_id: connectionId,
    });

    const update: Record<string, unknown> = {
      status: "active",
      encrypted_access_token: encryptedAccessToken,
      item_id: itemId,
      provider_item_id: itemId,
      provider_connection_id: itemId,
      provider_institution_id: institutionId || null,
      provider_institution_name: institutionName || null,
      institution_id: institutionId || null,
      institution_name: institutionName || null,
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedRow, error: updateErr } = await supabase
      .from("external_connections")
      .update(update)
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .select(
        "id, household_id, provider, status"
      )
      .maybeSingle();

    if (updateErr) throw updateErr;

    if (!updatedRow) {
      return NextResponse.json(
        {
          ok: false,
          error: "Plaid exchange did not update any connection row.",
          diag,
          debug: {
            connection_id: connectionId,
            household_id: householdId,
            matched_connection: connection?.id ?? null,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      connection_id: connectionId,
      institution_id: institutionId || null,
      institution_name: institutionName || null,
      status: updatedRow.status,
      token_stored: true,
    });
  } catch (error: unknown) {
    const code =
      error instanceof Error && error.message.startsWith("plaid_token_")
        ? error.message
        : "plaid_exchange_failed";
    console.error("plaid_exchange_failed", { code });
    return NextResponse.json(
      {
        ok: false,
        error: "Life CFO couldn’t finish this bank connection yet.",
        code,
      },
      { status: 500 }
    );
  }
}
