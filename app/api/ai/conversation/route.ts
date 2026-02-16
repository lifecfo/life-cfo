// app/api/ai/conversation/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const dynamic = "force-dynamic";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type InMsg = { role: "user" | "assistant"; content: string };
type Mode = "chat" | "summarise";

/**
 * ✅ Output style goal:
 * - ChatGPT-like readability
 * - NO markdown heading markers like ### or ##
 * - Use short bold section titles as plain lines (or just paragraphs)
 * - Do NOT force the same structure every message
 * - Always make it obvious you are answering the *latest* user message
 */
const STYLE_RULES = [
  "Formatting rules (very important):",
  "- Write in Markdown.",
  "- DO NOT use markdown headings like '#', '##', or '###'. (No heading markers.)",
  "- If you want section titles, write them as a plain line with **bold** only, e.g. '**Key factors**'.",
  "- Start every reply with 1–2 short sentences that clearly respond to the user's latest message.",
  "- Those opening sentences MUST reference the user's latest message directly (paraphrase it).",
  "- Use blank lines between paragraphs.",
  "- Use bullet points only when it improves clarity. Avoid long bullet-only answers.",
  "- Mix short paragraphs + bullets (ChatGPT style).",
  "- Bold key phrases, numbers, and decisions (use **bold**).",
  "- Ask at most 1–2 questions at a time.",
  "- Keep it calm, practical, and scannable.",
].join("\n");

const CHAT_BEHAVIOR = [
  "Behavior rules:",
  "- Do NOT recommend a choice unless explicitly asked to recommend.",
  "- Do NOT pick a 'winner' unless asked.",
  "- If the user asks a direct question, answer it directly first (no template).",
  "- Only introduce structure (options, factors) when the user is doing broader thinking.",
  "- Avoid repeating the exact same section titles in consecutive replies unless truly needed.",
  "- If you already gave a structured breakdown earlier, don't repeat it. Instead: update only what changed.",
].join("\n");

const SUMMARY_RULES = [
  "Summary (capture preview) rules:",
  "- Keep it short and scannable.",
  "- Use short paragraphs + a small number of bullets.",
  "- No markdown headings (no ###). Use **bold** section labels if needed.",
  "- Include: current leaning (if any), constraints, key considerations, open questions, suggested next step.",
  "- If unclear, add 1–2 clarifying questions at the end.",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone — a calm, values-anchored decision partner.",
      "Task: Create a capture preview from the conversation.",
      "",
      SUMMARY_RULES,
      "",
      STYLE_RULES,
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone — a calm, values-anchored decision partner.",
    "You help the user think clearly without overwhelm.",
    "",
    CHAT_BEHAVIOR,
    "",
    STYLE_RULES,
    "",
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTranscript(messages: InMsg[]) {
  // Simple, robust transcript for both modes.
  return messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
}

function lastUserText(messages: InMsg[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user" && typeof m.content === "string") {
      const t = m.content.trim();
      if (t) return t;
    }
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      decisionTitle?: string;
      decisionStatement?: string;
      messages?: InMsg[];
      mode?: Mode;
    };

    const decisionTitle = String(body.decisionTitle ?? "").trim();
    const decisionStatement = String(body.decisionStatement ?? "").trim();
    const mode: Mode = body.mode === "summarise" ? "summarise" : "chat";

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const safeMessages: InMsg[] = messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    if (!decisionTitle) {
      return NextResponse.json({ error: "Missing decisionTitle." }, { status: 400 });
    }

    // 🔒 SAFETY INTERCEPT (V1 REQUIRED)
    const latestUser = lastUserText(safeMessages);
    const intercept = maybeCrisisIntercept(latestUser);
    if (intercept) {
      if (mode === "summarise") return NextResponse.json({ summaryText: intercept.content, kind: intercept.kind });
      return NextResponse.json({ assistantText: intercept.content, kind: intercept.kind });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);

    /**
     * ✅ Key change:
     * We explicitly tell the model what the LATEST USER MESSAGE is,
     * and instruct it to answer that first, then optionally add structure.
     */
    const userContent =
      mode === "summarise"
        ? [
            "Create a capture preview of this conversation.",
            "Keep it calm and easy to read.",
            "No markdown headings (no ###). Use **bold** labels if needed.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Continue the conversation.",
            "First, answer the user's latest message directly in 1–2 sentences.",
            "Then add only the minimum extra structure needed (if any).",
            "Avoid repeating the same section titles from earlier replies.",
            "No markdown headings (no ###).",
            "",
            `LATEST USER MESSAGE (answer this): ${latestUser || "(none)"}`,
            "",
            "CONVERSATION SO FAR:",
            transcript,
          ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: mode === "summarise" ? 0.2 : 0.55,
      max_output_tokens: mode === "summarise" ? 520 : 900,
    });

    const text = String(resp.output_text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    if (mode === "summarise") return NextResponse.json({ summaryText: text });
    return NextResponse.json({ assistantText: text });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
