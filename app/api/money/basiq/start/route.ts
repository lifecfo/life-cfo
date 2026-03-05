// app/api/money/basiq/start/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { basiqFetch } from "@/lib/money/providers/basiq";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ItemIdPayload = {
  basiq_user_id: string;
  basiq_authlink_id?: string;
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
    const connectionId = typeof body?.connection_id === "string" ? body.connection_id : "";
    if (!connectionId) {
      return NextResponse.json({ ok: false, error: "Missing connection_id" }, { status: 400 });
    }

    const { data: conn, error: connErr } = await supabase
      .from("external_connections")
      .select("id, household_id, provider, status, item_id, display_name")
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connErr) throw connErr;
    if (!conn) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
    if (conn.provider !== "basiq") {
      return NextResponse.json({ ok: false, error: "Not a Basiq connection." }, { status: 400 });
    }

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

    // Create AuthLink (hosted connect flow)
    // NOTE: Basiq commonly uses a user-scoped endpoint for auth link creation.
    let authlink: any;
    try {
      authlink = await basiqFetch(`/users/${basiqUserId}/auth_link`, {
        method: "POST",
        body: JSON.stringify({
          description: `Life CFO (${conn.display_name ?? "Basiq"})`,
        }),
      });
    } catch (e1: any) {
      // Fallback path some setups use
      try {
        authlink = await basiqFetch(`/users/${basiqUserId}/authlink`, {
          method: "POST",
          body: JSON.stringify({
            description: `Life CFO (${conn.display_name ?? "Basiq"})`,
          }),
        });
      } catch {
        const u = unwrapBasiq(e1);

        if (payload?.basiq_user_id) {
          try {
            await persistItemId(supabase, connectionId, householdId, payload, "needs_auth");
          } catch {
            // ignore secondary failure
          }
        }

        return NextResponse.json(
          {
            ok: false,
            step: u.stage || "create_authlink",
            status: u.status,
            error: u.message,
            basiq: u.basiq,
            basiq_user_id: basiqUserId,
            diag,
          },
          { status: 500 }
        );
      }
    }

    const authLinkUrl = String(
      authlink?.link ||
        authlink?.url ||
        authlink?.authLinkUrl ||
        authlink?.data?.link ||
        authlink?.data?.url ||
        ""
    );
    const authLinkId = String(authlink?.id || authlink?.data?.id || "");
    if (!authLinkUrl) {
      return NextResponse.json(
        { ok: false, step: "create_authlink", error: "Basiq authlink create failed (missing link/url).", diag },
        { status: 500 }
      );
    }

    // Persist item_id with authlink id too
    const nextPayload: ItemIdPayload = {
      basiq_user_id: basiqUserId,
      basiq_authlink_id: authLinkId || payload?.basiq_authlink_id,
    };

    await persistItemId(supabase, connectionId, householdId, nextPayload, "needs_auth");

    return NextResponse.json({
      ok: true,
      connection_id: connectionId,
      basiq_user_id: basiqUserId,
      auth_link_url: authLinkUrl,
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