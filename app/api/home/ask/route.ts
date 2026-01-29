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

function isAction(x: unknown): x is Action {
  return ["open_bills", "open_money", "open_decisions", "open_review", "none"].includes(String(x));
}
function isSuggestedNext(x: unknown): x is SuggestedNext {
  return ["none", "create_framing"].includes(String(x));
}

// ✅ Fix #1: deterministic afford/should-we intent detection
function isAffordQuestion(q: string) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return false;
  return (
    s.includes("afford") ||
    s.startsWith("should ") ||
    s.startsWith("can we ") ||
    s.startsWith("can i ") ||
    s.includes("is it okay to") ||
    s.includes("is it safe to")
  );
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
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

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

  const { data: accounts, error: acctErr } = await supabase
    .from("accounts")
    .select("id,name,type,status,current_balance_cents,currency,archived,updated_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  const acct = (accounts ?? []) as Array<{
    id: string;
    name: string | null;
    type: string | null;
    status: string | null;
    current_balance_cents: number | null;
    currency: string | null;
    archived: boolean | null;
    updated_at: string | null;
  }>;

  // ---- Derived money summaries (read-only) ----
const accountBalances = acct
  .map((a) => {
    const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : null;
    if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
    return {
      id: a.id,
      name: String(a.name ?? "Account"),
      currency: String((a.currency ?? "AUD")).toUpperCase(),
      cents,
    };
  })
  .filter(Boolean) as Array<{ id: string; name: string; currency: string; cents: number }>;

const balancesByCurrency = accountBalances.reduce<Record<string, number>>((acc, a) => {
  acc[a.currency] = (acc[a.currency] ?? 0) + a.cents;
  return acc;
}, {});

const activeBillsCentsByCurrency = rb.reduce<Record<string, number>>((acc, b) => {
  const cents = typeof b.amount_cents === "number" ? b.amount_cents : null;
  if (typeof cents !== "number") return acc;
  const cur = String((b.currency ?? "AUD")).toUpperCase();
  acc[cur] = (acc[cur] ?? 0) + cents;
  return acc;
}, {});

  return {
    now_iso: new Date().toISOString(),
    data_quality: {
      recurring_bills_ok: !rbErr,
      recurring_bills_count_active: rb.length,
      recurring_bills_count_due_this_month: due_this_month.length,
      accounts_ok: !acctErr,
      accounts_count_active: acct.length,
      note: "Bills come from recurring_bills. Accounts come from accounts.",
    },
    accounts_active: acct.map((a) => ({
      id: a.id,
      name: String(a.name ?? "Account"),
      type: String(a.type ?? ""),
      status: String(a.status ?? ""),
      balance: moneyFromCents(a.current_balance_cents ?? null, a.currency ?? "AUD"),
      currency: String(a.currency ?? "AUD").toUpperCase(),
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

        money_summary: {
    balances_by_currency: Object.entries(balancesByCurrency).map(([currency, cents]) => ({
    currency,
    balance: moneyFromCents(cents, currency),
  })),
  recurring_bills_totals_by_currency: Object.entries(activeBillsCentsByCurrency).map(([currency, cents]) => ({
    currency,
    total: moneyFromCents(cents, currency),
  })),
  notes: "Summaries are derived from active accounts and recurring_bills only.",
},
  };
}

const SYSTEM = `
You are Keystone Home Ask.

ROLE
You are a calm, grounded "Query My Life" layer.
You answer using the user's real data so decisions stop looping in their head.

GLOBAL RULES
- You may ONLY use the provided FACTS PACK (+ now_iso).
- If required data is missing, say clearly what you can and cannot see, then stop.
- Never guess. Never invent numbers, bills, or balances.
- Never grant permission or say yes/no.
- Never create urgency. Never say "you should".
- Be calm, human, and steady.

ANSWER SHAPE (DEFAULT)
1) "Here’s what I can see" → concrete facts
2) "What that means" → neutral interpretation
3) Optional next step → only if helpful

AFFORD / SHOULD-WE QUESTIONS (CRITICAL)
If the question is about affordability, safety, or whether to proceed:

You MUST answer in this structure:

1) Here’s what I can see
   - Current account balances (if available)
   - Upcoming bills and commitments (state the time window)
   - Any known constraints from the data

2) What that means
   - Plain-English interpretation
   - No advice, no judgement

3) What would make this safe
   - Conditions, not instructions
   - Examples: buffer size, timing clarity, amount bounds
   - Phrase as “This would feel safer if…”

4) Framing hand-off (ONLY if uncertainty or trade-offs exist)
   - If the decision involves trade-offs, timing pressure, or missing context:
     set suggested_next = "create_framing"
     and provide a framing_seed with:
       • a neutral title
       • a short framing prompt
       • up to 5 factual notes from the data

If the answer is clear and bounded, DO NOT suggest framing.

STYLE
- Calm
- Grounded
- Reassuring but honest
- Slightly human, never chatty

OUTPUT
Return JSON only, matching the schema exactly.
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

    // ✅ Fix #1: pass deterministic intent to the model
    const afford_intent = isAffordQuestion(question);

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `QUESTION:\n${question}\n\nINTENT:\n${afford_intent ? "AFFORD_OR_SHOULD_WE" : "GENERAL"}\n\nFACTS PACK:\n${JSON.stringify(
            facts,
            null,
            2
          )}`,
        },
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

    // Enforce: framing_seed must be null unless create_framing
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
