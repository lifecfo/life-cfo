import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createDecisionSchema = z.object({
  title: z.string().trim().min(1).max(240),
  context: z.string().trim().max(20000).nullable().optional(),
  decision_context: z.record(z.string(), z.unknown()).nullable().optional(),
  ai_summary: z.string().trim().max(10000).nullable().optional(),
  ai_json: z.record(z.string(), z.unknown()).nullable().optional(),
  confidence_level: z.number().int().nullable().optional(),
  user_reasoning: z.string().trim().max(10000).nullable().optional(),
  pinned: z.boolean().optional(),
});

function isOwnerOrEditor(role: unknown): boolean {
  return role === "owner" || role === "editor";
}

function nullableText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Please sign in again before saving this decision." },
        { status: 401 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "Choose an active household before saving this decision." },
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
        { ok: false, error: "Only a household owner or editor can save this decision." },
        { status: 403 }
      );
    }

    const parsed = createDecisionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Life CFO couldn’t save this decision yet. Please check it and try again." },
        { status: 400 }
      );
    }

    const { data: decision, error: insertError } = await supabase
      .from("decisions")
      .insert({
        user_id: user.id,
        household_id: householdId,
        title: parsed.data.title,
        context: nullableText(parsed.data.context),
        decision_context: parsed.data.decision_context ?? null,
        ai_summary: nullableText(parsed.data.ai_summary),
        ai_json: parsed.data.ai_json ?? null,
        confidence_level: parsed.data.confidence_level ?? null,
        user_reasoning: nullableText(parsed.data.user_reasoning),
        pinned: parsed.data.pinned ?? false,
        status: "open",
        origin: "decisions",
        decided_at: null,
        framed_at: new Date().toISOString(),
        review_at: null,
      })
      .select("id")
      .single();

    if (insertError || !decision?.id) {
      throw insertError ?? new Error("Decision insert returned no id.");
    }

    return NextResponse.json({ ok: true, decision: { id: decision.id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Decision creation failed";
    console.error("decision_create_failed", { message });
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t save this decision yet. Please try again." },
      { status: 500 }
    );
  }
}
