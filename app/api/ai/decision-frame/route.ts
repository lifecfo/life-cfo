// app/api/ai/decision-frame/route.ts
import { NextResponse } from "next/server";
import { AiDisabledError, generateAiText } from "@/lib/ai/provider";
import { AiDailyLimitError, AiUsageUnavailableError } from "@/lib/ai/usageLimit";
import { isAiEnabled } from "@/lib/ai/aiFlag";
import { FACTUAL_SYSTEM_PROMPT } from "@/lib/ai/factualPrompt";
import { AI_OFF_MESSAGE, aiAskOptedIn } from "@/lib/ai/optIn";
import { guardAiInput } from "@/lib/ask/askGuard";
import { AI_OUTPUT_REFUSAL } from "@/lib/ai/outputGuard";
import { maybeCrisisIntercept } from "@/lib/safety/guard";
import {
  readLimitedJson,
  requireAuthenticatedAiUser,
  requireLegalAcceptance,
} from "@/lib/ai/routeSecurity";

export const dynamic = "force-dynamic";

const VERSION = "decision-frame-route:v2026-02-18-001";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 8_000;

type FrameResult = {
  title: string;
  statement: string;
  what_im_hearing: string;
  questions: string[];
  factors: string[];
  review_on: string | null;
};

function safeString(x: unknown) {
  return typeof x === "string" ? x : "";
}

function safeArray(x: unknown) {
  return Array.isArray(x) ? x.filter((v) => typeof v === "string") : [];
}

function titleFromStatement(statement: string) {
  const s = (statement || "").trim().replace(/\s+/g, " ");
  if (!s) return "Untitled";
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

function stripCodeFences(s: string) {
  let t = (s ?? "").trim();
  if (!t) return t;
  // remove ```json ... ``` or ``` ... ```
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return t;
}

function coerceFrame(text: string, parsed: Record<string, unknown>): FrameResult {
  const fallbackTitle = titleFromStatement(text);

  const title = safeString(parsed?.title).trim() || fallbackTitle;
  const statement = safeString(parsed?.statement).trim() || text;

  const what_im_hearing = safeString(parsed?.what_im_hearing).trim();
  const questions = safeArray(parsed?.questions)
    .map((q) => String(q).trim())
    .filter(Boolean)
    .slice(0, 5);
  const factors = safeArray(parsed?.factors)
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 8);
  const reviewRaw = safeString(parsed?.review_on).trim();
  const review_on = /^\d{4}-\d{2}-\d{2}$/.test(reviewRaw) ? reviewRaw : null;

  return {
    title: title.length > 90 ? `${title.slice(0, 87)}…` : title,
    statement,
    what_im_hearing,
    questions,
    factors,
    review_on,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedAiUser();
    if (!auth.ok) return auth.response;

    const legal = await requireLegalAcceptance(auth.supabase, auth.user.id);
    if (!legal.ok) return legal.response;

    const parsedBody = await readLimitedJson(req, MAX_REQUEST_BYTES);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    const text = safeString(body?.text).trim();

    if (!text) {
      return NextResponse.json({ error: "Missing text.", version: VERSION }, { status: 400 });
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: "That was too much text to send at once.", version: VERSION },
        { status: 413 }
      );
    }

    // Safety intercept (same pattern as conversation route)
    const intercept = maybeCrisisIntercept(text);
    if (intercept) {
      const frame: FrameResult = {
        title: titleFromStatement(text),
        statement: text,
        what_im_hearing: intercept.content,
        questions: [],
        factors: [],
        review_on: null,
      };
      return NextResponse.json({ frame, kind: intercept.kind, version: VERSION }, { headers: { "x-keystone-ai-version": VERSION } });
    }

    const guarded = guardAiInput(text, "frame_decision");
    if (!guarded.allowed) {
      const frame: FrameResult = {
        title: titleFromStatement(text),
        statement: text,
        what_im_hearing: guarded.message,
        questions: [],
        factors: [],
        review_on: null,
      };
      return NextResponse.json({ frame, version: VERSION });
    }
    const optedIn = await aiAskOptedIn(auth.supabase, auth.user.id);
    if (!optedIn || !isAiEnabled()) {
      const frame: FrameResult = {
        title: titleFromStatement(text),
        statement: text,
        what_im_hearing: text,
        questions: [],
        factors: [],
        review_on: null,
      };
      return NextResponse.json({ frame, version: VERSION, ai: "off", message: AI_OFF_MESSAGE });
    }

    const system = [
      FACTUAL_SYSTEM_PROMPT,
      "",
      "Task: restate the person's messy note as one decision statement.",
      "Return ONLY valid JSON (no markdown, no code fences, no extra keys).",
      "",
      "Schema:",
      `{`,
      `  "title": "string (<= 90 chars)",`,
      `  "statement": "string (one sentence if possible)",`,
      `  "what_im_hearing": "string (their words, restated)",`,
      `  "factors": ["factors they already named"],`,
      `  "questions": ["questions they already raised"],`,
      `  "review_on": "YYYY-MM-DD or null"`,
      `}`,
      "",
      "Do not choose an option. Do not add a question they did not raise. Set review_on only if they named a date.",
    ].join("\n");

    const userContent = [
      "User input:",
      `"""${text}"""`,
      "",
      "Return ONLY the JSON.",
    ].join("\n");

    let rawText: string;
    try {
      rawText = stripCodeFences(await generateAiText({
        purpose: "decision_frame",
        userId: auth.user.id,
        allowOverseasDisclosure: true,
        system,
        prompt: userContent,
        temperature: 0.2,
        maxOutputTokens: 480,
      }));
    } catch (error) {
      if (error instanceof AiDailyLimitError || error instanceof AiUsageUnavailableError) {
        return NextResponse.json({ error: error.message, version: VERSION }, { status: 429 });
      }
      if (error instanceof AiDisabledError) {
        const frame: FrameResult = {
          title: titleFromStatement(text),
          statement: text,
          what_im_hearing: text,
          questions: [],
          factors: [],
          review_on: null,
        };
        return NextResponse.json({ frame, version: VERSION, ai: "off", message: AI_OFF_MESSAGE });
      }
      throw error;
    }

    if (rawText === AI_OUTPUT_REFUSAL) {
      const frame: FrameResult = {
        title: titleFromStatement(text),
        statement: text,
        what_im_hearing: rawText,
        questions: [],
        factors: [],
        review_on: null,
      };
      return NextResponse.json({ frame, refused: true, version: VERSION });
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      const value: unknown = JSON.parse(rawText);
      parsed = value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      // salvage attempt: find first { ... } block
      const m = rawText.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const value: unknown = JSON.parse(m[0]);
          parsed = value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
        } catch {
          parsed = null;
        }
      }
    }

    const frame: FrameResult = parsed
      ? coerceFrame(text, parsed)
      : {
          title: titleFromStatement(text),
          statement: text,
          what_im_hearing: text,
          questions: [],
          factors: [],
          review_on: null,
        };

    return NextResponse.json({ frame, version: VERSION }, { headers: { "x-keystone-ai-version": VERSION } });
  } catch {
    console.error("ai_route_failed", { route: "decision-frame", code: "unexpected_error" });
    return NextResponse.json({ error: "Frame failed.", version: VERSION }, { status: 500 });
  }
}
