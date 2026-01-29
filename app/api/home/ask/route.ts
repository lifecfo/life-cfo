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
  return typeof x === "string" && (["open_bills", "open_money", "open_decisions", "open_review", "none"] as const).includes(x as Action);
}
function isSuggestedNext(x: unknown): x is SuggestedNext {
  return typeof x === "string" && (["none", "create_framing"] as const).includes(x as SuggestedNext);
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

type RecurringBillFact = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
  active?: boolean | null;
};

type AccountFact = {
  id: string;
  name: string | null;
  type: string | null;
  status: string | null;
  current_balance_cents: number | null;
  currency: string | null;
  archived: boolean | null;
  updated_at: string | null;
};

type DecisionFact = {
  id: string;
  title: string | null;
  context: string | null;
  status: string | null;
  created_at: string | null;
  decided_at: string | null;
  review_at: string | null;
};

async function buildFactsPack(userId: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { start, end } = monthBoundsLocal();

  // --- Bills (recurring_bills) ---
  const { data: recurringBills, error: rbErr } = await supabase
    .from("recurring_bills")
    .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,updated_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("next_due_at", { ascending: true })
    .limit(200);

  const rb = (recurringBills ?? []) as RecurringBillFact[];

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

  // --- Accounts ---
  const { data: accounts, error: acctErr } = await supabase
    .from("accounts")
    .select("id,name,type,status,current_balance_cents,currency,archived,updated_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  const acct = (accounts ?? []) as AccountFact[];

  // --- Decisions (open / not decided) ---
  // We treat anything NOT status="decided" as "open" for Home Ask.
  // This matches your app’s pattern: decided decisions are committed, others are still open loops/drafts.
  const { data: decisions, error: decErr } = await supabase
    .from("decisions")
    .select("id,title,context,status,created_at,decided_at,review_at")
    .eq("user_id", userId)
    .neq("status", "decided")
    .order("created_at", { ascending: false })
    .limit(50);

  const dec = (decisions ?? []) as DecisionFact[];

  const decisions_open = dec.map((d) => ({
    id: d.id,
    title: String(d.title ?? "Decision").trim(),
    status: String(d.status ?? "").trim(),
    created_at: d.created_at,
    review_at: d.review_at,
  }));

  // ---- Derived money summaries (read-only) ----
  const accountBalances = acct
    .map((a) => {
      const cents =
        typeof a.current_balance_cents === "number"
          ? a.current_balance_cents
          : a.current_balance_cents == null
          ? null
          : Number(a.current_balance_cents);
      if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
      return {
        id: a.id,
        name: String(a.name ?? "Account"),
        currency: String(a.currency ?? "AUD").toUpperCase(),
        cents,
      };
    })
    .filter((x): x is { id: string; name: string; currency: string; cents: number } => x !== null);

  const balancesByCurrency = accountBalances.reduce<Record<string, number>>((accum, a) => {
    accum[a.currency] = (accum[a.currency] ?? 0) + a.cents;
    return accum;
  }, {});

  const activeBillsCentsByCurrency = rb.reduce<Record<string, number>>((accum, b) => {
    const cents = typeof b.amount_cents === "number" ? b.amount_cents : b.amount_cents == null ? null : Number(b.amount_cents);
    if (typeof cents !== "number" || !Number.isFinite(cents)) return accum;
    const cur = String(b.currency ?? "AUD").toUpperCase();
    accum[cur] = (accum[cur] ?? 0) + cents;
    return accum;
  }, {});

  const balancesEntries = Object.entries(balancesByCurrency) as Array<[string, number]>;
  const recurringEntries = Object.entries(activeBillsCentsByCurrency) as Array<[string, number]>;

  return {
    now_iso: new Date().toISOString(),
    data_quality: {
      recurring_bills_ok: !rbErr,
      recurring_bills_count_active: rb.length,
      recurring_bills_count_due_this_month: due_this_month.length,
      accounts_ok: !acctErr,
      accounts_count_active: acct.length,
      decisions_ok: !decErr,
      decisions_count_open: decisions_open.length,
      note: "Bills come from recurring_bills. Accounts come from accounts. Decisions come from decisions (status != decided).",
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
    decisions_open,
    money_summary: {
      balances_by_currency: balancesEntries.map(([currency, cents]) => ({
        currency,
        balance: moneyFromCents(cents, currency),
      })),
      recurring_bills_totals_by_currency: recurringEntries.map(([currency, cents]) => ({
        currency,
        total: moneyFromCents(cents, currency),
      })),
      notes: "Summaries are derived from active accounts and recurring_bills only.",
    },
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
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { answer: "I couldn’t format that safely. Try again.", action: "none", suggested_next: "none", framing_seed: null },
        { status: 502 }
      );
    }

    const obj = parsed as Record<string, unknown>;

    const answer = String(obj.answer ?? "").trim().slice(0, 4000);
    const action: Action = isAction(obj.action) ? (obj.action as Action) : "none";
    const suggested_next: SuggestedNext = isSuggestedNext(obj.suggested_next) ? (obj.suggested_next as SuggestedNext) : "none";

    const framing_seed =
      suggested_next === "create_framing" && obj.framing_seed && typeof obj.framing_seed === "object"
        ? {
            title: String((obj.framing_seed as any).title ?? "").slice(0, 120) || "Decision to frame",
            prompt: String((obj.framing_seed as any).prompt ?? "").slice(0, 2000) || "",
            notes: Array.isArray((obj.framing_seed as any).notes)
              ? ((obj.framing_seed as any).notes as unknown[]).map((x: unknown) => String(x)).slice(0, 10)
              : [],
          }
        : null;

    return NextResponse.json({ answer, action, suggested_next, framing_seed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
