// app/api/money/plaid/link/route.ts
import { NextResponse } from "next/server";
import { CountryCode, Products } from "plaid";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getPlaidClient, getPlaidConfig, getPlaidDiag } from "@/lib/money/plaidClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toPlaidProducts(values: string[]): Products[] {
  return values
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .map((v) => v as Products);
}

function toPlaidCountryCodes(values: string[]): CountryCode[] {
  return values
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
    .map((v) => v as CountryCode);
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
    const connectionId =
      typeof body?.connection_id === "string" ? body.connection_id.trim() : "";

    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "Missing connection_id.", diag },
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
        { ok: false, error: "Connection not found.", diag },
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
    const cfg = getPlaidConfig();

    const response = await plaid.linkTokenCreate({
      user: {
        client_user_id: user.id,
      },
      client_name: "Life CFO",
      products: toPlaidProducts(cfg.products),
      country_codes: toPlaidCountryCodes(cfg.countryCodes),
      language: "en",
      redirect_uri: cfg.redirectUri || undefined,
      webhook: undefined,
    });

    return NextResponse.json({
      ok: true,
      connection_id: connectionId,
      link_token: response.data.link_token,
      expiration: response.data.expiration,
      diag,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.response?.data?.error_message || e?.message || "Plaid link token create failed",
        plaid_error: e?.response?.data ?? null,
        diag,
      },
      { status: 500 }
    );
  }
}