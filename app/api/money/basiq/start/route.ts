// app/api/money/basiq/start/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { basiqFetch, getBasiqClientToken } from "@/lib/money/providers/basiq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemIdPayload = {
  basiq_user_id: string;
  basiq_authlink_id?: string; // legacy; not used now
};

type BasiqConnectionRow = {
  id: string;
  household_id: string;
  provider: string;
  status: string;
  item_id: string | null;
  display_name: string | null;
};

function safeJsonParse<T>(input: unknown): T | null {
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

function jsonStringifyStable(v: unknown) {
  return JSON.stringify(v);
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function isReusableBasiqStatus(status: unknown) {
  const s = safeStr(status).toLowerCase();
  return s === "needs_auth" || s === "error";
}

function isOwnerOrEditor(role: unknown) {
  const r = safeStr(role).toLowerCase();
  return r === "owner" || r === "editor";
}

function tryParseBasiqError(rawMsg: string) {
  const firstBrace = rawMsg.indexOf("{");
  const lastBrace = rawMsg.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = rawMsg.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(slice);
      const correlationId =
        typeof parsed?.correlationId === "string" ? parsed.correlationId : undefined;
      const code =
        typeof parsed?.data?.[0]?.code === "string" ? parsed.data[0].code : undefined;
      const title =
        typeof parsed?.data?.[0]?.title === "string" ? parsed.data[0].title : undefined;
      const detail =
        typeof parsed?.data?.[0]?.detail === "string" ? parsed.data[0].detail : undefined;

      return { correlationId, code, title, detail };
    } catch {
      // ignore
    }
  }
  return { correlationId: undefined, code: undefined, title: undefined, detail: undefined };
}

function envDiag() {
  const raw = (process.env.BASIQ_API_KEY || "").trim();
  return {
    hasBasiqKey: Boolean(raw),
    basiqKeyLen: raw.length,
    basiqKeyLooksPrefixedBasic: raw.toLowerCase().startsWith("basic "),
    basiqBaseUrl: (process.env.BASIQ_BASE_URL || "https://au-api.basiq.io").trim(),
    basiqVersion: (process.env.BASIQ_VERSION || "3.0").trim(),
    nodeEnv: process.env.NODE_ENV || "",
    vercelEnv: process.env.VERCEL_ENV || "",
    vercelRegion: process.env.VERCEL_REGION || "",
    vercelCommit: process.env.VERCEL_GIT_COMMIT_SHA || "",
  };
}

function resolveSiteBaseFromRequest(req: Request) {
  const preferred = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (preferred) {
    try {
      return new URL(preferred).origin;
    } catch {
      // fallback below
    }
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://life-cfo.com";
  }
}

function unwrapBasiq(e: any): {
  stage?: string;
  status?: number;
  basiq?: { correlationId?: string; code?: string; title?: string; detail?: string };
  message: string;
} {
  const message = e?.message ?? String(e);
  const stage = typeof e?.stage === "string" ? e.stage : undefined;
  const status = typeof e?.status === "number" ? e.status : undefined;

  const basiqObj =
    e?.basiq && typeof e.basiq === "object"
      ? {
          correlationId:
            typeof e.basiq.correlationId === "string" ? e.basiq.correlationId : undefined,
          code: typeof e.basiq.code === "string" ? e.basiq.code : undefined,
          title: typeof e.basiq.title === "string" ? e.basiq.title : undefined,
          detail: typeof e.basiq.detail === "string" ? e.basiq.detail : undefined,
        }
      : undefined;

  return {
    stage,
    status,
    basiq: basiqObj ?? tryParseBasiqError(message),
    message,
  };
}

async function persistItemId(
  supabase: any,
  connectionId: string,
  householdId: string,
  payload: ItemIdPayload,
  status?: string
) {
  const update: any = { item_id: jsonStringifyStable(payload) };
  if (status) update.status = status;

  const { error } = await supabase
    .from("external_connections")
    .update(update)
    .eq("id", connectionId)
    .eq("household_id", householdId);

  if (error) throw error;
}

