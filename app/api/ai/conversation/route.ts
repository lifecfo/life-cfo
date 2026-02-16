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
 * Core: we want ChatGPT-like readability WITHOUT markdown headings.
 * - Titles are plain lines (e.g. "Key factors") on their own line.
 * - Use blank lines between paragraphs.
 * - Use bullets when helpful, but always with a lead-in sentence.
 * - Do NOT repeat the full structure every turn.
 * - Answer the latest user message first.
 */
const FORMAT_RULES = [
  "Formatting rules (follow strictly):",
  "- Output MUST be Markdown.",
  "- Do NOT use Markdown headings (NO '#', '##', '###', etc).",
  "- If you use section titles, write them as plain text on their own line (no symbols): e.g. 'Key factors' then a blank line.",
  "- Add blank lines between paragraphs and between sections.",
  "- Prefer 2–6 short paragraphs over one long paragraph.",
  "- Use bullet lists when listing items, BUT always introduce them with a short lead-in sentence first.",
  "- Avoid bullet-only replies unless the user explicitly asks for a list.",
  "- Bold key phrases, numbers, and decisions with **bold**.",
  "- If you ask questions, ask at most 1–2 at the end.",
  "- Keep most replies ~120–220 words unless the user asks for depth.",
].join("\n");

const SECTION_HINTS_CHAT = [
  "Optional section titles (use only when they add NEW value; do not repeat every turn):",
  "- What I’m hearing",
  "- Key factors",
  "- Options",
  "- Suggested next step",
  "- Next question",
  "",
  "Use only 1–3 of these per message, max.",
].join("\n");

const SECTION_HINTS_SUMMARY = [
  "Summary structure (capture preview):",
  "Snapshot",
  "",
  "Key constraints",
  "",
  "Key considerations",
  "",
  "Open questions",
  "",
  "Suggested next step",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: produce a calm, useful capture preview of the conversation.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it scannable and practical.",
      "- Include: current leaning (if any), constraints, considerations, open questions, and a next step.",
      "",
      FORMAT_RULES,
      "",
      SECTION_HINTS_SUMMARY,
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone — a calm, values-anchored decision partner.",
    "You help the user think clearly, without forcing a decision.",
    "Rules:",
    "- Answer the user's LATEST message first (do not restate the entire situation unless needed).",
    "- Do NOT recommend a choice unless the user asks you to recommend.",
    "- Do NOT repeat the same full structure every turn.",
    "- Ask clarifying questions only when needed instead of guessing.",
    "",
    FORMAT_RULES,
    "",
    SECTION_HINTS_CHAT,
    "",
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTranscript(messages: InMsg[]) {
  return messages
    .map((m) => `${m.role === "user" ? "You" : "Keystone"}: ${m.content}`)
    .join("\n\n");
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
    const userText = lastUserText(safeMessages);
    const intercept = maybeCrisisIntercept(userText);
    if (intercept) {
      if (mode === "summarise") {
        return NextResponse.json({ summaryText: intercept.content, kind: intercept.kind });
      }
      return NextResponse.json({ assistantText: intercept.content, kind: intercept.kind });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);

    const latest = lastUserText(safeMessages);

    const userContent =
      mode === "summarise"
        ? [
            "Create a capture preview of this conversation.",
            "Follow the formatting rules (no markdown headings).",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Continue the conversation.",
            "Answer the LATEST user message first.",
            "Follow formatting rules (no markdown headings; use blank lines; bullets only when helpful and with lead-in text).",
            "",
            `LATEST USER MESSAGE:\n${latest || "(none)"}`,
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
      // slightly lower = more consistent formatting
      temperature: mode === "summarise" ? 0.15 : 0.35,
      max_output_tokens: mode === "summarise" ? 520 : 850,
    });

    const text = String(resp.output_text ?? "").trim();

    if (!text) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    if (mode === "summarise") {
      return NextResponse.json({ summaryText: text });
    }

    return NextResponse.json({ assistantText: text });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
