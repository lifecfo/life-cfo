import { randomUUID } from "node:crypto";
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
  console.info("decision_create_route", { route_reached: true });

  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    const hasAuthenticatedUser = !userError && Boolean(user?.id);

    console.info("decision_create_auth", {
      has_authenticated_user: hasAuthenticatedUser,
    });

    if (!hasAuthenticatedUser || !user?.id) {
      return NextResponse.json(
        {
          ok: false,
          code: "not_authenticated",
          error: "Please sign in again before saving this decision.",
        },
        { status: 401 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    console.info("decision_create_household", {
      active_household_resolved: Boolean(householdId),
    });

    if (!householdId) {
      return NextResponse.json(
        {
          ok: false,
          code: "no_active_household",
          error: "Choose an active household before saving this decision.",
        },
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

    const ownerEditorCheckPassed =
      !membershipError &&
      !ownerCheckResult.error &&
      isOwnerOrEditor(membership?.role) &&
      ownerCheckResult.data === true;

    console.info("decision_create_permission", {
      owner_editor_check_passed: ownerEditorCheckPassed,
    });

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!ownerEditorCheckPassed) {
      return NextResponse.json(
        {
          ok: false,
          code: "not_household_editor",
          error: "Only a household owner or editor can save this decision.",
        },
        { status: 403 }
      );
    }

    const parsed = createDecisionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "invalid_payload",
          error: "Life CFO couldn’t save this decision yet. Please check it and try again.",
        },
        { status: 400 }
      );
    }

    const decisionId = randomUUID();
    const { error: insertError } = await supabase
      .from("decisions")
      .insert({
        id: decisionId,
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
      });

    if (insertError) {
      console.error("decision_create_insert_failed", {
        code: insertError.code ?? null,
        message: insertError.message ?? null,
        details: insertError.details ?? null,
        hint: insertError.hint ?? null,
      });
      return NextResponse.json(
        {
          ok: false,
          code: "decision_insert_failed",
          error: "Life CFO couldn’t save this decision yet. Please try again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, decision: { id: decisionId } });
  } catch {
    console.error("decision_create_unexpected_error", {
      code: "unexpected_error",
    });
    return NextResponse.json(
      {
        ok: false,
        code: "unexpected_error",
        error: "Life CFO couldn’t save this decision yet. Please try again.",
      },
      { status: 500 }
    );
  }
}
