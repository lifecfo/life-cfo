// components/AssistedSearch.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

export type Scope =
  | "thinking"
  | "decisions"
  | "revisit"
  | "chapters"
  | "capture"
  | "family"
  | "bills"
  | "accounts"
  | "investments"
  | "transactions";

type Suggestion = {
  kind: "decision" | "inbox" | "bill" | "account" | "investment" | "capture" | "family";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeMs(iso: unknown) {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softDate(iso: unknown) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function routeForDecision(_scope: Scope, decisionId: string) {
  return `/thinking?open=${encodeURIComponent(decisionId)}`;
}

function routeForCapture(_scope: Scope, inboxId: string) {
  return `/capture?open=${encodeURIComponent(inboxId)}`;
}

function routeForBill() {
  return `/bills`;
}
function routeForAccount() {
  return `/accounts`;
}
function routeForInvestment() {
  return `/investments`;
}
function routeForFamily() {
  return `/family`;
}

type DecisionRow = {
  id: string;
  title: string | null;
  context: string | null;
  status: string | null;
  created_at: string | null;
  decided_at: string | null;
  review_at: string | null;
  chaptered_at: string | null;
};

type BillRow = {
  id: string;
  name: string | null;
  active: boolean | null;
  autopay: boolean | null;
  next_due_at: string | null;
};

type AccountRow = {
  id: string;
  name: string | null;
  current_balance_cents: number | null;
  currency: string | null;
  archived: boolean | null;
};

type CaptureRow = {
  id: string;
  title: string | null;
  body: string | null;
  created_at: string | null;
  status: string | null;
  framed_decision_id: string | null;
  type: string | null;
};

type FamilyMemberRow = {
  id: string;
  name: string | null;
  relationship: string | null;
  birth_year: number | null;
};

type PetRow = {
  id: string;
  name: string | null;
  type: string | null;
};

function scopeDecisionFilter(scope: Scope) {
  if (scope === "thinking") return { statusEq: "draft" as const };
  if (scope === "chapters") return { statusEq: "chapter" as const };
  if (scope === "revisit") return { notDraft: true, requireReviewAt: true };
  if (scope === "decisions") return { notDraft: true, notChapter: true };
  return { any: true };
}

async function getUserId(): Promise<string | null> {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user?.id) return null;
  return auth.user.id;
}

/* ----------------------- BILLS ----------------------- */
async function fetchTopBillSuggestions(): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("recurring_bills")
    .select("id,name,active,autopay,next_due_at")
    .eq("user_id", uid)
    .order("active", { ascending: false })
    .order("next_due_at", { ascending: true })
    .limit(7);

  if (error) return [];

  return (data ?? []).map((b: any) => {
    const title = safeStr(b?.name) || "Untitled bill";
    const active = !!b?.active;
    const autopay = !!b?.autopay;
    const due = b?.next_due_at ? softDate(b.next_due_at) : "";
    const subtitle = [active ? "Active" : "Paused", autopay ? "Autopay" : "Manual", due ? `Due: ${due}` : null]
      .filter(Boolean)
      .join(" • ");

    return { kind: "bill", id: String(b?.id), title, subtitle, href: routeForBill() };
  });
}

async function fetchBillMatches(q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const query = q.trim();
  if (!query) return fetchTopBillSuggestions();

  const { data, error } = await supabase
    .from("recurring_bills")
    .select("id,name,active,autopay,next_due_at")
    .eq("user_id", uid)
    .ilike("name", `%${query}%`)
    .order("active", { ascending: false })
    .order("next_due_at", { ascending: true })
    .limit(10);

  if (error) return [];

  return (data ?? []).map((b: BillRow) => {
    const title = safeStr(b?.name) || "Untitled bill";
    const active = !!b?.active;
    const autopay = !!b?.autopay;
    const due = b?.next_due_at ? softDate(b.next_due_at) : "";
    const subtitle = [active ? "Active" : "Paused", autopay ? "Autopay" : "Manual", due ? `Due: ${due}` : null]
      .filter(Boolean)
      .join(" • ");

    return { kind: "bill", id: String(b.id), title, subtitle, href: routeForBill() };
  });
}

