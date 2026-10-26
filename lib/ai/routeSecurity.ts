import { NextResponse } from "next/server";

import { supabaseRoute } from "@/lib/supabaseRoute";
import { legalPackSha256 } from "@/lib/legal/legalPackHash";

type JsonObject = Record<string, unknown>;

export async function requireAuthenticatedAiUser() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Please sign in again." }, { status: 401 }),
    };
  }

  return { ok: true as const, supabase, user };
}

/**
 * The page/middleware layer already gates product pages on current legal-pack
 * acceptance (lib/supabase/proxy.ts), but /api/* is excluded from that check
 * there. AI output must never reach a user who hasn't accepted the current
 * terms, so AI-calling routes re-check it here rather than relying solely on
 * the UI funnel (a stale tab, replay, or direct call could otherwise skip it).
 */
export async function requireLegalAcceptance(
  supabase: Awaited<ReturnType<typeof supabaseRoute>>,
  userId: string
) {
  const { data: prof, error } = await supabase
    .from("profiles")
    .select("fine_print_accepted_at,fine_print_version,confirmed_adult,confirmed_au_resident")
    .eq("user_id", userId)
    .maybeSingle();

  const accepted =
    !!prof?.fine_print_accepted_at &&
    prof?.fine_print_version === legalPackSha256() &&
    prof?.confirmed_adult === true &&
    prof?.confirmed_au_resident === true;

  if (error || !accepted) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Please accept the current Life CFO terms before using this." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const };
}

export async function readLimitedJson(
  request: Request,
  maxBytes: number
): Promise<
  | { ok: true; value: JsonObject }
  | { ok: false; response: NextResponse }
> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "That was too much text to send at once." },
        { status: 413 }
      ),
    };
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "That was too much text to send at once." },
        { status: 413 }
      ),
    };
  }

  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid_json_object");
    }
    return { ok: true, value: value as JsonObject };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid request." }, { status: 400 }),
    };
  }
}

// TODO(private beta): add distributed, per-user rate limiting at the edge or API gateway.
