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
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n / 100);
  } catch {
    return `${cur} ${(n / 100).toFixed(2)}`;
  }
}

function ageFromBirthYear(birth_year: number | null | undefined) {
  if (typeof birth_year !== "number" || !Number.isFinite(birth_year)) return null;
  const y = Math.floor(birth_year);
  const nowY = new Date().getFullYear();
  const age = nowY - y;
  return age >= 0 && age <= 130 ? age : null;
}

function normalizeGoalStatus(s: unknown): "active" | "paused" | "done" | "archived" {
  const t = String(s ?? "active").trim().toLowerCase();
  if (t === "paused" || t === "done" || t === "archived") return t;
  return "active";
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

function isBufferIntent(q: string) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return false;
  return /\b(buffer|emergency fund|rainy day)\b/.test(s);
}

function pct(current: number, target: number) {
  if (target <= 0) return 0;
  const p = Math.round((current / target) * 100);
  return Math.max(0, Math.min(999, p));
}

function isGoalsIntent(q: string) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return false;
  return /\b(goal|goals|savings goal|savings goals|money goal|money goals|target|targets)\b/.test(s);
}

function isAffordIntent(q: string) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return false;
  return /(can we afford|can i afford|should we|safe to spend|is it safe to spend|can i spend|can we spend)\b/.test(s);
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

type MoneyGoalRow = {
  id: string;
  user_id: string;
  title: string | null;
  currency: string | null;
  target_cents: number | null;
  current_cents: number | null;
  status: string | null;

  target_date: string | null;     // date
  deadline_at: string | null;     // timestamp w/ tz

  notes: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
  created_at: string | null;
  updated_at: string | null;
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

  // --- Family ---
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

  // --- Review ---
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

  // --- Chapters ---
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

  // --- Goals (new) ---
  let goalsErrFlag = false;
  let goalsRows: MoneyGoalRow[] = [];

  try {
    const { data, error } = await supabase
      .from("money_goals")
      .select("*")
      .eq("user_id", userId)
      .limit(200);

    goalsErrFlag = !!error;
    if (!error && Array.isArray(data)) goalsRows = data as MoneyGoalRow[];
  } catch {
    goalsErrFlag = true;
    goalsRows = [];
  }

  const goalsClean = goalsRows.map((g) => {
    const status = normalizeGoalStatus(g.status);
    const currency = String(g.currency ?? "AUD").toUpperCase();
    const targetCents = typeof g.target_cents === "number" ? g.target_cents : g.target_cents == null ? null : Number(g.target_cents);
    const currentCents =
      typeof g.current_cents === "number" ? g.current_cents : g.current_cents == null ? null : Number(g.current_cents);

    return {
      id: String(g.id),
      title: String(g.title ?? "Goal").trim() || "Goal",
      currency,
      status,
      target_cents: Number.isFinite(targetCents as any) ? (targetCents as any as number) : null,
      current_cents: Number.isFinite(currentCents as any) ? (currentCents as any as number) : null,
      target_date: typeof (g as any).target_date === "string" ? (g as any).target_date : null,
      deadline_at: typeof (g as any).deadline_at === "string" ? (g as any).deadline_at : null,
      notes: typeof g.notes === "string" ? g.notes : null,
      is_primary: typeof (g as any).is_primary === "boolean" ? ((g as any).is_primary as boolean) : null,
      sort_order: typeof (g as any).sort_order === "number" ? ((g as any).sort_order as number) : null,
      created_at: typeof g.created_at === "string" ? g.created_at : null,
      updated_at: typeof g.updated_at === "string" ? g.updated_at : null,
    };
  });

  const goalsActive = goalsClean.filter((g) => g.status !== "archived");
  const goalsPrimary = goalsClean.find((g) => g.is_primary === true) ?? null;

  const goalsPreviewTitles = [...goalsActive]
    .sort((a, b) => {
      const ap = a.is_primary ? 1 : 0;
      const bp = b.is_primary ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const au = Date.parse(a.updated_at || a.created_at || "") || 0;
      const bu = Date.parse(b.updated_at || b.created_at || "") || 0;
      return bu - au;
    })
    .slice(0, 3)
    .map((g) => g.title);

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
      goals_ok: !goalsErrFlag,
      goals_count_total: goalsClean.length,
      goals_count_active: goalsActive.length,
      goals_preview_titles_count: goalsPreviewTitles.length,
      note:
        "Bills come from recurring_bills. Accounts come from accounts. Decisions come from decisions. Family comes from family_members + pets. Review comes from decisions.review_at (pending only). Chapters come from decisions where status='chapter' (or chaptered_at is set). Goals come from money_goals.",
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
    goals: {
      count_total: goalsClean.length,
      count_active: goalsActive.length,
      preview_titles: goalsPreviewTitles,
primary: goalsPrimary
  ? (() => {
      const cur = typeof goalsPrimary.current_cents === "number" ? goalsPrimary.current_cents : 0;
      const tgt = typeof goalsPrimary.target_cents === "number" ? goalsPrimary.target_cents : 0;
      const remaining = tgt > 0 ? Math.max(0, tgt - cur) : null;
      return {
        id: goalsPrimary.id,
        title: goalsPrimary.title,
        status: goalsPrimary.status,
        currency: goalsPrimary.currency,

        // display strings
        target: moneyFromCents(goalsPrimary.target_cents ?? null, goalsPrimary.currency),
        current: moneyFromCents(goalsPrimary.current_cents ?? null, goalsPrimary.currency),
        remaining: remaining == null ? null : moneyFromCents(remaining, goalsPrimary.currency),

        // raw numbers (for deterministic %)
        target_cents: tgt > 0 ? tgt : null,
        current_cents: cur,
        remaining_cents: remaining,
        percent: tgt > 0 ? pct(cur, tgt) : null,

        target_date: (goalsPrimary as any).target_date ?? null,
      };
    })()
  : null,
      active: goalsActive.slice(0, 20).map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        currency: g.currency,
target: moneyFromCents(g.target_cents ?? null, g.currency),
current: moneyFromCents(g.current_cents ?? null, g.currency),

target_cents: typeof g.target_cents === "number" ? g.target_cents : null,
current_cents: typeof g.current_cents === "number" ? g.current_cents : 0,
remaining_cents:
  typeof g.target_cents === "number"
    ? Math.max(0, (g.target_cents ?? 0) - (typeof g.current_cents === "number" ? g.current_cents : 0))
    : null,
percent:
  typeof g.target_cents === "number"
    ? pct(typeof g.current_cents === "number" ? g.current_cents : 0, g.target_cents)
    : null,
      target_date: (g as any).target_date ?? null,
        is_primary: g.is_primary === true,
      })),
      notes: "Goals come from money_goals. Read-only in Home Ask.",
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

