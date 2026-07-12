// app/api/ai/decision-frame/route.ts
import { NextResponse } from "next/server";
import { generateAiText } from "@/lib/ai/provider";
import { maybeCrisisIntercept } from "@/lib/safety/guard";
import {
  readLimitedJson,
  requireAuthenticatedAiUser,
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

  return {
    title: title.length > 90 ? `${title.slice(0, 87)}…` : title,
    statement,
    what_im_hearing,
    questions,
  };
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedAiUser();
    if (!auth.ok) return auth.response;

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
        questions: ["Would you like to talk about what feels most urgent right now?"],
      };
      return NextResponse.json({ frame, kind: intercept.kind, version: VERSION }, { headers: { "x-keystone-ai-version": VERSION } });
    }

    const system = [
      "You are Keystone — a calm, practical Life CFO assistant.",
      "",
      "Task: turn the user's messy decision input into a clear, single decision statement.",
      "Return ONLY valid JSON (no markdown, no code fences, no extra keys).",
      "",
      "Schema (MUST match exactly):",
      `{`,
      `  "title": "string (<= 90 chars)",`,
      `  "statement": "string (one sentence if possible)",`,
      `  "what_im_hearing": "string (2-4 short bullet-ish lines separated by \\n)",`,
      `  "questions": ["string (2-5 items)"]`,
      `}`,
      "",
      "Rules:",
      "- Do not add advice. Do not decide for them.",
      "- Keep it neutral and calm.",
      "- If the user already wrote a clear decision question, keep it.",
    ].join("\n");

    const userContent = [
      "User input:",
      `"""${text}"""`,
      "",
      "Return ONLY the JSON.",
    ].join("\n");

    const rawText = stripCodeFences(await generateAiText({
      purpose: "decision_frame",
      system,
      prompt: userContent,
      temperature: 0.2,
      maxOutputTokens: 480,
    }));

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
          what_im_hearing: "• A decision is being held.\n• We need to clarify the exact question.",
          questions: ["What outcome are you trying to decide?", "What constraint matters most (money, time, energy)?"],
        };

    return NextResponse.json({ frame, version: VERSION }, { headers: { "x-keystone-ai-version": VERSION } });
  } catch {
    console.error("ai_route_failed", { route: "decision-frame", code: "unexpected_error" });
    return NextResponse.json({ error: "Frame failed.", version: VERSION }, { status: 500 });
  }
}
