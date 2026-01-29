// app/api/home/ask/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Action = "open_bills" | "open_money" | "open_decisions" | "open_review" | "none";
type SuggestedNext = "none" | "create_framing";

type AskRequest = { userId: string; question: string };

function isAction(x: any): x is Action {
  return ["open_bills", "open_money", "open_decisions", "open_review", "none"].includes(x);
}
function isSuggestedNext(x: any): x is SuggestedNext {
  return ["none", "create_framing"].includes(x);
}

function monthBoundsLocal() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function moneyFromCents(cents: number | null | undefined, currency: string | null | undefined) {
  const n = typeof cents === "number" ? cents : cents == null ? null : Number(cents);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const cur = (currency || "AUD").toUpperCase();
  return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n / 100);
}

async function buildFactsPack(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { start, end } = monthBoundsLocal();

  const { data: recurringBills, error: rbErr } = await supabase
    .from("recurring_bills")
    .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes,updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("next_due_at", { ascending: true })
    .limit(200);

  const rb = (recurringBills ?? []) as Array<{
    id: string;
    name: string | null;
    amount_cents: number | null;
    currency: string | null;
    cadence: string | null;
    next_due_at: string | null;
    autopay: boolean | null;
  }>;

  const due_this_month = rb
    .filter((b) => {
      if (!b.next_due_at) return false;
      const ms = Date.parse(b.next_due_at);
      if (Number.isNaN(ms)) return false;
      return ms >= start.getTime() && ms < end.getTime();
    })
    .map((b) => ({
      id: b.id,
      name: (b.name || "Bill").trim(),
      next_due_at: b.next_due_at,
      amount: moneyFromCents(b.amount_cents, b.currency),
      autopay: !!b.autopay,
      cadence: b.cadence ?? null,
    }));

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id,name,type,status,current_balance_cents,currency,archived,updated_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  const acct = (accounts ?? []) as any[];

  return {
    now_iso: new Date().toISOString(),
    data_quality: {
      recurring_bills_ok: !rbErr,
      recurring_bills_count_active: rb.length,
      recurring_bills_count_due_this_month: due_this_month.length,
      accounts_count_active: acct.length,
      note: "Bills come from recurring_bills. Accounts come from accounts.",
    },
    accounts_active: acct.map((a) => ({
      id: a.id,
      name: String(a.name ?? "Account"),
      type: String(a.type ?? ""),
      status: String(a.status ?? ""),
      balance: moneyFromCents(a.current_balance_cents ?? null, a.currency ?? "AUD"),
      currency: String((a.currency ?? "AUD")).toUpperCase(),
    })),
    bills_due_this_month: due_this_month,
    bills_active: rb.map((b) => ({
      id: b.id,
      name: (b.name || "Bill").trim(),
      next_due_at: b.next_due_at,
      amount_cents: b.amount_cents ?? null,
      currency: (b.currency || "AUD").toUpperCase(),
      autopay: !!b.autopay,
      cadence: b.cadence ?? null,
    })),
  };
}

const SYSTEM = `
You are Keystone Home Ask.

RULES:
- You may ONLY answer using FACTS PACK (+ now_iso).
- If required data isn't present, say what you can/can't see and STOP.
- No guessing. No invention. Calm and non-directive.
- No urgency. No "you should". No pretending anything was saved.
- Prefer: direct answer (1–2 lines), then bullets, then totals/ranges when relevant.
- If time-based, state the window explicitly.

AFFORD / SHOULD-WE:
- Never grant permission.
- Provide a bounded frame (accounts + upcoming bills).
- If it needs more context/tradeoffs/missing inputs, set suggested_next="create_framing"
  and include framing_seed (title, prompt, notes[]).

Return JSON only matching schema.
`.trim();

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<AskRequest>;
    const userId = String(body.userId ?? "").trim();
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!userId || !question) {
      return NextResponse.json({ error: "Missing userId/question" }, { status: 400 });
    }

    const facts = await buildFactsPack(userId);

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `QUESTION:\n${question}\n\nFACTS PACK:\n${JSON.stringify(facts, null, 2)}` },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "keystone_home_ask",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "string" },
              action: { type: "string", enum: ["open_bills", "open_money", "open_decisions", "open_review", "none"] },
              suggested_next: { type: "string", enum: ["none", "create_framing"] },
              framing_seed: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      prompt: { type: "string" },
                      notes: { type: "array", items: { type: "string" } },
                    },
                    required: ["title", "prompt", "notes"],
                  },
                ],
              },
            },
            required: ["answer", "action", "suggested_next", "framing_seed"],
          },
        },
      },
    });

    const raw = resp.output_text?.trim() || "";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { answer: "I couldn’t format that safely. Try again.", action: "none", suggested_next: "none", framing_seed: null },
        { status: 502 }
      );
    }

    const answer = String(parsed.answer ?? "").trim().slice(0, 4000);
    const action: Action = isAction(parsed.action) ? parsed.action : "none";
    const suggested_next: SuggestedNext = isSuggestedNext(parsed.suggested_next) ? parsed.suggested_next : "none";

    const framing_seed =
      suggested_next === "create_framing" && parsed.framing_seed && typeof parsed.framing_seed === "object"
        ? {
            title: String(parsed.framing_seed.title ?? "").slice(0, 120) || "Decision to frame",
            prompt: String(parsed.framing_seed.prompt ?? "").slice(0, 2000) || "",
            notes: Array.isArray(parsed.framing_seed.notes)
              ? parsed.framing_seed.notes.map((x: any) => String(x)).slice(0, 10)
              : [],
          }
        : null;

    return NextResponse.json({ answer, action, suggested_next, framing_seed });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
