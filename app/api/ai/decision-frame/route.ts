// app/api/ai/decision-frame/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const dynamic = "force-dynamic";

const VERSION = "decision-frame-route:v2026-02-18-001";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type FrameResult = {
  title: string;
  statement: string;
  what_im_hearing: string;
  questions: string[];
};

function safeString(x: any) {
  return typeof x === "string" ? x : "";
}

function safeArray(x: any) {
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

function coerceFrame(text: string, parsed: any): FrameResult {
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
    const body = await req.json().catch(() => ({}));
    const text = safeString(body?.text).trim();

    if (!text) {
      return NextResponse.json({ error: "Missing text.", version: VERSION }, { status: 400 });
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

    const model = process.env.OPENAI_MODEL_FRAME || process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_output_tokens: 480,
    });

    const rawText = stripCodeFences(String(resp.output_text ?? "").trim());
    if (!rawText) {
      return NextResponse.json({ error: "Empty AI response.", version: VERSION }, { status: 502 });
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // salvage attempt: find first { ... } block
      const m = rawText.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Frame failed.", version: VERSION }, { status: 500 });
  }
}
