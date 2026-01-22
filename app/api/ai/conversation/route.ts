// app/api/ai/conversation/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type InMsg = { role: "user" | "assistant"; content: string };
type Mode = "chat" | "summarise";

function buildSystemPrompt(args: {
  decisionTitle: string;
  decisionStatement?: string;
  mode: Mode;
}) {
  const { decisionTitle, decisionStatement, mode } = args;

  if (mode === "summarise") {
    return [
      "You are Keystone.",
      "Task: Summarise the user's conversation about a decision into a calm, useful preview.",
      "Rules:",
      "- Do NOT recommend a choice unless explicitly asked.",
      "- Keep it short and scannable.",
      "- Include: current leaning (if any), key constraints, open questions, next steps.",
      "- If unclear, ask 1–2 clarifying questions at the end.",
      "",
      `Decision title: ${decisionTitle}`,
      decisionStatement ? `Decision statement: ${decisionStatement}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Default: conversation mode
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
    `Decision title: ${decisionTitle}`,
    decisionStatement ? `Decision statement: ${decisionStatement}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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

    const system = buildSystemPrompt({
      decisionTitle,
      decisionStatement: decisionStatement || undefined,
      mode,
    });

    // Responses API expects content blocks with type: "input_text"
    const input = [
      {
        role: "system" as const,
        content: [{ type: "input_text" as const, text: system }],
      },
      ...safeMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: [{ type: "input_text" as const, text: m.content }],
      })),
    ];

    const model = process.env.OPENAI_MODEL || "gpt-4.1";

    const resp = await client.responses.create({
      model,
      input,
      temperature: mode === "summarise" ? 0.3 : 0.6,
      max_output_tokens: mode === "summarise" ? 400 : 700,
    });

    const assistantText = String(resp.output_text ?? "").trim();

    if (!assistantText) {
      return NextResponse.json({ error: "Empty AI response." }, { status: 502 });
    }

    // Return a stable shape your frontend already expects
    if (mode === "summarise") {
      return NextResponse.json({ summaryText: assistantText });
    }

    return NextResponse.json({ assistantText });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "AI request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