/* ---------------------- ACCOUNTS ---------------------- */
async function fetchTopAccountSuggestions(): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,current_balance_cents,currency,archived,created_at")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(7);

  if (error) return [];

  return (data ?? []).map((a: any) => {
    const title = safeStr(a?.name) || "Untitled account";
    const archived = !!a?.archived;
    const cents = typeof a?.current_balance_cents === "number" ? a.current_balance_cents : 0;
    const currency = safeStr(a?.currency) || "AUD";
    const subtitle = [archived ? "Archived" : "Active", `${currency} ${(cents / 100).toFixed(2)}`].filter(Boolean).join(" • ");

    return { kind: "account", id: String(a?.id), title, subtitle, href: routeForAccount() };
  });
}

async function fetchAccountMatches(q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const query = q.trim();
  if (!query) return fetchTopAccountSuggestions();

  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,current_balance_cents,currency,archived,created_at")
    .eq("user_id", uid)
    .ilike("name", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return [];

  return (data ?? []).map((a: AccountRow) => {
    const title = safeStr(a?.name) || "Untitled account";
    const archived = !!a?.archived;
    const cents = typeof a?.current_balance_cents === "number" ? a.current_balance_cents : 0;
    const currency = safeStr(a?.currency) || "AUD";
    const subtitle = [archived ? "Archived" : "Active", `${currency} ${(cents / 100).toFixed(2)}`].filter(Boolean).join(" • ");

    return { kind: "account", id: String(a.id), title, subtitle, href: routeForAccount() };
  });
}

/* --------------------- CAPTURE --------------------- */
async function fetchTopCaptureSuggestions(scope: Scope): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from("decision_inbox")
    .select("id,title,body,created_at,status,framed_decision_id,type")
    .eq("user_id", uid)
    .eq("type", "capture")
    .eq("status", "open")
    .is("framed_decision_id", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return [];

  return (data ?? []).map((r: any) => {
    const title = safeStr(r?.title) || "Captured";
    const created = r?.created_at ? softDate(r.created_at) : "";
    const body = safeStr(r?.body);
    const hasAttachmentsHint = body.includes('"attachments"');

    const subtitle = [created || null, hasAttachmentsHint ? "Attachments" : null].filter(Boolean).join(" • ");

    return { kind: "capture", id: String(r?.id), title, subtitle, href: routeForCapture(scope, String(r?.id)) };
  });
}

async function fetchCaptureMatches(scope: Scope, q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const query = q.trim();
  if (!query) return fetchTopCaptureSuggestions(scope);

  const { data, error } = await supabase
    .from("decision_inbox")
    .select("id,title,body,created_at,status,framed_decision_id,type")
    .eq("user_id", uid)
    .eq("type", "capture")
    .eq("status", "open")
    .is("framed_decision_id", null)
    .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) return [];

  return (data ?? []).map((r: CaptureRow) => {
    const title = safeStr(r.title) || "Captured";
    const created = r.created_at ? softDate(r.created_at) : "";
    const body = safeStr(r.body);
    const hasAttachmentsHint = body.includes('"attachments"');
    const subtitle = [created || null, hasAttachmentsHint ? "Attachments" : null].filter(Boolean).join(" • ");
    return { kind: "capture", id: String(r.id), title, subtitle, href: routeForCapture(scope, String(r.id)) };
  });
}

/* --------------------- FAMILY --------------------- */
async function fetchTopFamilySuggestions(): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const [fRes, pRes] = await Promise.all([
    supabase.from("family_members").select("id,name,relationship,birth_year").eq("user_id", uid).order("created_at", { ascending: true }).limit(10),
    supabase.from("pets").select("id,name,type").eq("user_id", uid).order("created_at", { ascending: true }).limit(10),
  ]);

  const out: Suggestion[] = [];

  if (!fRes.error) {
    for (const m of fRes.data ?? []) {
      const name = safeStr((m as any)?.name) || "Person";
      const rel = safeStr((m as any)?.relationship);
      out.push({
        kind: "family",
        id: String((m as any)?.id),
        title: name,
        subtitle: rel ? rel : "Family",
        href: routeForFamily(),
      });
    }
  }

  if (!pRes.error) {
    for (const p of pRes.data ?? []) {
      const name = safeStr((p as any)?.name) || "Pet";
      const t = safeStr((p as any)?.type);
      out.push({
        kind: "family",
        id: `pet:${String((p as any)?.id)}`,
        title: name,
        subtitle: t ? `Pet • ${t}` : "Pet",
        href: routeForFamily(),
      });
    }
  }

  return out.slice(0, 10);
}

