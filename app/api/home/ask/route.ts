// app/api/home/ask/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { maybeCrisisIntercept } from "@/lib/safety/guard";
import { decideHomeTone, type HomeTone } from "@/lib/lifecfo/homeTone";
import { decideVerdict } from "@/lib/lifecfo/verdictDecision";
import type { Verdict } from "@/lib/lifecfo/verdict";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import {
  tryRunHouseholdMoneyReasoning,
  type HouseholdMoneyReasoningResult,
} from "@/lib/money/reasoning/runHouseholdMoneyReasoning";
import { isHomeAffordabilityIntent } from "@/lib/money/reasoning/intentDetection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Action = "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
type SuggestedNext = "none" | "create_capture" | "open_thinking";

type AskRequest = { userId?: string; question?: string };

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

/* ---------------- memo formatting helpers ---------------- */

function mdSection(title: string, lines: string[]) {
  const body = lines.filter(Boolean).join("\n");
  return body ? `**${title}**\n${body}` : "";
}

function mdBullets(items: string[]) {
  return items.filter(Boolean).map((x) => `- ${x}`).join("\n");
}

function buildMemoAnswer(params: {
  headline: string;
  key_points?: string[];
  details?: string;
  assumptions?: string[];
  what_changes_this?: string[];
}) {
  const headline = (params.headline || "").trim();

  const keyPoints = Array.isArray(params.key_points) ? params.key_points.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const assumptions = Array.isArray(params.assumptions) ? params.assumptions.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const changes = Array.isArray(params.what_changes_this)
    ? params.what_changes_this.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  const details = typeof params.details === "string" ? params.details.trim() : "";

  const blocks: string[] = [];
  if (headline) blocks.push(headline);

  const kpBlock = mdSection("Key points", [mdBullets(keyPoints)]);
  if (kpBlock) blocks.push(kpBlock);

  const detailsBlock = mdSection("Details", [details]);
  if (detailsBlock) blocks.push(detailsBlock);

  const changesBlock = mdSection("What would change this", [mdBullets(changes)]);
  if (changesBlock) blocks.push(changesBlock);

  const assumptionsBlock = mdSection("Assumptions", [mdBullets(assumptions)]);
  if (assumptionsBlock) blocks.push(assumptionsBlock);

  return blocks.filter(Boolean).join("\n\n").trim();
}

/* ---------------- facts pack ---------------- */

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

  target_date: string | null; // date
  deadline_at: string | null; // timestamp w/ tz

  notes: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
  created_at: string | null;
  updated_at: string | null;
};

