import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ✅ Strict schema the model must follow
const DecisionAnalysisSchema = z.object({
  decision_type: z.enum(["spending", "time", "relationship", "health", "other"]),
  stakes: z.enum(["low", "medium", "high"]),
  reversible: z.boolean(),
  time_horizon: z.enum(["today", "this_week", "ongoing"]),
  suggested_default: z.enum(["decide_now", "delay", "gather_info"]),
  reasoning: z.string(),
  key_questions: z.array(z.string()).max(5),

  // ✅ NEW: numeric cadence for DB trigger + backfill
  // Keep this integer stable; UI can ignore it if you want.
  suggested_default_review_days: z.number().int().min(1).max(365),
});

export type DecisionAnalysis = z.infer<typeof DecisionAnalysisSchema>;

function clampDays(n: number) {
  return Math.max(3, Math.min(365, Math.round(n)));
}

// Deterministic cadence rules (so your DB trigger can rely on it)
function computeSuggestedReviewDays(analysis: {
  stakes: "low" | "medium" | "high";
  suggested_default: "decide_now" | "delay" | "gather_info";
}) {
  const { stakes, suggested_default } = analysis;

  let base =
    stakes === "high" ? 14 :
    stakes === "medium" ? 30 :
    stakes === "low" ? 90 :
    30;

  // If you need to gather info, review soon
  if (suggested_default === "gather_info") base = Math.min(base, 7);

  // If AI suggests delay, push the review a bit further out
  if (suggested_default === "delay") base = base + 14;

  return clampDays(base);
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY missing in .env.local" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title ?? "").trim();
    const details = body?.body == null ? "" : String(body.body);
    const type = String(body?.type ?? "").trim();
    const severity =
      body?.severity == null || Number.isNaN(Number(body.severity))
        ? null
        : Number(body.severity);

    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    // Structured Outputs via json_schema requires supported snapshots
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini-2024-07-18";

    const system = `
You are a helpful decision analyst for a personal finance/life app.
Return a structured analysis that matches the provided schema.
Rules:
- Keep reasoning short (1-3 sentences).
- key_questions: 0 to 5 items max.
- Use the provided title/details/type/severity as hints, but don't invent facts.
- suggested_default_review_days must be a reasonable integer number of days (1-365).
`.trim();

    const user = `
Title: ${title}
Details: ${details || "(none)"}
Inbox type: ${type || "(unknown)"}
Priority(severity): ${severity ?? "(null)"}
`.trim();

    // ✅ responses.parse enforces the schema and gives you output_parsed
    const response = await openai.responses.parse({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      text: {
        format: zodTextFormat(DecisionAnalysisSchema, "analysis"),
      },
      temperature: 0.2,
      max_output_tokens: 400,
    });

    const analysis = response.output_parsed;

    if (!analysis) {
      return NextResponse.json(
        { error: "No structured output returned" },
        { status: 500 }
      );
    }

    // ✅ Safety: ensure suggested_default_review_days is stable + deterministic
    // (even if the model returns something weird, we override with our rules)
    const computedDays = computeSuggestedReviewDays({
      stakes: analysis.stakes,
      suggested_default: analysis.suggested_default,
    });

    const finalAnalysis: DecisionAnalysis = {
      ...analysis,
      suggested_default_review_days: computedDays,
    };

    return NextResponse.json({ analysis: finalAnalysis });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Analysis failed" },
      { status: 500 }
    );
  }
}
