// app/api/ai/conversation/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const dynamic = "force-dynamic";

const VERSION = "conversation-route:v2026-02-16-001";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type InMsg = { role: "user" | "assistant"; content: string };
type Mode = "chat" | "summarise";

const STYLE_GUIDE = [
  "Output formatting rules (MANDATORY):",
  "- Output MUST be valid Markdown.",
  "- Use headings with '###' for section titles when you use sections.",
  "- Use blank lines between paragraphs and between sections.",
  "- Prefer bullet lists for factors/options/steps.",
  "- If you write 'Label: text', convert it to a bullet: '- **Label:** text'.",
  "- Bold key numbers and key phrases using **bold**.",
  "- Do NOT dump the same full template every turn.",
  "- Always answer the user's NEW message first in 1–2 sentences.",
  "- Then add only the sections that add value for this turn.",
  "- Ask at most 1 question at the end (2 max if critical).",
].join("\n");

const OPTIONAL_SECTIONS = [
  "You may use these headings (only when helpful):",
  "### What I’m hearing",
  "### Key factors",
  "### Options",
  "### Trade-offs",
  "### Suggested next step",
  "### Next question",
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
      "- Include: what’s decided (if anything), constraints, open questions, suggested next step.",
      "",
      STYLE_GUIDE,
      "",
      OPTIONAL_SECTIONS,
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "You are Keystone — a calm, values-anchored decision partner.",
    "You help the user think clearly without forcing a decision.",
    "Rules:",
    "- Do NOT recommend a choice unless the user asks you to recommend.",
    "- Stay anchored to the user's latest message.",
    "- Do NOT repeat the same structure every reply.",
    "",
    STYLE_GUIDE,
    "",
    OPTIONAL_SECTIONS,
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

const TITLE_SET = new Set(
  [
    "what i’m hearing",
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
  const m = s.match(/^([A-Za-z][A-Za-z0-9 &'’\/-]{1,36}):\s+(.+)$/);
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
      return NextResponse.json({ error: "Missing decisionTitle.", version: VERSION }, { status: 400 });
    }

    const userText = lastUserText(safeMessages);
    const intercept = maybeCrisisIntercept(userText);
    if (intercept) {
      const payload = mode === "summarise"
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

    const userContent =
      mode === "summarise"
        ? ["Write a capture preview summary.", "You MUST follow the formatting rules.", "", "CONVERSATION:", transcript].join("\n")
        : [
            "Reply to the user's latest message.",
            "Answer the new message first, then add structure only if helpful.",
            "You MUST follow the formatting rules.",
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
      temperature: mode === "summarise" ? 0.2 : 0.5,
      max_output_tokens: mode === "summarise" ? 520 : 900,
    });

    const rawText = String(resp.output_text ?? "").trim();
    if (!rawText) {
      return NextResponse.json({ error: "Empty AI response.", version: VERSION }, { status: 502 });
    }

    const text = normalizeMarkdown(rawText);

    const payload = mode === "summarise" ? { summaryText: text, version: VERSION } : { assistantText: text, version: VERSION };
    return NextResponse.json(payload, { headers: { "x-keystone-ai-version": VERSION } });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message, version: VERSION }, { status: 500 });
  }
}
