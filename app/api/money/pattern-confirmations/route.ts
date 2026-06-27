import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmationSchema = z.object({
  pattern_key: z.string().trim().min(1).max(500),
  kind: z.enum(["bill", "income", "transfer", "ignore"]),
  label: z.string().trim().max(160).nullable().optional(),
  amount_cents: z.number().int().safe().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).max(12).optional().default("AUD"),
  cadence: z.string().trim().max(40).nullable().optional(),
  confidence: z.string().trim().max(40).nullable().optional(),
  source_provider: z.string().trim().max(120).nullable().optional(),
  first_seen_at: z.string().trim().nullable().optional(),
  last_seen_at: z.string().trim().nullable().optional(),
});

const deleteConfirmationSchema = z.object({
  pattern_key: z.string().trim().min(1).max(500),
});

function isOwnerOrEditor(role: unknown): boolean {
  return role === "owner" || role === "editor";
}

function nullableText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function nullableTimestamp(value: string | null | undefined): string | null {
  const text = nullableText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error("invalid_timestamp");
  return new Date(timestamp).toISOString();
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const [{ data: membership, error: membershipError }, ownerCheckResult] = await Promise.all([
      supabase
        .from("household_members")
        .select("role")
        .eq("household_id", householdId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("is_household_owner_or_editor", { p_household_id: householdId }),
    ]);

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!isOwnerOrEditor(membership?.role) || ownerCheckResult.data !== true) {
      return NextResponse.json(
        { ok: false, error: "Only a household owner or editor can save this." },
        { status: 403 }
      );
    }

    const parsed = confirmationSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "That confirmation could not be saved." },
        { status: 400 }
      );
    }

    let firstSeenAt: string | null;
    let lastSeenAt: string | null;
    try {
      firstSeenAt = nullableTimestamp(parsed.data.first_seen_at);
      lastSeenAt = nullableTimestamp(parsed.data.last_seen_at);
    } catch {
      return NextResponse.json(
        { ok: false, error: "The pattern dates were not valid." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: confirmation, error: upsertError } = await supabase
      .from("transaction_pattern_confirmations")
      .upsert(
        {
          household_id: householdId,
          pattern_key: parsed.data.pattern_key,
          kind: parsed.data.kind,
          label: nullableText(parsed.data.label),
          amount_cents: parsed.data.amount_cents ?? null,
          currency: parsed.data.currency.toUpperCase(),
          cadence: nullableText(parsed.data.cadence),
          confidence: nullableText(parsed.data.confidence),
          source_provider: nullableText(parsed.data.source_provider),
          first_seen_at: firstSeenAt,
          last_seen_at: lastSeenAt,
          created_by: user.id,
          updated_at: now,
        },
        { onConflict: "household_id,pattern_key" }
      )
      .select(
        "id,pattern_key,kind,label,amount_cents,currency,cadence,confidence,source_provider,first_seen_at,last_seen_at,created_at,updated_at"
      )
      .single();

    if (upsertError) throw upsertError;

    return NextResponse.json({ ok: true, confirmation });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Pattern confirmation failed";
    console.error("pattern_confirmation_failed", { message });
    return NextResponse.json(
      { ok: false, error: "We could not save that just now." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const [{ data: membership, error: membershipError }, ownerCheckResult] = await Promise.all([
      supabase
        .from("household_members")
        .select("role")
        .eq("household_id", householdId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("is_household_owner_or_editor", { p_household_id: householdId }),
    ]);

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!isOwnerOrEditor(membership?.role) || ownerCheckResult.data !== true) {
      return NextResponse.json(
        { ok: false, error: "Only a household owner or editor can change this." },
        { status: 403 }
      );
    }

    const parsed = deleteConfirmationSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "That pattern could not be put back for review." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from("transaction_pattern_confirmations")
      .delete()
      .eq("household_id", householdId)
      .eq("pattern_key", parsed.data.pattern_key);

    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Pattern reset failed";
    console.error("pattern_confirmation_delete_failed", { message });
    return NextResponse.json(
      { ok: false, error: "We could not put that back for review just now." },
      { status: 500 }
    );
  }
}