GOALS:
- Use facts.goals only.
- Always give the active count first: facts.goals.count_active.
- If facts.goals.count_active > 0 and facts.goals.preview_titles has items, include up to 3 titles in the same response.
- If facts.goals.primary exists, you may mention it as "Primary goal: <title>" and include current/target if present.
- Do not suggest tactics or advice. Fact-only.
- Set action="open_money" for goal questions (Goals live under Money).

FAMILY:
- Use facts.family only.
- Answer factually: counts, names, relationships (if provided), and ages if available.
- Ages are approximate (derived from birth_year). If birth_year is missing, say you can’t see an age for that person.
- Do not infer roles beyond what is stated (relationship is free-text). Do not guess relationships.
- Pets are part of the household. If asked, list pets with name + type if present.
- Do not give parenting advice or commentary. If asked something subjective, say you can’t answer and STOP.
- If a user asks to change/edit family members, explain you can’t do that here and suggest going to the Family page.

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

    // ✅ Deterministic AFFORD handling (skip AI)
if (isAffordIntent(question)) {
  const money = (facts as any)?.money_summary;

  const balancesArr = Array.isArray(money?.balances_by_currency) ? money.balances_by_currency : [];
  const billsArr = Array.isArray(money?.recurring_bills_totals_by_currency) ? money.recurring_bills_totals_by_currency : [];

  const balances =
    balancesArr.length > 0
      ? balancesArr
          .map((b: any) => {
            const cur = typeof b?.currency === "string" ? b.currency : "";
            const bal = typeof b?.balance === "string" ? b.balance : "—";
            return `• ${cur}: ${bal}`;
          })
          .join("\n")
      : "• (no account balances visible)";

  const bills =
    billsArr.length > 0
      ? billsArr
          .map((b: any) => {
            const cur = typeof b?.currency === "string" ? b.currency : "";
            const tot = typeof b?.total === "string" ? b.total : "—";
            return `• ${cur}: ${tot}`;
          })
          .join("\n")
      : "• (no recurring bills totals visible)";

  return NextResponse.json({
    answer: [
      "Here’s what I can see right now:",
      "",
      "Available balances:",
      balances,
      "",
      "Recurring commitments:",
      bills,
      "",
      "I can’t say “yes” or “no” from here — but we can frame it safely.",
    ].join("\n"),
    action: "open_money",
    suggested_next: "create_capture",
    capture_seed: {
      title: question,
      prompt: question,
      notes: [
        "Affordability question — no permission granted",
        "Known: current balances (accounts)",
        "Known: recurring commitments (recurring bills totals)",
        "Unknown: timing, one-off vs recurring, which account pays, required buffer",
      ],
    },
  });
}

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

