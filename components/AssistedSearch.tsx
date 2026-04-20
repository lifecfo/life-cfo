"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

export type Scope =
  | "money"
  | "decisions"
  | "chapters"
  | "bills"
  | "accounts"
  | "investments"
  | "transactions";

type Suggestion = {
  kind: "decision" | "bill" | "account" | "investment" | "transaction";
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

/**
 * ✅ IMPORTANT
 * DecisionsClient forces /decisions to default tab=new when tab is missing.
 * So AssistedSearch MUST include tab=... when linking to decisions.
 */
function routeForDecision(decisionId: string, scope: Scope) {
  // Chapters live under Closed Decisions
  if (scope === "chapters") {
    return `/decisions?tab=closed&open=${encodeURIComponent(decisionId)}`;
  }

  // Everything else decision-ish should land on Active Decisions
  return `/decisions?tab=active&open=${encodeURIComponent(decisionId)}`;
}

function routeForBill() {
  return `/bills`;
}

/**
 * Accounts & Transactions now support deep-link open.
 */
function routeForAccount(accountId: string) {
  return `/accounts?open=${encodeURIComponent(accountId)}`;
}

function routeForInvestment() {
  return `/investments`;
}

function routeForTransaction(txId: string) {
  return `/transactions?open=${encodeURIComponent(txId)}`;
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

type TxRow = {
  id: string;
  date: string | null; // YYYY-MM-DD
  description: string | null;
  merchant: string | null;
  category: string | null;
  pending: boolean | null;
  amount: number | null;
  amount_cents: number | null;
  currency: string | null;
  account_id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function scopeDecisionFilter(scope: Scope) {
  if (scope === "chapters") return { statusEq: "chapter" as const };
  if (scope === "decisions") return { notDraft: true, notChapter: true };
  return { any: true };
}

async function getUserId(): Promise<string | null> {
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user?.id) return null;
  return auth.user.id;
}

/**
 * Household-safe lookup for Money search.
 * Uses the same API your AppShell relies on.
 */
async function getActiveHouseholdId(): Promise<string | null> {
  try {
    const res = await fetch("/api/households", { method: "GET", cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    if (!json?.ok) return null;
    if (json?.needs_household) return null;
    const hid = typeof json?.active_household_id === "string" ? json.active_household_id : null;
    return hid || null;
  } catch {
    return null;
  }
}

/* ----------------------- BILLS (user-scoped, unchanged) ----------------------- */
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

/* ---------------------- ACCOUNTS (household-safe when scope=money/accounts) ---------------------- */
async function fetchTopAccountSuggestionsHousehold(): Promise<Suggestion[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,current_balance_cents,currency,archived,created_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(7);

  if (error) return [];

  return (data ?? []).map((a: any) => {
    const title = safeStr(a?.name) || "Untitled account";
    const archived = !!a?.archived;
    const cents = typeof a?.current_balance_cents === "number" ? a.current_balance_cents : 0;
    const currency = safeStr(a?.currency) || "AUD";
    const subtitle = [archived ? "Archived" : "Active", `${currency} ${(cents / 100).toFixed(2)}`].filter(Boolean).join(" • ");

    return { kind: "account", id: String(a?.id), title, subtitle, href: routeForAccount(String(a?.id)) };
  });
}

async function fetchAccountMatchesHousehold(q: string): Promise<Suggestion[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];
  const query = q.trim();
  if (!query) return fetchTopAccountSuggestionsHousehold();

  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,current_balance_cents,currency,archived,created_at")
    .eq("household_id", householdId)
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

    return { kind: "account", id: String(a.id), title, subtitle, href: routeForAccount(String(a.id)) };
  });
}

/**
 * Back-compat (user-scoped) accounts search.
 * Kept in case some environments still use user_id. Not used for scope=money.
 */
async function fetchTopAccountSuggestionsUser(): Promise<Suggestion[]> {
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

    return { kind: "account", id: String(a?.id), title, subtitle, href: routeForAccount(String(a?.id)) };
  });
}

async function fetchAccountMatchesUser(q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const query = q.trim();
  if (!query) return fetchTopAccountSuggestionsUser();

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

    return { kind: "account", id: String(a.id), title, subtitle, href: routeForAccount(String(a.id)) };
  });
}