async function normalizeReusableBasiqConnection(
  supabase: any,
  connection: BasiqConnectionRow
): Promise<BasiqConnectionRow> {
  if (safeStr(connection.status).toLowerCase() !== "error") {
    return connection;
  }

  const { data, error } = await supabase
    .from("external_connections")
    .update({
      status: "needs_auth",
      last_error: null,
      last_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("household_id", connection.household_id)
    .select("id, household_id, provider, status, item_id, display_name")
    .maybeSingle();

  if (error) throw error;
  return (data ?? connection) as BasiqConnectionRow;
}

async function findReusableBasiqConnection(
  supabase: any,
  householdId: string
): Promise<BasiqConnectionRow | null> {
  const { data, error } = await supabase
    .from("external_connections")
    .select("id, household_id, provider, status, item_id, display_name")
    .eq("household_id", householdId)
    .eq("provider", "basiq")
    .in("status", ["needs_auth", "error"])
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as BasiqConnectionRow;
}

async function assertCanCreateConnection(supabase: any, userId: string, householdId: string) {
  const { data: hm, error: hmErr } = await supabase
    .from("household_members")
    .select("role")
    .eq("user_id", userId)
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
    throw new Error(ownerCheckErr.message || "Could not verify household permissions.");
  }

  if (!isOwnerOrEditor(hm?.role) || ownerCheck !== true) {
    throw new Error("Not allowed to add connections for this household (need owner/editor).");
  }
}

async function createBasiqConnection(
  supabase: any,
  userId: string,
  householdId: string
): Promise<BasiqConnectionRow> {
  await assertCanCreateConnection(supabase, userId, householdId);

  const { data, error } = await supabase
    .from("external_connections")
    .insert({
      household_id: householdId,
      user_id: userId,
      provider: "basiq",
      status: "needs_auth",
      display_name: "Bank connection (AU)",
      provider_connection_id: null,
      encrypted_access_token: null,
    })
    .select("id, household_id, provider, status, item_id, display_name")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Failed to create Basiq connection.");
  return data as BasiqConnectionRow;
}

async function resolveBasiqConnectionForStart(params: {
  supabase: any;
  userId: string;
  householdId: string;
  requestedConnectionId: string;
}) {
  const { supabase, userId, householdId, requestedConnectionId } = params;
  const requestedId = safeStr(requestedConnectionId);

  if (requestedId) {
    const { data, error } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status, item_id, display_name")
      .eq("id", requestedId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (error) throw error;

    if (data && safeStr(data.provider).toLowerCase() === "basiq") {
      const current = data as BasiqConnectionRow;
      if (isReusableBasiqStatus(current.status)) {
        return normalizeReusableBasiqConnection(supabase, current);
      }
      return current;
    }
  }

  const reusable = await findReusableBasiqConnection(supabase, householdId);
  if (reusable) {
    return normalizeReusableBasiqConnection(supabase, reusable);
  }

  return createBasiqConnection(supabase, userId, householdId);
}

export async function POST(req: Request) {
  const diag = envDiag();

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

    const body = await req.json().catch(() => ({}));
    const requestedConnectionId =
      typeof body?.connection_id === "string" ? body.connection_id : "";
    const conn = await resolveBasiqConnectionForStart({
      supabase,
      userId: user.id,
      householdId,
      requestedConnectionId,
    });
    const connectionId = conn.id;

    let payload = safeJsonParse<ItemIdPayload>(conn.item_id) ?? null;

    // Ensure Basiq user exists
    let basiqUserId = payload?.basiq_user_id ?? "";

    if (!basiqUserId) {
      const email =
        typeof user.email === "string" && user.email.includes("@")
          ? user.email
          : `${user.id}@users.life-cfo.local`;

      let created: any;
      try {
        created = await basiqFetch("/users", {
          method: "POST",
          body: JSON.stringify({
            email,
            mobile: null,
            firstName: null,
            lastName: null,
          }),
        });
      } catch (e: any) {
        const u = unwrapBasiq(e);
        return NextResponse.json(
          {
            ok: false,
            step: u.stage || "create_user",
            status: u.status,
            error: u.message,
            basiq: u.basiq,
            diag,
          },
          { status: 500 }
        );
      }

      basiqUserId = String(created?.id || "");
      if (!basiqUserId) {
        return NextResponse.json(
          { ok: false, step: "create_user", error: "Basiq user create failed (missing id).", diag },
          { status: 500 }
        );
      }

      // Persist basiq_user_id immediately so repeated clicks don't create spam users
      payload = { basiq_user_id: basiqUserId };
      await persistItemId(supabase, connectionId, householdId, payload, "needs_auth");
    }

    // Create CLIENT_ACCESS token bound to userId, then redirect user to Consent UI
    // Basiq quickstart: scope=CLIENT_ACCESS + userId, then:
    // https://consent.basiq.io/home?token=<client_token> :contentReference[oaicite:1]{index=1}
    let clientToken = "";
    try {
      clientToken = await getBasiqClientToken(basiqUserId);
    } catch (e: any) {
      const u = unwrapBasiq(e);
      return NextResponse.json(
        {
          ok: false,
          step: u.stage || "token:client",
          status: u.status,
          error: u.message,
          basiq: u.basiq,
          basiq_user_id: basiqUserId,
          diag,
        },
        { status: 500 }
      );
    }

    const siteBase = resolveSiteBaseFromRequest(req);
    const returnUrl = `${siteBase}/api/money/basiq/return?connection_id=${encodeURIComponent(
      connectionId
    )}`;

    const consent = new URL("https://consent.basiq.io/home");
    consent.searchParams.set("token", clientToken);
    // Different Basiq consent builds have used different callback param names.
    consent.searchParams.set("redirect_uri", returnUrl);
    consent.searchParams.set("redirectUri", returnUrl);
    consent.searchParams.set("returnUrl", returnUrl);
    const consentUrl = consent.toString();

    // Keep connection in needs_auth until we get jobs/connections back from consent journey
    await persistItemId(
      supabase,
      connectionId,
      householdId,
      { basiq_user_id: basiqUserId },
      "needs_auth"
    );

    return NextResponse.json({
      ok: true,
      connection_id: connectionId,
      basiq_user_id: basiqUserId,
      consent_url: consentUrl,
      diag,
    });
  } catch (e: any) {
    const u = unwrapBasiq(e);

    return NextResponse.json(
      {
        ok: false,
        step: u.stage || "unknown",
        status: u.status,
        error: u.message,
        basiq: u.basiq,
        diag,
      },
      { status: 500 }
    );
  }
}