// ✅ Deterministic GOALS handling (skip AI)
if (isGoalsIntent(question) || isBufferIntent(question)) {
  const goals = (facts as any)?.goals;
  const countActive = typeof goals?.count_active === "number" ? goals.count_active : 0;
  const previewTitles = Array.isArray(goals?.preview_titles) ? goals.preview_titles : [];
  const primary = goals?.primary ?? null;
  const active = Array.isArray(goals?.active) ? goals.active : [];

  if (countActive <= 0) {
    return NextResponse.json({
      answer: "There are no active goals (from what I can see).",
      action: "open_money",
      suggested_next: "none",
      capture_seed: null,
    });
  }

  // If they asked about “buffer”, try to locate a buffer goal deterministically:
  if (isBufferIntent(question)) {
    const buffer = (() => {
      // 1) prefer primary if it looks like buffer
      if (primary?.title && typeof primary.title === "string" && /buffer|emergency|rainy/i.test(primary.title)) return primary;

      // 2) search active list for a title match
      const hit = active.find((g: any) => typeof g?.title === "string" && /buffer|emergency|rainy/i.test(g.title));
      if (hit) return hit;

      // 3) fallback: if only one goal exists, treat it as “the buffer you mean” is unknown; don’t guess
      return null;
    })();

    if (!buffer) {
      return NextResponse.json({
        answer:
          "I can see your goals, but I can’t see one explicitly named like “buffer” / “emergency fund”. If you tell me the goal’s name, I can report its progress exactly.",
        action: "open_money",
        suggested_next: "none",
        capture_seed: null,
      });
    }

    const title = String(buffer.title || "Buffer").trim() || "Buffer";
    const cur = typeof buffer.current === "string" ? buffer.current : null;
    const tgt = typeof buffer.target === "string" ? buffer.target : null;
    const rem = typeof buffer.remaining === "string" ? buffer.remaining : null;
    const p = typeof buffer.percent === "number" ? buffer.percent : null;

    // If there’s no target, we can’t compute “how close” — say that plainly.
    if (!tgt) {
      return NextResponse.json({
        answer: `Your “${title}” goal is currently at ${cur ?? "—"} (from what I can see). I can’t calculate “how close” because I can’t see a target amount for it.`,
        action: "open_money",
        suggested_next: "none",
        capture_seed: null,
      });
    }

    const bits: string[] = [];
    bits.push(`Your buffer goal (“${title}”) is at ${cur ?? "—"} / ${tgt}${p != null ? ` (${p}%)` : ""}.`);
    if (rem) bits.push(`Remaining: ${rem}.`);

    return NextResponse.json({
      answer: bits.join(" "),
      action: "open_money",
      suggested_next: "none",
      capture_seed: null,
    });
  }

  // Normal goals summary (non-buffer)
  const parts: string[] = [];
  parts.push(`There are ${countActive} active goals.`);

  if (primary && typeof primary?.title === "string" && primary.title.trim()) {
    const cur = typeof primary?.current === "string" ? primary.current : null;
    const tgt = typeof primary?.target === "string" ? primary.target : null;
    const p = typeof primary?.percent === "number" ? primary.percent : null;
    const rem = typeof primary?.remaining === "string" ? primary.remaining : null;

    const progress =
      cur && tgt ? ` (${cur} / ${tgt}${p != null ? `, ${p}%` : ""}${rem ? `, remaining ${rem}` : ""})` : cur ? ` (${cur})` : "";

    parts.push(`Primary goal: ${primary.title.trim()}${progress}.`);
  }

  if (previewTitles.length > 0) {
    const titles = previewTitles
      .map((t: any) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean)
      .slice(0, 3);
    if (titles.length > 0) parts.push(`Including: ${titles.join(", ")}.`);
  }

  return NextResponse.json({
    answer: parts.join(" "),
    action: "open_money",
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
