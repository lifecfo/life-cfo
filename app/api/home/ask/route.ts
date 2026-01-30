// app/api/home/ask/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Action = "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
type SuggestedNext = "none" | "create_capture" | "open_thinking";

type AskRequest = { userId: string; question: string };

function isAction(x: unknown): x is Action {
  return (
    typeof x === "string" &&
    (["open_bills", "open_money", "open_decisions", "open_review", "open_chapters", "none"] as const).includes(x as Action)
  );
}
function isSuggestedNext(x: unknown): x is SuggestedNext {
  return typeof x === "string" && (["none", "create_capture", "open_thinking"] as const).includes(x as SuggestedNext);
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

function ageFromBirthYear(birth_year: number | null | undefined) {
  if (typeof birth_year !== "number" || !Number.isFinite(birth_year)) return null;
  const y = Math.floor(birth_year);
  const nowY = new Date().getFullYear();
  const age = nowY - y;
  return age >= 0 && age <= 130 ? age : null;
}

function isReviewIntent(q: string) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return false;
  return /\b(review|revisit|check[- ]?in|coming up for review|upcoming review|review list|check-in list)\b/.test(s);
}

function isChaptersIntent(q: string) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return false;
  return /\b(chapter|chapters|completed decision|completed decisions|closed decision|closed decisions)\b/.test(s);
}

function formatDateShort(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type RecurringBillFact = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
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
  status: string | null;
  created_at: string | null;
  decided_at: string | null;
  review_at: string | null;
  reviewed_at?: string | null;
};

type FamilyMemberRow = {
  id: string;
  name: string | null;
  birth_year: number | null;
  relationship: string | null;
  about: string | null;
  created_at: string | null;
};

