// app/api/ai/conversation/route.ts
import { NextResponse } from "next/server";
import { generateAiText } from "@/lib/ai/provider";
import { maybeCrisisIntercept } from "@/lib/safety/guard";
import type {
  DecisionConversationRequest,
  DecisionConversationResponse,
} from "@/lib/memory/contracts";
import {
  readLimitedJson,
  requireAuthenticatedAiUser,
} from "@/lib/ai/routeSecurity";

export const dynamic = "force-dynamic";

const VERSION = "conversation-route:v2026-02-16-002";
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_STATEMENT_LENGTH = 4_000;
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_MESSAGES = 50;
const MAX_CONVERSATION_LENGTH = 30_000;

type InMsg = { role: "user" | "assistant"; content: string };
type Mode = "chat" | "summarise";

/**
 * Core principle:
 * - Answer the NEW user message first.
 * - Only add sections when they help.
 * - Avoid repeating the same structure every turn.
 */
const STYLE_GUIDE = [
  "Output formatting rules (MANDATORY):",
  "- Output MUST be valid Markdown.",
  "- Use blank lines between paragraphs and between sections.",
  "- Keep replies calm and scannable. No walls of text.",
  "- Start by answering the user's NEW message in 1-3 sentences.",
  "- Only use structured sections if they genuinely help this turn.",
  "- Do NOT reuse the same full structure every reply.",
  "- If listing 3+ items, use bullets.",
  "- If you write 'Label: text', convert it to a bullet: '- **Label:** text'.",
  "- Bold key numbers and key phrases using **bold**.",
  "- Ask at most 1 question at the end (2 max only if essential).",
  "",
  "Headings:",
  "- If you use headings, use '###'.",
  "- Do not add headings unless you are actually creating sections.",
].join("\n");

const OPTIONAL_SECTION_HEADINGS = [
  "Optional headings you may use (only when helpful):",
  "- ### What I'm hearing",
  "- ### Key factors",
  "- ### Options",
  "- ### Trade-offs",
  "- ### Suggested next step",
  "- ### Next question",
].join("\n");