/* ---------------------- TRANSACTIONS (household-safe) ---------------------- */
async function fetchTopTransactionSuggestionsHousehold(): Promise<Suggestion[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at")
    .eq("household_id", householdId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(7);

  if (error) return [];

  return (data ?? []).map((t: any) => {
    const row: TxRow = t as TxRow;
    const title = safeStr(row.merchant) || safeStr(row.description) || "Transaction";
    const meta = [row.date ? softDate(row.date) : null, safeStr(row.category) || null, row.pending ? "Pending" : null]
      .filter(Boolean)
      .join(" • ");

    return { kind: "transaction", id: String(row.id), title, subtitle: meta || undefined, href: routeForTransaction(String(row.id)) };
  });
}

async function fetchTransactionMatchesHousehold(q: string): Promise<Suggestion[]> {
  const householdId = await getActiveHouseholdId();
  if (!householdId) return [];

  const query = q.trim();
  if (!query) return fetchTopTransactionSuggestionsHousehold();

  const or = [`description.ilike.%${query}%`, `merchant.ilike.%${query}%`, `category.ilike.%${query}%`].join(",");

  const { data, error } = await supabase
    .from("transactions")
    .select("id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at")
    .eq("household_id", householdId)
    .or(or)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return [];

  return (data ?? []).map((t: any) => {
    const row: TxRow = t as TxRow;
    const title = safeStr(row.merchant) || safeStr(row.description) || "Transaction";
    const meta = [row.date ? softDate(row.date) : null, safeStr(row.category) || null, row.pending ? "Pending" : null]
      .filter(Boolean)
      .join(" • ");

    return { kind: "transaction", id: String(row.id), title, subtitle: meta || undefined, href: routeForTransaction(String(row.id)) };
  });
}

/* --------------------- DECISIONS (user-scoped, unchanged) --------------------- */
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

  if (scope === "chapters") {
    q = q
      .order("chaptered_at", { ascending: false, nullsFirst: false })
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(7);
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
    return {
      kind: "decision",
      id: String(d.id),
      title: safeStr(d.title) || "Untitled",
      subtitle,
      href: routeForDecision(String(d.id), scope),
    };
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

  if (scope === "chapters") {
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
    return {
      kind: "decision",
      id: String(d.id),
      title: safeStr(d.title) || "Untitled",
      subtitle,
      href: routeForDecision(String(d.id), scope),
    };
  });
}

/* ---------------------- INVESTMENTS (SAFE STUB) ---------------------- */
async function fetchTopInvestmentSuggestions(): Promise<Suggestion[]> {
  return [];
}
async function fetchInvestmentMatches(): Promise<Suggestion[]> {
  return [];
}

/* ---------------------- MONEY (meta-scope) ---------------------- */
async function fetchTopMoneySuggestions(): Promise<Suggestion[]> {
  const [accounts, transactions, bills] = await Promise.all([
    fetchTopAccountSuggestionsHousehold(),
    fetchTopTransactionSuggestionsHousehold(),
    fetchTopBillSuggestions(), // still user-scoped for now
  ]);

  return [...accounts, ...transactions, ...bills].slice(0, 12);
}

async function fetchMoneyMatches(q: string): Promise<Suggestion[]> {
  const query = q.trim();
  if (!query) return fetchTopMoneySuggestions();

  const [accounts, transactions, bills] = await Promise.all([
    fetchAccountMatchesHousehold(query),
    fetchTransactionMatchesHousehold(query),
    fetchBillMatches(query),
  ]);

  return [...accounts, ...transactions, ...bills].slice(0, 12);
}

/* ---------------------- ROUTER ---------------------- */
async function fetchTopSuggestions(scope: Scope): Promise<Suggestion[]> {
  if (scope === "money") return fetchTopMoneySuggestions();

  if (scope === "bills") return fetchTopBillSuggestions();

  if (scope === "accounts") {
    const household = await fetchTopAccountSuggestionsHousehold();
    return household.length ? household : fetchTopAccountSuggestionsUser();
  }

  if (scope === "transactions") return fetchTopTransactionSuggestionsHousehold();
  if (scope === "investments") return fetchTopInvestmentSuggestions();

  return fetchTopDecisionSuggestions(scope);
}

async function fetchMatches(scope: Scope, q: string): Promise<Suggestion[]> {
  if (scope === "money") return fetchMoneyMatches(q);

  if (scope === "bills") return fetchBillMatches(q);

  if (scope === "accounts") {
    const household = await fetchAccountMatchesHousehold(q);
    return household.length ? household : fetchAccountMatchesUser(q);
  }

  if (scope === "transactions") return fetchTransactionMatchesHousehold(q);
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
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQ = useMemo(() => q, [q]);

  // Fetch suggestions / matches (debounced)
  useEffect(() => {
    let alive = true;
    setLoading(true);

    const t = window.setTimeout(async () => {
      try {
        const next = debouncedQ.trim() ? await fetchMatches(scope, debouncedQ) : await fetchTopSuggestions(scope);
        if (!alive) return;
        setItems(next);
        setActiveIndex(0);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }, 140);

    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [debouncedQ, scope]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Cmd/Ctrl+K focuses this search input (best-effort)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if (!isK) return;

      const isMeta = e.metaKey || e.ctrlKey;
      if (!isMeta) return;

      // only if this component is on screen
      if (!boxRef.current) return;

      e.preventDefault();
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Keyboard navigation when the input is focused
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }

    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === "Enter") {
      const it = items[activeIndex];
      if (!it) return;
      e.preventDefault();
      setOpen(false);
      router.push(it.href);
      return;
    }
  };

  const labelForKind = (k: Suggestion["kind"]) =>
    k === "decision"
      ? "Decision"
      : k === "bill"
      ? "Bill"
      : k === "account"
      ? "Account"
      : k === "transaction"
      ? "Transaction"
      : k === "investment"
      ? "Investment"
      : "Item";

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
          aria-expanded={open}
          aria-autocomplete="list"
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
              items.map((it, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`${it.kind}-${it.id}`}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-3 text-left",
                      isActive ? "bg-zinc-50" : "hover:bg-zinc-50"
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      setOpen(false);
                      router.push(it.href);
                    }}
                    aria-selected={isActive}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900">{it.title}</div>
                      {it.subtitle ? <div className="truncate text-xs text-zinc-500">{it.subtitle}</div> : null}
                    </div>
                    <Chip className="shrink-0 text-xs">{labelForKind(it.kind)}</Chip>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
