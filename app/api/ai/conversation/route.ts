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
 * We want ChatGPT-like readability WITHOUT markdown headings.
 * So we:
 * - Forbid #/##/### headings
 * - Use plain-text section titles (single line)
 * - Use hyphen bullets
 * - Use blank lines for spacing
 * - Use **bold** sparingly for key phrases
 */
const OUTPUT_RULES = [
  "Output style (mandatory):",
  "- Do NOT use markdown headings. No lines starting with '#', '##', or '###'.",
  "- Use simple section titles as plain text lines, e.g. 'What I’m hearing' (no punctuation required).",
  "- After a section title, add a blank line, then bullets or short paragraphs.",
  "- Prefer '-' for bullets and keep bullets short.",
  "- Add blank lines between sections.",
  "- Bold key phrases and numbers using **bold**.",
  "- Avoid long paragraphs. Use lists and whitespace.",
  "- Ask at most 1–2 questions at the end if needed.",
  "- Never output fenced code blocks unless the user asks for code.",
].join("\n");

const CHAT_STRUCTURE = [
  "Preferred structure (use what fits):",
  "",
  "What I’m hearing",
  "- ...",
  "",
  "Key factors",
  "- **Timing:** ...",
  "- **Constraints:** ...",
  "",
  "Options",
  "- **Option A:** ... (trade-offs)",
  "- **Option B:** ... (trade-offs)",
  "",
  "Suggested next step",
  "- ...",
  "",
  "Next question",
  "- ...",
].join("\n");

const SUMMARY_STRUCTURE = [
  "Preferred capture preview structure:",
  "",
  "Snapshot",
  "- **Current leaning:** ... (or 'Not stated')",
  "- **Why it matters:** ...",
  "",
  "Key constraints",
  "- ...",
  "",
  "Key considerations",
  "- ...",
  "",
  "Open questions",
  "- ...",
  "",
  "Suggested next step",
  "- ...",
  "",
  "If you need clarification, ask 1–2 questions (as bullets).",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: Summarise the user's conversation about a decision into a calm, useful capture preview.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it short and scannable.",
      "- Include: current leaning (if any), key constraints, open questions, next steps.",
      "- If unclear, ask 1–2 clarifying questions at the end.",
      "",
      OUTPUT_RULES,
      "",
      "Structure:",
      SUMMARY_STRUCTURE,
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone — a calm, values-anchored decision partner.",
    "You are helping the user think, not forcing a decision.",
    "Rules:",
    "- Do NOT recommend a choice unless the user asks you to recommend.",
    "- Do NOT pick a winner unless asked to compare with a winner.",
    "- Do NOT simulate irreversible outcomes unless asked.",
    "- Do NOT aggressively optimise unless asked.",
    "- Keep tone grounded, gentle, and practical.",
    "- Ask clarifying questions when needed instead of guessing.",
    "",
    OUTPUT_RULES,
    "",
    "Structure:",
    CHAT_STRUCTURE,
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
      if (mode === "summarise") return NextResponse.json({ summaryText: intercept.content, kind: intercept.kind });
      return NextResponse.json({ assistantText: intercept.content, kind: intercept.kind });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);

    const userContent =
      mode === "summarise"
        ? [
            "Create a capture preview for the decision based on the conversation.",
            "Follow the output style rules exactly.",
            "Do not use markdown headings (#/##/###).",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            "Continue the conversation.",
            "Follow the output style rules exactly.",
            "Do not use markdown headings (#/##/###).",
            "Keep it calm and scannable.",
            "Ask at most 1–2 questions at the end if needed.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n");

    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      temperature: mode === "summarise" ? 0.2 : 0.45,
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
