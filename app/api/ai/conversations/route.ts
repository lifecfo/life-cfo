import { NextResponse } from "next/server";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const dynamic = "force-dynamic";

const KEYSTONE_SYSTEM: Msg = {
  role: "system",
  content: [
    "You are Keystone.",
    "You are a calm, values-anchored decision intelligence system for families.",
    "Be as fluent and helpful as ChatGPT, but stay responsible and scoped.",
    "",
    "Non-negotiables:",
    "- Never pressure the user to decide.",
    "- Ask one gentle clarifying question if blocked.",
    "- Do not recommend a choice, declare a winner, simulate irreversible outcomes, or optimise aggressively unless the user explicitly asks.",
    "- If the user asks something out of scope (medical/legal), decline calmly and redirect to what you can help with.",
    "",
    "Output style:",
    "- Default to concise, calm responses.",
    "- Prefer neutral tradeoffs and questions over commands.",
  ].join("\n"),
};

function buildAnchorSystem(decisionTitle: string, decisionStatement: string): Msg {
  return {
    role: "system",
    content: [
      "Primary anchor decision:",
      decisionTitle ? `- Title: ${decisionTitle}` : "",
      decisionStatement ? `- Decision statement: ${decisionStatement}` : "",
      "",
      "Stay anchored to this decision unless the user explicitly asks to broaden scope.",
      "If the user tries to broaden scope implicitly, ask permission first.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function buildSummariseSystem(): Msg {
  return {
    role: "system",
    content: [
      "TASK: Summarise the conversation into a PREVIEW (non-committal).",
      "This is not being saved yet. Do not write as if it is final or committed.",
      "",
      "Rules:",
      "- Be calm, neutral, and concise.",
      "- Do not recommend a choice unless the user explicitly asked for one in the conversation.",
      "- Do not add new facts. Only summarise what was said.",
      "- Do not use urgency language.",
      "",
      "Return STRICT JSON only with this shape:",
      "{",
      '  "summary_bullets": string[],',
      '  "preferences_learned": string[],',
      '  "constraints_added": string[],',
      '  "unknowns_resolved": string[],',
      '  "open_questions": string[],',
      '  "next_helpful_step": string',
      "}",
      "",
      "Keep arrays short (0–6 items). summary_bullets ideally 3–6 items.",
      "next_helpful_step should be one gentle sentence.",
    ].join("\n"),
  };
}

async function callOpenAI(messages: Msg[], opts?: { temperature?: number }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "Missing OPENAI_API_KEY" };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: messages.map((m) => ({
        role: m.role,
        content: [{ type: "text", text: m.content }],
      })),
      temperature: opts?.temperature ?? 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, error: `OpenAI error: ${res.status} ${text}` };
  }

  const json: any = await res.json();

  // Extract assistant text from Responses API
  const output = json?.output ?? [];
  const assistant = output.find((x: any) => x?.role === "assistant");
  const content = assistant?.content ?? [];
  const textPart = content.find((c: any) => c?.type === "output_text");
  const text = textPart?.text ?? "";

  return { ok: true as const, text };
}

function safeJsonParse<T>(s: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const v = JSON.parse(s);
    return { ok: true, value: v as T };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Invalid JSON" };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const mode = String(body?.mode ?? "chat"); // "chat" | "summarise"
    const decisionTitle = String(body?.decisionTitle ?? "");
    const decisionStatement = String(body?.decisionStatement ?? "");
    const incoming = Array.isArray(body?.messages) ? (body.messages as Msg[]) : [];

    if (incoming.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const anchor = buildAnchorSystem(decisionTitle, decisionStatement);

    if (mode === "summarise") {
      type Summary = {
        summary_bullets: string[];
        preferences_learned: string[];
        constraints_added: string[];
        unknowns_resolved: string[];
        open_questions: string[];
        next_helpful_step: string;
      };

      // We summarise using the full conversation (user + assistant) + anchor.
      const messages: Msg[] = [KEYSTONE_SYSTEM, anchor, buildSummariseSystem(), ...incoming];

      const out = await callOpenAI(messages, { temperature: 0.2 });
      if (!out.ok) return NextResponse.json({ error: out.error }, { status: 500 });

      const parsed = safeJsonParse<Summary>(out.text.trim());
      if (!parsed.ok) {
        // If model returns non-JSON, still give user something but mark as error.
        return NextResponse.json(
          {
            error: "Summary format error (non-JSON).",
            raw: out.text,
          },
          { status: 500 }
        );
      }

      // Minimal shape hardening
      const s = parsed.value;
      const norm = (arr: any) => (Array.isArray(arr) ? arr.map(String).filter(Boolean) : []);
      const summary: Summary = {
        summary_bullets: norm(s.summary_bullets).slice(0, 6),
        preferences_learned: norm(s.preferences_learned).slice(0, 6),
        constraints_added: norm(s.constraints_added).slice(0, 6),
        unknowns_resolved: norm(s.unknowns_resolved).slice(0, 6),
        open_questions: norm(s.open_questions).slice(0, 6),
        next_helpful_step: String(s.next_helpful_step ?? "").slice(0, 240),
      };

      return NextResponse.json({ summary });
    }

    // Default: chat
    const scopedAnchor: Msg = anchor;
    const messages: Msg[] = [KEYSTONE_SYSTEM, scopedAnchor, ...incoming];

    const out = await callOpenAI(messages, { temperature: 0.4 });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 500 });

    return NextResponse.json({ assistantText: out.text });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