async function buildFactsPack(scope: { userId: string; householdId: string }) {
  const { userId, householdId } = scope;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { start, end } = monthBoundsLocal();

  const { data: recurringBills, error: rbErr } = await supabase
    .from("recurring_bills")
    .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes,updated_at")
    .eq("household_id", householdId)
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
    .eq("household_id", householdId)
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(50);

  const acct = (accounts ?? []) as AccountFact[];

  // --- Goal ↔ Account links (V1: explicit join only) ---
  type GoalAccountLinkRow = { goal_id: string; account_id: string; weight: number | null };

  let goalAccountLinks: GoalAccountLinkRow[] = [];
  let goalAccountsErrFlag = false;

  try {
    const { data, error } = await supabase.from("money_goal_accounts").select("goal_id,account_id,weight").eq("user_id", userId).limit(500);
    goalAccountsErrFlag = !!error;
    if (!error && Array.isArray(data)) goalAccountLinks = data as GoalAccountLinkRow[];
  } catch {
    goalAccountsErrFlag = true;
    goalAccountLinks = [];
  }

  const acctById = new Map(
    acct.map((a) => [
      a.id,
      {
        id: a.id,
        name: String(a.name ?? "Account"),
        currency: String(a.currency ?? "AUD").toUpperCase(),
        current_balance_cents:
          typeof a.current_balance_cents === "number"
            ? a.current_balance_cents
            : a.current_balance_cents == null
              ? null
              : Number(a.current_balance_cents),
      },
    ])
  );

  const linkedAccountsByGoalId = new Map<
    string,
    Array<{ id: string; name: string; currency: string; current_balance_cents: number | null; weight: number }>
  >();

  for (const link of goalAccountLinks) {
    const goalId = String(link.goal_id);
    const acctId = String(link.account_id);
    const a = acctById.get(acctId);
    if (!a) continue;

    const arr = linkedAccountsByGoalId.get(goalId) ?? [];
    arr.push({
      id: a.id,
      name: a.name,
      currency: a.currency,
      current_balance_cents: typeof a.current_balance_cents === "number" && Number.isFinite(a.current_balance_cents) ? a.current_balance_cents : null,
      weight: typeof link.weight === "number" && Number.isFinite(link.weight) ? link.weight : 100,
    });
    linkedAccountsByGoalId.set(goalId, arr);
  }

  const { data: decisions, error: decErr } = await supabase
    .from("decisions")
    .select("id,title,status,created_at,decided_at,review_at,reviewed_at")
    .eq("household_id", householdId)
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
      .eq("household_id", householdId)
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
    const { data, error } = await supabase.from("pets").select("id,name,type,notes,created_at").eq("user_id", userId).order("created_at", { ascending: true }).limit(20);

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
      .eq("household_id", householdId)
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
      .eq("household_id", householdId)
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

  // --- Goals ---
  let goalsErrFlag = false;
  let goalsRows: MoneyGoalRow[] = [];

  try {
    const { data, error } = await supabase
      .from("money_goals")
      .select("*")
      .eq("household_id", householdId)
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
    const currentCents = typeof g.current_cents === "number" ? g.current_cents : g.current_cents == null ? null : Number(g.current_cents);

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
      linked_accounts: (linkedAccountsByGoalId.get(String(g.id)) ?? []).sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100)),
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
      const cents = typeof a.current_balance_cents === "number" ? a.current_balance_cents : a.current_balance_cents == null ? null : Number(a.current_balance_cents);
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

  let moneyReasoningOk = false;
  let moneyReasoningNote = "";
  let moneyReasoning: HouseholdMoneyReasoningResult | null = null;

  const moneyReasoningResult = await tryRunHouseholdMoneyReasoning(
    supabase as any,
    { householdId }
  );
  if (moneyReasoningResult.ok) {
    moneyReasoning = moneyReasoningResult.data;
    moneyReasoningOk = true;
  } else {
    moneyReasoningOk = false;
    moneyReasoningNote = moneyReasoningResult.error;
  }

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
      goal_accounts_ok: !goalAccountsErrFlag,
      goals_count_total: goalsClean.length,
      goals_count_active: goalsActive.length,
      goals_preview_titles_count: goalsPreviewTitles.length,
      money_reasoning_ok: moneyReasoningOk,
      money_reasoning_note: moneyReasoningNote || null,
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
      notes: "Family is read-only. Ages are approximate (derived from birth_year). Relationships are free-text if provided. Pets are included as part of the household.",
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
              target: moneyFromCents(goalsPrimary.target_cents ?? null, goalsPrimary.currency),
              current: moneyFromCents(goalsPrimary.current_cents ?? null, goalsPrimary.currency),
              remaining: remaining == null ? null : moneyFromCents(remaining, goalsPrimary.currency),
              target_cents: tgt > 0 ? tgt : null,
              current_cents: cur,
              remaining_cents: remaining,
              percent: tgt > 0 ? pct(cur, tgt) : null,
              target_date: (goalsPrimary as any).target_date ?? null,
              linked_accounts: (linkedAccountsByGoalId.get(String(goalsPrimary.id)) ?? []).sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100)),
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
        percent: typeof g.target_cents === "number" ? pct(typeof g.current_cents === "number" ? g.current_cents : 0, g.target_cents) : null,
        target_date: (g as any).target_date ?? null,
        is_primary: g.is_primary === true,
        linked_accounts: (linkedAccountsByGoalId.get(String(g.id)) ?? []).sort((a, b) => (a.weight ?? 100) - (b.weight ?? 100)),
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
    // 🔒 Deterministic-only raw totals used for verdict selection
    money_summary_raw: {
      balances_by_currency_cents: balancesEntries.map(([currency, cents]) => ({ currency, cents })),
      recurring_bills_totals_by_currency_cents: recurringEntries.map(([currency, cents]) => ({ currency, cents })),
    },
    money_reasoning: moneyReasoning
      ? {
          snapshot: moneyReasoning.snapshot,
          explanation: moneyReasoning.explanation,
          interpretation: moneyReasoning.explanation.interpretation,
          notes:
            "Grounded household money reasoning baseline reused from the Money Ask pipeline (truth -> snapshot -> explanation).",
        }
      : null,
  };
}