async function fetchFamilyMatches(q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const query = q.trim();
  if (!query) return fetchTopFamilySuggestions();

  const [fRes, pRes] = await Promise.all([
    supabase
      .from("family_members")
      .select("id,name,relationship,birth_year")
      .eq("user_id", uid)
      .or(`name.ilike.%${query}%,relationship.ilike.%${query}%`)
      .limit(12),
    supabase
      .from("pets")
      .select("id,name,type")
      .eq("user_id", uid)
      .or(`name.ilike.%${query}%,type.ilike.%${query}%`)
      .limit(12),
  ]);

  const out: Suggestion[] = [];

  if (!fRes.error) {
    for (const m of (fRes.data ?? []) as FamilyMemberRow[]) {
      const name = safeStr(m.name) || "Person";
      const rel = safeStr(m.relationship);
      out.push({ kind: "family", id: String(m.id), title: name, subtitle: rel ? rel : "Family", href: routeForFamily() });
    }
  }

  if (!pRes.error) {
    for (const p of (pRes.data ?? []) as PetRow[]) {
      const name = safeStr(p.name) || "Pet";
      const t = safeStr(p.type);
      out.push({ kind: "family", id: `pet:${String(p.id)}`, title: name, subtitle: t ? `Pet • ${t}` : "Pet", href: routeForFamily() });
    }
  }

  return out.slice(0, 12);
}

/* --------------------- DECISIONS --------------------- */
async function fetchTopDecisionSuggestions(scope: Scope): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const filter = scopeDecisionFilter(scope);

  let q = supabase.from("decisions").select("id,title,status,created_at,decided_at,review_at,chaptered_at").eq("user_id", uid);

  if ("statusEq" in filter) {
    q = q.eq("status", filter.statusEq);
  } else if ("notDraft" in filter && filter.notDraft) {
    q = q.neq("status", "draft");
    if ("notChapter" in filter && filter.notChapter) q = q.neq("status", "chapter");
    if ("requireReviewAt" in filter && filter.requireReviewAt) q = q.not("review_at", "is", null);
  }

  if (scope === "revisit") {
    q = q.order("review_at", { ascending: true }).limit(7);
  } else if (scope === "chapters") {
    q = q.order("chaptered_at", { ascending: false, nullsFirst: false }).order("decided_at", { ascending: false, nullsFirst: false }).limit(7);
  } else if (scope === "decisions") {
    q = q.order("decided_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(7);
  } else {
    q = q.order("created_at", { ascending: false }).limit(7);
  }

  const res = await q;
  if (res.error) return [];

  return (res.data ?? []).slice(0, 7).map((d: any) => {
    const status = safeStr(d.status);
    const subtitle = status === "draft" ? "Draft" : status === "chapter" ? "Chapter" : "Decision";
    return { kind: "decision", id: String(d.id), title: safeStr(d.title) || "Untitled", subtitle, href: routeForDecision(scope, String(d.id)) };
  });
}

