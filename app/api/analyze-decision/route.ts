import { NextResponse } from "next/server";
import { z } from "zod";
import { AiDisabledError, AiOutputBlockedError, generateAiStructured } from "@/lib/ai/provider";
import { AiDailyLimitError, AiUsageUnavailableError } from "@/lib/ai/usageLimit";
import { isAiEnabled } from "@/lib/ai/aiFlag";
import { FACTUAL_SYSTEM_PROMPT } from "@/lib/ai/factualPrompt";
import { AI_OFF_MESSAGE, aiAskOptedIn } from "@/lib/ai/optIn";
import { guardAiInput } from "@/lib/ask/askGuard";
import {
  readLimitedJson,
  requireAuthenticatedAiUser,
} from "@/lib/ai/routeSecurity";

const MAX_REQUEST_BYTES = 24 * 1024;
const MAX_TITLE_LENGTH = 500;
const MAX_BODY_LENGTH = 12_000;
const MAX_TYPE_LENGTH = 100;

const DecisionAnalysisSchema = z.object({
  restatement: z.string(),
  factors: z.array(z.string()).max(8),
  questions: z.array(z.string()).max(8),
  review_on: z.string().nullable(),
});

export type DecisionAnalysis = z.infer<typeof DecisionAnalysisSchema>;

const DecisionAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    restatement: { type: "string" },
    factors: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    review_on: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["restatement", "factors", "questions", "review_on"],
};

function reviewDateOrNull(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return null;
  return trimmed;
}

function deterministicAnalysis(title: string, details: string): DecisionAnalysis {
  const restatement = [title, details].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return {
    restatement,
    factors: [],
    questions: [],
    review_on: null,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedAiUser();
    if (!auth.ok) return auth.response;

    const parsedBody = await readLimitedJson(req, MAX_REQUEST_BYTES);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const title = String(body?.title ?? "").trim();
    const details = body?.body == null ? "" : String(body.body);
    const type = String(body?.type ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    if (
      title.length > MAX_TITLE_LENGTH ||
      details.length > MAX_BODY_LENGTH ||
      type.length > MAX_TYPE_LENGTH
    ) {
      return NextResponse.json(
        { error: "That was too much text to send at once." },
        { status: 413 }
      );
    }

    const guarded = guardAiInput(`${title}\n${details}`, "frame_decision");
    if (!guarded.allowed) {
      return NextResponse.json({
        analysis: {
          restatement: guarded.message,
          factors: [],
          questions: [],
          review_on: null,
        },
        refused: true,
      });
    }

    const optedIn = await aiAskOptedIn(auth.supabase, auth.user.id);
    if (!optedIn || !isAiEnabled()) {
      return NextResponse.json({
        analysis: deterministicAnalysis(title, details),
        ai: "off" as const,
        message: AI_OFF_MESSAGE,
      });
    }

    const system = `
${FACTUAL_SYSTEM_PROMPT}
Return JSON only.
- restatement: the decision in the person's own words. Do not choose an option.
- factors: factors the person already named. Do not add advice.
- questions: questions the person already raised. Do not add what they should ask.
- review_on: an ISO date YYYY-MM-DD only if the person named one, otherwise null.
Do not return decide_now, delay, or gather_info.
`.trim();

    const user = `
Title: ${title}
Details: ${details || "(none)"}
Inbox type: ${type || "(unknown)"}
`.trim();

    try {
      const modelOutput = await generateAiStructured({
        purpose: "decision_analysis",
        userId: auth.user.id,
        allowOverseasDisclosure: true,
        system,
        prompt: user,
        schemaName: "decision_frame_factual",
        schema: DecisionAnalysisJsonSchema,
        temperature: 0.2,
        maxOutputTokens: 400,
      });
      const analysis = DecisionAnalysisSchema.parse(modelOutput);
      return NextResponse.json({
        analysis: {
          restatement: analysis.restatement.trim(),
          factors: analysis.factors.map((item) => item.trim()).filter(Boolean).slice(0, 8),
          questions: analysis.questions.map((item) => item.trim()).filter(Boolean).slice(0, 8),
          review_on: reviewDateOrNull(analysis.review_on),
        },
      });
    } catch (error) {
      if (error instanceof AiDailyLimitError || error instanceof AiUsageUnavailableError) {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
      if (error instanceof AiOutputBlockedError) {
        return NextResponse.json({
          analysis: {
            restatement: error.replacement,
            factors: [],
            questions: [],
            review_on: null,
          },
          refused: true,
        });
      }
      if (error instanceof AiDisabledError) {
        return NextResponse.json({
          analysis: deterministicAnalysis(title, details),
          ai: "off" as const,
          message: AI_OFF_MESSAGE,
        });
      }
      throw error;
    }
  } catch {
    console.error("ai_route_failed", { route: "analyze-decision", code: "unexpected_error" });
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