/* ---------------- prompt ---------------- */

const SYSTEM = `
You are Life CFO Home Ask.

You must respond as a calm, careful household CFO.

NON-NEGOTIABLE RULES
- You may ONLY answer using FACTS PACK (+ now_iso). No web. No guessing. No invention.
- If required data isn't present, say what you can/can’t see and STOP.
- No urgency. No pressure. No “you should”. No pretending anything was saved.
- Answer-first. Save-later. Never imply persistence.

OUTPUT REQUIREMENT (FIELDS ONLY)
Return structured fields only:
- headline: one sentence, plain, specific, non-duplicative
- key_points: 2–5 bullets max (short, factual)
- details: optional, short paragraph(s) (factual)
- what_changes_this: 2–4 bullets max (conditions that would change the conclusion)
- assumptions: 2–4 bullets max (assumptions from the visible data)

IMPORTANT
- Do NOT format a full memo. Server will render the memo from your fields.
- Do NOT choose tone/verdict. Server decides verdict deterministically.

ROUTING
- Choose action from: open_bills, open_money, open_decisions, open_review, open_chapters, none
- suggested_next from: none, create_capture, open_thinking
- capture_seed only when suggested_next="create_capture"

OPEN DECISIONS
- Use facts.open_decisions_preview for examples (count + up to 3 titles).
- If asked about open decisions: give count first and include preview titles if present.
- Never invent titles.

GOALS / REVIEW / CHAPTERS
- Use facts.goals / facts.review / facts.chapters only.
- Always count first; list up to 3 items/titles if present.
- Never say “due”. Use “scheduled for”.

AFFORD / SHOULD-WE
- Never grant permission.
- Provide bounded facts and state what's missing.
- suggested_next should be "create_capture" when more context is needed.

MONEY GROUNDING
- If facts.money_reasoning is available, prioritize it over generic financial wording.
- Use interpretation main pressure and confidence note when they are present.
- Keep wording plain-English, calm, and factual.

Return JSON only.
`.trim();