type PetRow = {
  id: string;
  name: string | null;
  type: string | null;
  notes: string | null;
  created_at: string | null;
};

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

  const { data: accounts, error: acctErr } = await supabase
    .from("accounts")
    .select("id,name,type,status,current_balance_cents,currency,archived,updated_at")
    .eq("user_id", userId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  const acct = (accounts ?? []) as AccountFact[];

  const { data: decisions, error: decErr } = await supabase
    .from("decisions")
    .select("id,title,status,created_at,decided_at,review_at,reviewed_at")
    .eq("user_id", userId)
    .is("decided_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  const decisions_open = (decisions ?? []) as DecisionFact[];

  type OpenDecisionPreviewRow = { title: string | null; created_at: string | null };

  let openDecisionTitles: string[] = [];
  try {
    const { data: openPreview, error: openPreviewErr } = await supabase
      .from("decisions")
      .select("title, created_at")
      .eq("user_id", userId)
      .is("decided_at", null)
      .order("created_at", { ascending: true })
      .limit(3);

    if (!openPreviewErr && Array.isArray(openPreview)) {
      openDecisionTitles = (openPreview as OpenDecisionPreviewRow[])
        .map((r) => (typeof r?.title === "string" ? r.title.trim() : ""))
        .filter(Boolean);
    }
  } catch {
    openDecisionTitles = [];
  }

  let familyMembers: Array<{
    id: string;
    name: string;
    relationship: string | null;
    birth_year: number | null;
    approx_age: number | null;
    about: string | null;
  }> = [];

  let pets: Array<{
    id: string;
    name: string;
    type: string | null;
    notes: string | null;
  }> = [];

  let fmErrFlag = false;
  let petsErrFlag = false;

  try {
    const { data, error } = await supabase
      .from("family_members")
      .select("id,name,birth_year,relationship,about,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(30);

    fmErrFlag = !!error;
    if (!error && Array.isArray(data)) {
      familyMembers = (data as FamilyMemberRow[]).map((m) => {
        const by = typeof m.birth_year === "number" ? m.birth_year : m.birth_year == null ? null : Number(m.birth_year);
        return {
          id: String(m.id),
          name: String(m.name ?? "Family member").trim() || "Family member",
          relationship: m.relationship ? String(m.relationship).trim() : null,
          birth_year: by,
          approx_age: ageFromBirthYear(by),
          about: m.about ? String(m.about) : null,
        };
      });
    }
  } catch {
    fmErrFlag = true;
    familyMembers = [];
  }

  try {
    const { data, error } = await supabase
      .from("pets")
      .select("id,name,type,notes,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    petsErrFlag = !!error;
    if (!error && Array.isArray(data)) {
      pets = (data as PetRow[]).map((p) => ({
        id: String(p.id),
        name: String(p.name ?? "Pet").trim() || "Pet",
        type: p.type ? String(p.type).trim() : null,
        notes: p.notes ? String(p.notes) : null,
      }));
    }
  } catch {
    petsErrFlag = true;
    pets = [];
  }

  type ReviewRow = { id: string; title: string | null; review_at: string | null; reviewed_at: string | null };

  let reviewItems: Array<{ id: string; title: string; review_at: string }> = [];
  let reviewErrFlag = false;

  try {
    const { data, error } = await supabase
      .from("decisions")
      .select("id,title,review_at,reviewed_at")
      .eq("user_id", userId)
      .not("review_at", "is", null)
      .is("reviewed_at", null)
      .order("review_at", { ascending: true })
      .limit(10);

    reviewErrFlag = !!error;

    if (!error && Array.isArray(data)) {
      reviewItems = (data as ReviewRow[])
        .filter((r) => typeof r.review_at === "string")
        .map((r) => ({
          id: String(r.id),
          title: String(r.title ?? "Decision").trim() || "Decision",
          review_at: String(r.review_at),
        }));
    }
  } catch {
    reviewErrFlag = true;
    reviewItems = [];
  }

  type ChapterRow = {
    id: string;
    title: string | null;
    chaptered_at: string | null;
    status: string | null;
    created_at: string | null;
  };

  let chapterItems: Array<{ id: string; title: string; chaptered_at: string | null }> = [];
  let chaptersErrFlag = false;

  try {
    const { data, error } = await supabase
      .from("decisions")
      .select("id,title,chaptered_at,status,created_at")
      .eq("user_id", userId)
      .or("status.eq.chapter,chaptered_at.not.is.null")
      .order("chaptered_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(10);

    chaptersErrFlag = !!error;

    if (!error && Array.isArray(data)) {
      chapterItems = (data as ChapterRow[]).map((c) => ({
        id: String(c.id),
        title: String(c.title ?? "Decision").trim() || "Decision",
        chaptered_at: typeof c.chaptered_at === "string" ? c.chaptered_at : null,
      }));
    }
  } catch {
    chaptersErrFlag = true;
    chapterItems = [];
  }

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
      decisions_open_count: decisions_open.length,
      decisions_open_preview_titles_count: openDecisionTitles.length,
      family_members_ok: !fmErrFlag,
      family_members_count: familyMembers.length,
      pets_ok: !petsErrFlag,
      pets_count: pets.length,
      review_ok: !reviewErrFlag,
      review_count: reviewItems.length,
      chapters_ok: !chaptersErrFlag,
      chapters_count: chapterItems.length,
      note:
        "Bills come from recurring_bills. Accounts come from accounts. Decisions come from decisions. Family comes from family_members + pets. Review comes from decisions.review_at (pending only). Chapters come from decisions where status='chapter' (or chaptered_at is set).",
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
    decisions_open: decisions_open.map((d) => ({
      id: d.id,
      title: String(d.title ?? "Decision").trim(),
      status: String(d.status ?? ""),
      created_at: d.created_at ?? null,
      decided_at: d.decided_at ?? null,
      review_at: d.review_at ?? null,
      reviewed_at: (d as any).reviewed_at ?? null,
    })),
    open_decisions_preview: {
      count: decisions_open.length,
      titles: openDecisionTitles,
      notes: "Preview titles are capped (max 3) and ordered by created_at ascending. Use only these titles when giving examples.",
    },
    family: {
      count_members: familyMembers.length,
      members: familyMembers,
      count_pets: pets.length,
      pets,
      notes:
        "Family is read-only. Ages are approximate (derived from birth_year). Relationships are free-text if provided. Pets are included as part of the household.",
    },
    review: {
      count: reviewItems.length,
      upcoming: reviewItems.slice(0, 3),
      notes: "Review items are decisions with a review_at date that have not been reviewed yet (reviewed_at is null). Read-only.",
    },
    chapters: {
      count: chapterItems.length,
      recent: chapterItems.slice(0, 3),
      notes: "Chapters are completed decisions kept for reference (status='chapter' or chaptered_at set). Read-only.",
    },
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

OPEN DECISIONS:
- Primary source for examples is facts.open_decisions_preview (count + titles).
- When the user asks about open decisions (any wording like "open decisions", "still deciding", "any open decisions"):
  - Always give the count first (use facts.open_decisions_preview.count).
  - If facts.open_decisions_preview.count > 0 AND facts.open_decisions_preview.titles has at least 1 title:
    - You MUST include the preview titles in the same response (up to 3).
    - Use ONLY the provided titles. Never invent titles.
    - Prefer one calm sentence: "There are X open decisions, including: A, B, C."
  - If there are no preview titles available, just give the count.
  - Never infer "most important" or urgency.
  - If the user explicitly asks to list them, you may list up to 5 titles using facts.decisions_open (still: do not invent).
- Set action="open_decisions" when user asks about open decisions.

FAMILY:
- Use facts.family only.
- Answer factually: counts, names, relationships (if provided), and ages if available.
- Ages are approximate (derived from birth_year). If birth_year is missing, say you can’t see an age for that person.
- Do not infer roles beyond what is stated (relationship is free-text). Do not guess relationships.
- Pets are part of the household. If asked, list pets with name + type if present.
- Do not give parenting advice or commentary. If asked something subjective, say you can’t answer and STOP.
- If a user asks to change/edit family members, explain you can’t do that here and suggest going to the Family page (but do not invent navigation if it doesn't exist).

REVIEW:
- Use facts.review ONLY.
- Review items are decisions with a review_at date that have not been reviewed yet (reviewed_at is null).
- NEVER use bills, money, or time-window heuristics for review questions.
- When the user asks about review / revisit / check-in:
  - Always answer from facts.review.
  - Always give the count first.
  - If items exist:
    - Prefer a short bullet list (up to 3 items).
    - Each item should include the title and its review date.
    - Use calm phrasing like: "scheduled for Tue, 4 Feb 2026".
    - Never say "due".
  - Keep tone calm and non-urgent.
- Set action="open_review" for review questions.
- Do not suggest action.
- If no review items exist, say so plainly and STOP.

CHAPTERS:
- Use facts.chapters ONLY.
- Chapters are completed decisions kept for reference (status='chapter' or chaptered_at set).
- Always give the count first.
- If count > 0 and facts.chapters.recent has items, include up to 3 titles (and dates if present).
- Do not interpret or summarise meaning. Do not suggest next steps.
- Set action="open_chapters" when the user asks about chapters / completed decisions / what we’ve closed / wrapped up.
- If no chapters exist, say so plainly and STOP.

AFFORD / SHOULD-WE:
- Never grant permission.
- Provide a bounded frame (accounts + upcoming bills) if relevant.
- If it needs more context/tradeoffs/missing inputs, set suggested_next="create_capture"

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

    // 🔒 SAFETY INTERCEPT (V1 REQUIRED)
    // Pre-answer gate. Hard stop. No facts pack. No AI. No routing.
    const intercept = maybeCrisisIntercept(question);
    if (intercept) {
      return NextResponse.json({
        answer: intercept.content,
        action: "none",
        suggested_next: "none",
        capture_seed: null,
        kind: intercept.kind,
      });
    }

    const facts = await buildFactsPack(userId);

    // ✅ Deterministic REVIEW handling (skip AI)
    if (isReviewIntent(question)) {
      const review = (facts as any)?.review;
      const count = typeof review?.count === "number" ? review.count : 0;
      const upcoming = Array.isArray(review?.upcoming) ? review.upcoming : [];

      if (count <= 0 || upcoming.length === 0) {
        return NextResponse.json({
          answer: "There are no items scheduled for review (from what I can see).",
          action: "open_review",
          suggested_next: "none",
          capture_seed: null,
        });
      }

      const lines = upcoming.slice(0, 3).map((it: any) => {
        const title = typeof it?.title === "string" ? it.title.trim() : "Decision";
        const at = typeof it?.review_at === "string" ? it.review_at : "";
        const when = at ? formatDateShort(at) : "";
        return `• ${title}${when ? ` — scheduled for ${when}` : ""}`;
      });

      const answer = `There are ${count} items scheduled for review.\n\n${lines.join("\n")}`;

      return NextResponse.json({
        answer,
        action: "open_review",
        suggested_next: "none",
        capture_seed: null,
      });
    }

    // ✅ Deterministic CHAPTERS handling (skip AI)
    if (isChaptersIntent(question)) {
      const chapters = (facts as any)?.chapters;
      const count = typeof chapters?.count === "number" ? chapters.count : 0;
      const recent = Array.isArray(chapters?.recent) ? chapters.recent : [];

      if (count <= 0 || recent.length === 0) {
        return NextResponse.json({
          answer: "There are no chapters yet (from what I can see).",
          action: "open_chapters",
          suggested_next: "none",
          capture_seed: null,
        });
      }

      const lines = recent.slice(0, 3).map((it: any) => {
        const title = typeof it?.title === "string" ? it.title.trim() : "Decision";
        const at = typeof it?.chaptered_at === "string" ? it.chaptered_at : "";
        const when = at ? formatDateShort(at) : "";
        return `• ${title}${when ? ` — closed on ${when}` : ""}`;
      });

      const answer = `There are ${count} chapters.\n\n${lines.join("\n")}`;

      return NextResponse.json({
        answer,
        action: "open_chapters",
        suggested_next: "none",
        capture_seed: null,
      });
    }

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
              action: {
                type: "string",
                enum: ["open_bills", "open_money", "open_decisions", "open_review", "open_chapters", "none"],
              },
              suggested_next: { type: "string", enum: ["none", "create_capture", "open_thinking"] },
              capture_seed: {
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
            required: ["answer", "action", "suggested_next", "capture_seed"],
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
        { answer: "I couldn’t format that safely. Try again.", action: "none", suggested_next: "none", capture_seed: null },
        { status: 502 }
      );
    }

    const obj = parsed as Record<string, unknown>;

    const answer = String(obj.answer ?? "").trim().slice(0, 4000);
    const action: Action = isAction(obj.action) ? (obj.action as Action) : "none";
    const suggested_next: SuggestedNext = isSuggestedNext(obj.suggested_next) ? (obj.suggested_next as SuggestedNext) : "none";

    const capture_seed =
      suggested_next === "create_capture" && obj.capture_seed && typeof obj.capture_seed === "object"
        ? {
            title: String((obj.capture_seed as any).title ?? "").slice(0, 120) || "Capture",
            prompt: String((obj.capture_seed as any).prompt ?? "").slice(0, 2000) || "",
            notes: Array.isArray((obj.capture_seed as any).notes)
              ? ((obj.capture_seed as any).notes as unknown[]).map((x: unknown) => String(x)).slice(0, 10)
              : [],
          }
        : null;

    return NextResponse.json({ answer, action, suggested_next, capture_seed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