async function fetchDecisionMatches(scope: Scope, q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const query = q.trim();
  if (!query) return fetchTopDecisionSuggestions(scope);

  const filter = scopeDecisionFilter(scope);

  let db = supabase
    .from("decisions")
    .select("id,title,context,status,created_at,decided_at,review_at,chaptered_at")
    .eq("user_id", uid)
    .or(`title.ilike.%${query}%,context.ilike.%${query}%`);

  if ("statusEq" in filter) {
    db = db.eq("status", filter.statusEq);
  } else if ("notDraft" in filter && filter.notDraft) {
    db = db.neq("status", "draft");
    if ("notChapter" in filter && filter.notChapter) db = db.neq("status", "chapter");
    if ("requireReviewAt" in filter && filter.requireReviewAt) db = db.not("review_at", "is", null);
  }

  if (scope === "revisit") {
    db = db.order("review_at", { ascending: true }).limit(10);
  } else if (scope === "chapters") {
    db = db.order("chaptered_at", { ascending: false, nullsFirst: false }).order("decided_at", { ascending: false, nullsFirst: false }).limit(10);
  } else if (scope === "decisions") {
    db = db.order("decided_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(10);
  } else {
    db = db.order("created_at", { ascending: false }).limit(10);
  }

  const { data, error } = await db;
  if (error) return [];

  return (data ?? []).map((d: DecisionRow) => {
    const status = safeStr(d.status);
    const subtitle = status === "draft" ? "Draft" : status === "chapter" ? "Chapter" : "Decision";
    return { kind: "decision", id: String(d.id), title: safeStr(d.title) || "Untitled", subtitle, href: routeForDecision(scope, String(d.id)) };
  });
}

/* ---------------------- INVESTMENTS (SAFE STUB) ---------------------- */
async function fetchTopInvestmentSuggestions(): Promise<Suggestion[]> {
  return [];
}
async function fetchInvestmentMatches(): Promise<Suggestion[]> {
  return [];
}

/* ---------------------- ROUTER ---------------------- */
async function fetchTopSuggestions(scope: Scope): Promise<Suggestion[]> {
  if (scope === "family") return fetchTopFamilySuggestions();
  if (scope === "capture") return fetchTopCaptureSuggestions(scope);
  if (scope === "bills") return fetchTopBillSuggestions();
  if (scope === "accounts") return fetchTopAccountSuggestions();
  if (scope === "investments") return fetchTopInvestmentSuggestions();
  return fetchTopDecisionSuggestions(scope);
}

async function fetchMatches(scope: Scope, q: string): Promise<Suggestion[]> {
  if (scope === "family") return fetchFamilyMatches(q);
  if (scope === "capture") return fetchCaptureMatches(scope, q);
  if (scope === "bills") return fetchBillMatches(q);
  if (scope === "accounts") return fetchAccountMatches(q);
  if (scope === "investments") return fetchInvestmentMatches();
  return fetchDecisionMatches(scope, q);
}

export function AssistedSearch({
  scope,
  className,
  placeholder = "Search…",
}: {
  scope: Scope;
  className?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const debouncedQ = useMemo(() => q, [q]);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const t = window.setTimeout(async () => {
      const next = debouncedQ.trim() ? await fetchMatches(scope, debouncedQ) : await fetchTopSuggestions(scope);
      if (!alive) return;
      setItems(next);
      setLoading(false);
    }, 140);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [debouncedQ, scope]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        {loading ? <span className="text-xs text-zinc-400">…</span> : <span className="text-xs text-zinc-400">⌘K</span>}
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="px-3 py-2 text-xs text-zinc-500">{q.trim() ? "Matches" : "Suggestions"}</div>

          <div className="max-h-72 overflow-auto">
            {items.length === 0 ? (
              <div className="px-3 py-3 text-sm text-zinc-500">No matches.</div>
            ) : (
              items.map((it) => (
                <button
                  key={`${it.kind}-${it.id}`}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-zinc-50"
                  onClick={() => {
                    setOpen(false);
                    router.push(it.href);
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">{it.title}</div>
                    {it.subtitle ? <div className="truncate text-xs text-zinc-500">{it.subtitle}</div> : null}
                  </div>
                  <Chip className="shrink-0 text-xs">
                    {it.kind === "decision"
                      ? "Decision"
                      : it.kind === "bill"
                      ? "Bill"
                      : it.kind === "account"
                      ? "Account"
                      : it.kind === "investment"
                      ? "Investment"
                      : it.kind === "capture"
                      ? "Capture"
                      : it.kind === "family"
                      ? "Family"
                      : "Inbox"}
                  </Chip>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
