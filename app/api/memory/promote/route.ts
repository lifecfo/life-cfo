import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import type {
  AskCandidatePromotionRequest,
  AskCandidatePromotionResponse,
  AskErrorResponse,
  CandidateType,
  MemoryCandidate,
  PromotionActionType,
} from "@/lib/memory/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown, max = 5000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function asNullableString(value: unknown, max = 5000): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function parseIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isConfidenceLabel(value: unknown): value is MemoryCandidate["confidence"] {
  return value === "low" || value === "medium" || value === "high" || value === "unknown";
}

function isCandidateStatus(value: unknown): value is MemoryCandidate["status"] {
  return value === "draft" || value === "promoted" || value === "dismissed" || value === "expired";
}

function isDecisionStatus(value: unknown): value is "open" | "committed" | "closed" | "archived" {
  return value === "open" || value === "committed" || value === "closed" || value === "archived";
}

function isRevisitTriggerType(value: unknown): value is "time" | "condition" | "manual" {
  return value === "time" || value === "condition" || value === "manual";
}

function isCandidateType(value: unknown): value is CandidateType {
  return (
    value === "insight_candidate" ||
    value === "assumption_candidate" ||
    value === "decision_candidate" ||
    value === "revisit_candidate"
  );
}

function isActionType(value: unknown): value is PromotionActionType {
  return (
    value === "save_insight" ||
    value === "track_assumption" ||
    value === "create_decision" ||
    value === "update_decision" ||
    value === "add_revisit_trigger" ||
    value === "dismiss_candidate"
  );
}

function actionForCandidate(candidateType: CandidateType): PromotionActionType {
  if (candidateType === "decision_candidate") return "create_decision";
  if (candidateType === "insight_candidate") return "save_insight";
  if (candidateType === "revisit_candidate") return "add_revisit_trigger";
  return "track_assumption";
}

function parseMemoryCandidate(candidateRaw: unknown): MemoryCandidate | null {
  if (!isObject(candidateRaw)) return null;
  if (!isCandidateType(candidateRaw.candidate_type)) return null;

  const id = asNonEmptyString(candidateRaw.id, 120);
  const title = asNonEmptyString(candidateRaw.title, 240);
  const summary = asNonEmptyString(candidateRaw.summary, 2000);
  const confidence = candidateRaw.confidence;
  const status = candidateRaw.status;
  const createdAt = parseIso(candidateRaw.created_at);
  const expiresAtRaw = candidateRaw.expires_at;
  const threadId = asNullableString(candidateRaw.thread_id, 120);
  const messageId = asNullableString(candidateRaw.message_id, 120);
  const householdId = asNullableString(candidateRaw.household_id, 120);
  const userId = asNullableString(candidateRaw.user_id, 120);
  const evidenceRefs = candidateRaw.evidence_refs;

  if (!id || !title || !summary || !isConfidenceLabel(confidence) || !isCandidateStatus(status) || !createdAt) {
    return null;
  }
  if (!Array.isArray(evidenceRefs)) return null;

  const expiresAt = expiresAtRaw == null ? null : parseIso(expiresAtRaw);
  if (expiresAtRaw != null && !expiresAt) return null;

  const base = {
    id,
    candidate_type: candidateRaw.candidate_type,
    thread_id: threadId,
    message_id: messageId,
    household_id: householdId,
    user_id: userId,
    title,
    summary,
    confidence,
    status,
    created_at: createdAt,
    expires_at: expiresAt,
    evidence_refs: evidenceRefs,
  };

  const draftRaw = candidateRaw.draft;
  if (!isObject(draftRaw)) return null;

  if (candidateRaw.candidate_type === "insight_candidate") {
    const draftTitle = asNonEmptyString(draftRaw.title, 240);
    const statement = asNonEmptyString(draftRaw.statement, 4000);
    const draftConfidence = draftRaw.confidence;
    if (!draftTitle || !statement || !isConfidenceLabel(draftConfidence)) return null;
    return {
      ...base,
      candidate_type: "insight_candidate",
      draft: {
        title: draftTitle,
        statement,
        confidence: draftConfidence,
      },
    };
  }

  if (candidateRaw.candidate_type === "assumption_candidate") {
    const draftTitle = asNonEmptyString(draftRaw.title, 240);
    const statement = asNonEmptyString(draftRaw.statement, 4000);
    const draftConfidence = draftRaw.confidence;
    if (!draftTitle || !statement || !isConfidenceLabel(draftConfidence)) return null;
    return {
      ...base,
      candidate_type: "assumption_candidate",
      draft: {
        title: draftTitle,
        statement,
        confidence: draftConfidence,
      },
    };
  }

  if (candidateRaw.candidate_type === "decision_candidate") {
    const draftTitle = asNonEmptyString(draftRaw.title, 240);
    const rationale = typeof draftRaw.rationale === "string" ? draftRaw.rationale.slice(0, 4000) : null;
    const decisionStatus = draftRaw.status;
    if (!draftTitle || rationale === null || !isDecisionStatus(decisionStatus)) return null;
    return {
      ...base,
      candidate_type: "decision_candidate",
      draft: {
        title: draftTitle,
        rationale,
        status: decisionStatus,
      },
    };
  }

  if (candidateRaw.candidate_type === "revisit_candidate") {
    const draftTitle = asNonEmptyString(draftRaw.title, 240);
    const triggerType = draftRaw.trigger_type;
    const conditionText = asNullableString(draftRaw.condition_text, 2000);
    const triggerAtRaw = draftRaw.trigger_at;
    const triggerAt = triggerAtRaw == null ? null : parseIso(triggerAtRaw);
    if (!draftTitle || !isRevisitTriggerType(triggerType)) return null;
    if (triggerAtRaw != null && !triggerAt) return null;
    return {
      ...base,
      candidate_type: "revisit_candidate",
      draft: {
        title: draftTitle,
        trigger_type: triggerType,
        condition_text: conditionText,
        trigger_at: triggerAt,
      },
    };
  }

  return null;
}

