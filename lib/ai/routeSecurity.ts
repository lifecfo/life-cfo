import { NextResponse } from "next/server";

import { supabaseRoute } from "@/lib/supabaseRoute";

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