/* ---------------- route ---------------- */

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<AskRequest>;
    const question = typeof body.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }

    const routeSupabase = await supabaseRoute();
    const {
      data: { user },
      error: userErr,
    } = await routeSupabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(routeSupabase, user.id);
    if (!householdId) {
      return NextResponse.json({ error: "User not linked to a household." }, { status: 400 });
    }

    // 🔒 SAFETY INTERCEPT (V1 REQUIRED)
    const intercept = maybeCrisisIntercept(question);
    if (intercept) {
      const headline = intercept.content.trim();
      const answer = buildMemoAnswer({
        headline,
        key_points: [],
        details: "",
        what_changes_this: [],
        assumptions: [],
      });

      const tone: HomeTone = "attention";
      const verdict: Verdict = "NEEDS_ATTENTION";

      return NextResponse.json({
        answer,
        tone,
        verdict,
        headline,
        key_points: [],
        details: "",
        what_changes_this: [],
        assumptions: [],
        action: "none",
        suggested_next: "none",
        capture_seed: null,
        kind: intercept.kind,
      });
    }

    const facts = await buildFactsPack({ userId: user.id, householdId });

    // ✅ Deterministic AFFORD handling (skip AI)
    if (isHomeAffordabilityIntent(question)) {
      const money = (facts as any)?.money_summary;
      const moneyReasoning = (facts as any)?.money_reasoning;
      const mainPressureSummary =
        typeof moneyReasoning?.interpretation?.main_pressure?.summary === "string"
          ? moneyReasoning.interpretation.main_pressure.summary
          : "";
      const confidenceNote =
        typeof moneyReasoning?.interpretation?.confidence?.note === "string"
          ? moneyReasoning.interpretation.confidence.note
          : "";

      const balancesArr = Array.isArray(money?.balances_by_currency) ? money.balances_by_currency : [];
      const billsArr = Array.isArray(money?.recurring_bills_totals_by_currency) ? money.recurring_bills_totals_by_currency : [];

      const balancesList =
        balancesArr.length > 0
          ? balancesArr.map((b: any) => `${String(b?.currency ?? "").toUpperCase()}: ${String(b?.balance ?? "—")}`)
          : ["(no account balances visible)"];

      const billsList =
        billsArr.length > 0
          ? billsArr.map((b: any) => `${String(b?.currency ?? "").toUpperCase()}: ${String(b?.total ?? "—")}`)
          : ["(no recurring bills totals visible)"];

      // 👇 Single, non-duplicative headline (no “Here’s what I can see…” + another line)
      const headline = "I can’t answer “yes” or “no” from Home alone — here’s what I can see, and what’s missing.";

      const key_points = [
        "Available balances (by currency) are listed below.",
        "Recurring commitments (by currency) are listed below.",
        mainPressureSummary ? `Current pressure baseline: ${mainPressureSummary}` : "",
        confidenceNote ? `Confidence note: ${confidenceNote}` : "",
        "To answer safely, we’d need timing + which account pays + your buffer.",
      ].filter(Boolean);

      const details = ["**Available balances**", mdBullets(balancesList), "", "**Recurring commitments**", mdBullets(billsList)].join("\n");

      const what_changes_this = ["If the expense is one-off vs recurring", "If the timing is before/after pay day", "If it must come from a specific account"];
      const assumptions = ["Balances reflect active accounts", "Commitments reflect active recurring bills"];

      const answer = buildMemoAnswer({ headline, key_points, details, what_changes_this, assumptions });

      const tone: HomeTone = decideHomeTone({
        question,
        suggested_next: "create_capture",
        action: "open_money",
        facts: facts as any,
      });

      const verdict: Verdict = decideVerdict({
        question,
        suggested_next: "create_capture",
        action: "open_money",
        facts: facts as any,
      });

      return NextResponse.json({
        answer,
        tone,
        verdict,
        headline,
        key_points,
        details,
        what_changes_this,
        assumptions,
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
        const headline = "There are no items scheduled for review (from what I can see).";
        const assumptions = ["Review items come from decisions with review_at set and reviewed_at still empty"];
        const answer = buildMemoAnswer({ headline, key_points: [], details: "", what_changes_this: [], assumptions });

        const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_review", facts: facts as any });

        const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_review", facts: facts as any });

        return NextResponse.json({
          answer,
          tone,
          verdict,
          headline,
          key_points: [],
          details: "",
          what_changes_this: [],
          assumptions,
          action: "open_review",
          suggested_next: "none",
          capture_seed: null,
        });
      }

      const items = upcoming.slice(0, 3).map((it: any) => {
        const title = typeof it?.title === "string" ? it.title.trim() : "Decision";
        const at = typeof it?.review_at === "string" ? it.review_at : "";
        const when = at ? formatDateShort(at) : "";
        return `${title}${when ? ` — scheduled for ${when}` : ""}`;
      });

      const headline = `There are ${count} items scheduled for review.`;
      const assumptions = ["Review items come from decisions with review_at set and reviewed_at still empty"];
      const answer = buildMemoAnswer({ headline, key_points: items, details: "", what_changes_this: [], assumptions });

      const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_review", facts: facts as any });

      const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_review", facts: facts as any });

      return NextResponse.json({
        answer,
        tone,
        verdict,
        headline,
        key_points: items,
        details: "",
        what_changes_this: [],
        assumptions,
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
        const headline = "There are no chapters yet (from what I can see).";
        const assumptions = ["Chapters are decisions marked as chapter or with chaptered_at set"];
        const answer = buildMemoAnswer({ headline, key_points: [], details: "", what_changes_this: [], assumptions });

        const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_chapters", facts: facts as any });

        const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_chapters", facts: facts as any });

        return NextResponse.json({
          answer,
          tone,
          verdict,
          headline,
          key_points: [],
          details: "",
          what_changes_this: [],
          assumptions,
          action: "open_chapters",
          suggested_next: "none",
          capture_seed: null,
        });
      }

      const items = recent.slice(0, 3).map((it: any) => {
        const title = typeof it?.title === "string" ? it.title.trim() : "Decision";
        const at = typeof it?.chaptered_at === "string" ? it.chaptered_at : "";
        const when = at ? formatDateShort(at) : "";
        return `${title}${when ? ` — closed on ${when}` : ""}`;
      });

      const headline = `There are ${count} chapters.`;
      const assumptions = ["Chapters are decisions marked as chapter or with chaptered_at set"];
      const answer = buildMemoAnswer({ headline, key_points: items, details: "", what_changes_this: [], assumptions });

      const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_chapters", facts: facts as any });

      const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_chapters", facts: facts as any });

      return NextResponse.json({
        answer,
        tone,
        verdict,
        headline,
        key_points: items,
        details: "",
        what_changes_this: [],
        assumptions,
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
        const headline = "There are no active goals (from what I can see).";
        const assumptions = ["Goals come from money_goals"];
        const answer = buildMemoAnswer({ headline, key_points: [], details: "", what_changes_this: [], assumptions });

        const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_money", facts: facts as any });

        const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_money", facts: facts as any });

        return NextResponse.json({
          answer,
          tone,
          verdict,
          headline,
          key_points: [],
          details: "",
          what_changes_this: [],
          assumptions,
          action: "open_money",
          suggested_next: "none",
          capture_seed: null,
        });
      }

      // Buffer intent: locate an explicit buffer goal only (no guessing)
      if (isBufferIntent(question)) {
        const buffer = (() => {
          if (primary?.title && typeof primary.title === "string" && /buffer|emergency|rainy/i.test(primary.title)) return primary;
          const hit = active.find((g: any) => typeof g?.title === "string" && /buffer|emergency|rainy/i.test(g.title));
          if (hit) return hit;
          return null;
        })();

        if (!buffer) {
          const headline = "I can see your goals, but I can’t see one explicitly named like “buffer” / “emergency fund”.";
          const key_points = ["If you tell me the goal’s exact name, I can report its progress exactly."];
          const assumptions = ["Goals come from money_goals"];
          const answer = buildMemoAnswer({ headline, key_points, details: "", what_changes_this: [], assumptions });

          const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_money", facts: facts as any });

          const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_money", facts: facts as any });

          return NextResponse.json({
            answer,
            tone,
            verdict,
            headline,
            key_points,
            details: "",
            what_changes_this: [],
            assumptions,
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

        if (!tgt) {
          const headline = `Your “${title}” goal is currently at ${cur ?? "—"}.`;
          const key_points = ["I can’t calculate “how close” because I can’t see a target amount for it."];
          const assumptions = ["Goal target must be set to calculate remaining and percent"];
          const answer = buildMemoAnswer({ headline, key_points, details: "", what_changes_this: [], assumptions });

          const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_money", facts: facts as any });

          const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_money", facts: facts as any });

          return NextResponse.json({
            answer,
            tone,
            verdict,
            headline,
            key_points,
            details: "",
            what_changes_this: [],
            assumptions,
            action: "open_money",
            suggested_next: "none",
            capture_seed: null,
          });
        }

        const linked = Array.isArray((buffer as any).linked_accounts) ? (buffer as any).linked_accounts : [];
        const fundsVisible =
          linked.length > 0
            ? linked
                .slice(0, 3)
                .map((a: any) => {
                  const name = typeof a?.name === "string" ? a.name : "Account";
                  const bal = moneyFromCents(a?.current_balance_cents ?? null, a?.currency ?? "AUD") ?? "—";
                  return `${name} (${bal})`;
                })
                .join(", ") + (linked.length > 3 ? ` +${linked.length - 3} more` : "")
            : "";

        const headline = `Buffer goal (“${title}”): ${cur ?? "—"} / ${tgt}${p != null ? ` (${p}%)` : ""}.`;
        const key_points = [rem ? `Remaining: ${rem}.` : "", linked.length > 0 ? `Funds visible in: ${fundsVisible}.` : "I can’t see which account funds this goal yet."].filter(Boolean);
        const assumptions = ["Progress is based on the goal’s current and target values in money_goals"];
        const answer = buildMemoAnswer({ headline, key_points, details: "", what_changes_this: [], assumptions });

        const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_money", facts: facts as any });

        const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_money", facts: facts as any });

        return NextResponse.json({
          answer,
          tone,
          verdict,
          headline,
          key_points,
          details: "",
          what_changes_this: [],
          assumptions,
          action: "open_money",
          suggested_next: "none",
          capture_seed: null,
        });
      }

      // General goals summary
      const key_points: string[] = [];

      if (primary && typeof primary?.title === "string" && primary.title.trim()) {
        const cur = typeof primary?.current === "string" ? primary.current : null;
        const tgt = typeof primary?.target === "string" ? primary.target : null;
        const p = typeof primary?.percent === "number" ? primary.percent : null;
        const rem = typeof primary?.remaining === "string" ? primary.remaining : null;

        const progressBits: string[] = [];
        if (cur) progressBits.push(cur);
        if (tgt) progressBits.push(`of ${tgt}`);
        if (p != null) progressBits.push(`${p}%`);
        if (rem) progressBits.push(`remaining ${rem}`);

        key_points.push(`Primary goal: ${primary.title.trim()}${progressBits.length ? ` (${progressBits.join(", ")})` : ""}.`);
      }

      const titles = previewTitles
        .map((t: any) => (typeof t === "string" ? t.trim() : ""))
        .filter(Boolean)
        .slice(0, 3);

      if (titles.length) key_points.push(`Including: ${titles.join(", ")}.`);

      const headline = `There are ${countActive} active goals.`;
      const assumptions = ["Goals come from money_goals"];
      const answer = buildMemoAnswer({ headline, key_points, details: "", what_changes_this: [], assumptions });

      const tone: HomeTone = decideHomeTone({ question, suggested_next: "none", action: "open_money", facts: facts as any });

      const verdict: Verdict = decideVerdict({ question, suggested_next: "none", action: "open_money", facts: facts as any });

      return NextResponse.json({
        answer,
        tone,
        verdict,
        headline,
        key_points,
        details: "",
        what_changes_this: [],
        assumptions,
        action: "open_money",
        suggested_next: "none",
        capture_seed: null,
      });
    }

    // ---- AI path (FIELDS ONLY; server builds memo + verdict) ----
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `QUESTION:\n${question}\n\nFACTS PACK:\n${JSON.stringify(facts, null, 2)}` },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "life_cfo_home_ask_fields",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              headline: { type: "string" },
              key_points: { type: "array", items: { type: "string" } },
              details: { type: "string" },
              what_changes_this: { type: "array", items: { type: "string" } },
              assumptions: { type: "array", items: { type: "string" } },

              action: { type: "string", enum: ["open_bills", "open_money", "open_decisions", "open_review", "open_chapters", "none"] },
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
            required: ["headline", "key_points", "details", "what_changes_this", "assumptions", "action", "suggested_next", "capture_seed"],
          },
        },
      },
    });

    const raw = resp.output_text?.trim() || "";
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      const headline = "I couldn’t format that safely.";
      const answer = buildMemoAnswer({ headline, key_points: [], details: "", what_changes_this: [], assumptions: [] });

      const tone: HomeTone = "tight";
      const verdict: Verdict = "INSUFFICIENT_DATA";

      return NextResponse.json(
        {
          answer,
          tone,
          verdict,
          headline,
          key_points: [],
          details: "",
          what_changes_this: [],
          assumptions: [],
          action: "none",
          suggested_next: "none",
          capture_seed: null,
        },
        { status: 502 }
      );
    }

    const obj = parsed as Record<string, unknown>;

    const headline = String(obj.headline ?? "").trim().slice(0, 300);
    const key_points = Array.isArray(obj.key_points) ? (obj.key_points as unknown[]).map((x) => String(x)).slice(0, 8) : [];
    const what_changes_this = Array.isArray(obj.what_changes_this) ? (obj.what_changes_this as unknown[]).map((x) => String(x)).slice(0, 8) : [];
    const assumptions = Array.isArray(obj.assumptions) ? (obj.assumptions as unknown[]).map((x) => String(x)).slice(0, 8) : [];
    const details = String(obj.details ?? "").trim().slice(0, 6000);

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

    // ✅ Canonical memo formatting (server owns presentation)
    const answer = buildMemoAnswer({
      headline,
      key_points,
      details,
      what_changes_this,
      assumptions,
    });

    // ✅ Tone (Home check-in tone)
    const tone: HomeTone = decideHomeTone({
      question,
      suggested_next,
      action,
      facts: facts as any,
    });

    // ✅ Verdict (fine-grained, deterministic)
    const verdict: Verdict = decideVerdict({
      question,
      suggested_next,
      action,
      facts: facts as any,
    });

    return NextResponse.json({
      answer,
      tone,
      verdict,
      headline,
      key_points,
      details,
      what_changes_this,
      assumptions,
      action,
      suggested_next,
      capture_seed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