function buildSystemPrompt(args: { decisionTitle: string; decisionStatement?: string; mode: Mode }) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: Produce a capture preview summary of the conversation.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it scannable and calm.",
      "- Include: what's decided (if anything), constraints, open questions, suggested next step.",
      "",
      STYLE_GUIDE,
      "",
      OPTIONAL_SECTION_HEADINGS,
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone - a calm, values-anchored decision partner.",
    "You help the user think clearly without forcing a decision.",
    "Rules:",
    "- Do NOT recommend a choice unless the user asks you to recommend.",
    "- Stay anchored to the user's latest message.",
    "- Do NOT repeat the same structure every reply.",
    "",
    STYLE_GUIDE,
    "",
    OPTIONAL_SECTION_HEADINGS,
    "",
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTranscript(messages: InMsg[]) {
  return messages.map((m) => `${m.role === "user" ? "You" : "Keystone"}: ${m.content}`).join("\n\n");
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

function classifyTurn(userText: string) {
  const t = (userText || "").trim().toLowerCase();

  const isShort = t.length <= 110;
  const isCapability =
    /\b(can you|can u|are you able|do you have access|can you see|can you check|can you view)\b/.test(t) ||
    /\b(account info|bank account|my finances|see my)\b/.test(t);

  const isFollowUp =
    /\b(yes|no|yep|nah|ok|okay|cool|thanks|got it|sure)\b/.test(t) && t.length <= 40;

  const isComplex =
    t.length > 160 ||
    (t.match(/\?/g) || []).length >= 2 ||
    /\b(compare|options|trade-?offs|plan|steps|break down|budget|afford|how much)\b/.test(t);

  if (isCapability && isShort) return "direct";
  if (isFollowUp) return "direct";
  if (isComplex) return "structured";
  return "light";
}

/** --- Markdown normalization (keeps things consistently readable) --- */

const TITLE_SET = new Set(
  [
    "what i'm hearing",
    "key factors",
    "options",
    "trade-offs",
    "tradeoffs",
    "suggested next step",
    "next step",
    "next question",
    "snapshot",
    "key constraints",
    "open questions",
    "assumptions",
  ].map((s) => s.toLowerCase())
);

function isTitleLine(s: string) {
  const t = (s || "").trim();
  if (!t) return false;

  const low = t.toLowerCase();
  if (TITLE_SET.has(low)) return true;

  const hasPunct = /[.:;!?]/.test(t);
  const words = t.split(/\s+/).filter(Boolean);
  if (!hasPunct && words.length >= 1 && words.length <= 5 && t.length <= 32) return true;

  return false;
}

function bulletifyLabelLine(s: string) {
  const m = s.match(/^([A-Za-z][A-Za-z0-9 &'\/-]{1,36}):\s+(.+)$/);
  if (!m) return null;
  const label = m[1].trim();
  const rest = m[2].trim();
  if (!label || !rest) return null;
  if (/https?:\/\//i.test(rest)) return null;
  return `- **${label}:** ${rest}`;
}

function normalizeMarkdown(raw: string) {
  let text = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  // normalize overly-deep headings
  text = text.replace(/^\s{0,3}#{4,}\s+/gm, "### ");

  const lines = text.split("\n");
  const out: string[] = [];
  let prevBlank = true;
  let prevWasList = false;

  const ensureBlank = () => {
    if (out.length === 0) return;
    if (out[out.length - 1].trim() !== "") out.push("");
  };

  for (const lineRaw of lines) {
    const line = (lineRaw ?? "").replace(/\s+$/g, "");
    const t = line.trim();

    if (!t) {
      if (!prevBlank) out.push("");
      prevBlank = true;
      prevWasList = false;
      continue;
    }

    // Convert plain title lines to headings (only when they appear as standalone lines)
    if (isTitleLine(t) && !/^#{1,6}\s+/.test(t) && !/^(-|\*|\d+\.)\s+/.test(t)) {
      ensureBlank();
      out.push(`### ${t}`);
      out.push("");
      prevBlank = true;
      prevWasList = false;
      continue;
    }

    if (/^#{1,6}\s+/.test(t)) {
      ensureBlank();
      out.push(t.replace(/^#{1,3}\s+/, "### "));
      out.push("");
      prevBlank = true;
      prevWasList = false;
      continue;
    }

    if (/^(-|\*|\d+\.)\s+/.test(t)) {
      if (!prevWasList) ensureBlank();
      out.push(t);
      prevBlank = false;
      prevWasList = true;
      continue;
    }

    const b = bulletifyLabelLine(t);
    if (b) {
      if (!prevWasList) ensureBlank();
      out.push(b);
      prevBlank = false;
      prevWasList = true;
      continue;
    }

    // If we were in a list, separate next paragraph
    if (prevWasList) out.push("");
    out.push(t);
    prevBlank = false;
    prevWasList = false;
  }

  while (out.length && out[0].trim() === "") out.shift();
  while (out.length && out[out.length - 1].trim() === "") out.pop();

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedAiUser();
    if (!auth.ok) return auth.response;

    const parsedBody = await readLimitedJson(req, MAX_REQUEST_BYTES);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value as DecisionConversationRequest;

    const decisionTitle = String(body.decisionTitle ?? "").trim();
    const decisionStatement = String(body.decisionStatement ?? "").trim();
    const mode: Mode = body.mode === "summarise" ? "summarise" : "chat";

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (
      decisionTitle.length > MAX_TITLE_LENGTH ||
      decisionStatement.length > MAX_STATEMENT_LENGTH ||
      messages.length > MAX_MESSAGES
    ) {
      return NextResponse.json(
        { error: "That was too much text to send at once.", version: VERSION },
        { status: 413 }
      );
    }

    const safeMessages: InMsg[] = messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      )
      .map((m) => ({ role: m.role, content: m.content.trim() }));

    const conversationLength = safeMessages.reduce(
      (total, message) => total + message.content.length,
      0
    );
    if (
      safeMessages.some((message) => message.content.length > MAX_MESSAGE_LENGTH) ||
      conversationLength > MAX_CONVERSATION_LENGTH
    ) {
      return NextResponse.json(
        { error: "That was too much text to send at once.", version: VERSION },
        { status: 413 }
      );
    }

    if (!decisionTitle) {
      return NextResponse.json({ error: "Missing decisionTitle.", version: VERSION }, { status: 400 });
    }

    // Safety intercept
    const userText = lastUserText(safeMessages);
    const intercept = maybeCrisisIntercept(userText);
    if (intercept) {
      const payload: DecisionConversationResponse =
        mode === "summarise"
          ? { summaryText: intercept.content, kind: intercept.kind, version: VERSION }
          : { assistantText: intercept.content, kind: intercept.kind, version: VERSION };

      return NextResponse.json(payload, { headers: { "x-keystone-ai-version": VERSION } });
    }

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    const transcript = buildTranscript(safeMessages);

    const turnKind = classifyTurn(userText);

    const userContent =
      mode === "summarise"
        ? [
            "Write a capture preview summary.",
            "You MUST follow the formatting rules.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n")
        : [
            `Turn type: ${turnKind}.`,
            "You MUST answer the user's latest message first.",
            "If Turn type is 'direct': reply plainly (no big template), max ~120-180 words, 0-1 headings, bullets only if helpful.",
            "If Turn type is 'light': 1 short paragraph + (optional) a small bullet list (3-6 bullets) + 1 question.",
            "If Turn type is 'structured': you may use 2-4 headings, but only those that help.",
            "Do NOT repeat the same headings every turn.",
            "",
            "CONVERSATION:",
            transcript,
          ].join("\n");

    const rawText = await generateAiText({
      purpose: "conversation",
      system,
      prompt: userContent,
      temperature: mode === "summarise" ? 0.2 : 0.5,
      maxOutputTokens: mode === "summarise" ? 520 : 900,
    });

    const text = normalizeMarkdown(rawText);

    const payload: DecisionConversationResponse =
      mode === "summarise" ? { summaryText: text, version: VERSION } : { assistantText: text, version: VERSION };
    return NextResponse.json(payload, { headers: { "x-keystone-ai-version": VERSION } });
  } catch {
    console.error("ai_route_failed", { route: "conversation", code: "unexpected_error" });
    return NextResponse.json({ error: "AI request failed.", version: VERSION }, { status: 500 });
  }
}