function parsePromotionRequest(body: unknown): AskCandidatePromotionRequest | null {
  if (!isObject(body)) return null;

  const confirmed = body.confirmed_by_user === true;
  const action = body.action_type;
  const candidate = parseMemoryCandidate(body.candidate);
  const targetRaw = body.target;

  if (!confirmed || !isActionType(action) || !candidate) return null;

  const candidateType = candidate.candidate_type;
  const impliedAction = actionForCandidate(candidateType);
  if (action !== impliedAction) return null;

  const request: AskCandidatePromotionRequest = {
    action_type: action,
    confirmed_by_user: true,
    candidate,
  };

  if (isObject(targetRaw)) {
    const decisionId = asNonEmptyString(targetRaw.decision_id, 120);
    if (decisionId) {
      request.target = { decision_id: decisionId };
    }
  }

  return request;
}

async function ensureHouseholdMember(supabase: Awaited<ReturnType<typeof supabaseRoute>>, userId: string, householdId: string) {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .limit(1);

  if (error) throw error;
  if (!data?.length) throw new Error("Not a member of this household.");
}

async function ensureOwnDecision(supabase: Awaited<ReturnType<typeof supabaseRoute>>, userId: string, decisionId: string) {
  const { data, error } = await supabase
    .from("decisions")
    .select("id")
    .eq("id", decisionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("Decision not found.");
}

function buildDecisionContext(summary: string, rationale: string | null): string {
  const lines = ["Promoted from Ask candidate.", summary];
  if (rationale) lines.push(`Reasoning: ${rationale}`);
  return lines.filter(Boolean).join("\n\n").slice(0, 6000);
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json<AskErrorResponse>({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const parsed = parsePromotionRequest(await req.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json<AskErrorResponse>(
        { ok: false, error: "Invalid promotion request. Explicit confirmation is required." },
        { status: 400 }
      );
    }

    const candidate = parsed.candidate;
    const candidateType = candidate.candidate_type;

    if (candidateType === "assumption_candidate") {
      return NextResponse.json<AskErrorResponse>(
        { ok: false, error: "Assumption promotion is deferred in this thin slice." },
        { status: 409 }
      );
    }

    const activeHouseholdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!activeHouseholdId) {
      return NextResponse.json<AskErrorResponse>(
        { ok: false, error: "User is not linked to a household." },
        { status: 400 }
      );
    }

    await ensureHouseholdMember(supabase, user.id, activeHouseholdId);

    if (candidate.household_id && candidate.household_id !== activeHouseholdId) {
      return NextResponse.json<AskErrorResponse>(
        { ok: false, error: "Candidate household does not match active household." },
        { status: 409 }
      );
    }

    if (candidateType === "decision_candidate") {
      const title = asNonEmptyString(candidate.draft.title, 200) ?? asNonEmptyString(candidate.title, 200);
      const rationale = asNonEmptyString(candidate.draft.rationale, 4000);
      const summary = asNonEmptyString(candidate.summary, 1000) ?? "Promoted from Ask";

      if (!title) {
        return NextResponse.json<AskErrorResponse>(
          { ok: false, error: "Decision candidate is missing a title." },
          { status: 400 }
        );
      }

      const context = buildDecisionContext(summary, rationale);

      const { data, error } = await supabase
        .from("decisions")
        .insert({
          user_id: user.id,
          title,
          context,
          status: "open",
          origin: "ask_promotion",
          decided_at: null,
          framed_at: new Date().toISOString(),
          review_at: null,
        })
        .select("id")
        .single();

      if (error || !data?.id) throw new Error(error?.message || "Failed to create decision.");

      const response: AskCandidatePromotionResponse = {
        ok: true,
        action_type: parsed.action_type,
        candidate_type: candidateType,
        result: {
          kind: "decision",
          id: data.id,
          decision_id: data.id,
        },
      };

      return NextResponse.json(response);
    }

    if (candidateType === "insight_candidate") {
      const decisionId = asNonEmptyString(parsed.target?.decision_id, 120);
      if (!decisionId) {
        return NextResponse.json<AskErrorResponse>(
          { ok: false, error: "Insight promotion currently requires target.decision_id." },
          { status: 409 }
        );
      }

      await ensureOwnDecision(supabase, user.id, decisionId);

      const title = asNonEmptyString(candidate.draft.title, 200) ?? "Ask insight";
      const statement = asNonEmptyString(candidate.draft.statement, 4000) ?? asNonEmptyString(candidate.summary, 800);

      if (!statement) {
        return NextResponse.json<AskErrorResponse>(
          { ok: false, error: "Insight candidate is missing statement text." },
          { status: 400 }
        );
      }

      const summaryText = [`- **Insight:** ${title}`, `- **Statement:** ${statement}`].join("\n");

      const { data, error } = await supabase
        .from("decision_summaries")
        .insert({
          user_id: user.id,
          decision_id: decisionId,
          summary_text: summaryText,
        })
        .select("id")
        .single();

      if (error || !data?.id) throw new Error(error?.message || "Failed to save insight summary.");

      const response: AskCandidatePromotionResponse = {
        ok: true,
        action_type: parsed.action_type,
        candidate_type: candidateType,
        result: {
          kind: "decision_summary",
          id: data.id,
          decision_id: decisionId,
        },
      };

      return NextResponse.json(response);
    }

    if (candidateType === "revisit_candidate") {
      const decisionId = asNonEmptyString(parsed.target?.decision_id, 120);
      if (!decisionId) {
        return NextResponse.json<AskErrorResponse>(
          { ok: false, error: "Revisit promotion currently requires target.decision_id." },
          { status: 409 }
        );
      }

      const triggerType = candidate.draft.trigger_type;
      const triggerAt = parseIso(candidate.draft.trigger_at);

      if (triggerType !== "time" || !triggerAt) {
        return NextResponse.json<AskErrorResponse>(
          { ok: false, error: "Only time-based revisit promotion is supported in this thin slice." },
          { status: 409 }
        );
      }

      await ensureOwnDecision(supabase, user.id, decisionId);

      const { error } = await supabase.from("decisions").update({ review_at: triggerAt }).eq("id", decisionId).eq("user_id", user.id);

      if (error) throw new Error(error.message || "Failed to set review date.");

      const response: AskCandidatePromotionResponse = {
        ok: true,
        action_type: parsed.action_type,
        candidate_type: candidateType,
        result: {
          kind: "decision_review",
          id: decisionId,
          decision_id: decisionId,
        },
      };

      return NextResponse.json(response);
    }

    return NextResponse.json<AskErrorResponse>(
      { ok: false, error: "Candidate type is not promotable in this thin slice." },
      { status: 409 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Promotion failed.";
    return NextResponse.json<AskErrorResponse>({ ok: false, error: message }, { status: 500 });
  }
}
