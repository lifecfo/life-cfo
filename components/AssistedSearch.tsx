"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/cn";
import { Chip } from "@/components/ui";

type Scope = "thinking" | "decisions" | "revisit" | "chapters" | "capture" | "framing";

type Suggestion = {
  kind: "decision" | "inbox";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function routeForDecision(_scope: Scope, decisionId: string) {
  // V1: Always deep-open in Thinking (safe intelligence workspace)
  return `/thinking?open=${encodeURIComponent(decisionId)}`;
}

function routeForInbox(_scope: Scope, _inboxId: string) {
  // V1: keep calm. No deep-link yet.
  return `/framing`;
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

function scopeDecisionFilter(scope: Scope) {
  // Returns a PostgREST filter string to use via .or(...) or separate clauses.
  // We keep it simple + predictable.
  //
  // thinking: only drafts
  // decisions: anything not draft and not chapter
  // revisit: anything not draft with review_at present
  // chapters: only chapter
  // capture/framing: decisions search is still useful but not primary (we keep broad)
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

async function fetchTopSuggestions(scope: Scope): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const out: Suggestion[] = [];

  const filter = scopeDecisionFilter(scope);

  // --- Top suggestions should feel "of this place" ---
  // Thinking: recent drafts
  // Chapters: recent chaptered
  // Revisit: due soon (review_at)
  // Decisions: recent decided/created non-draft non-chapter
  // Capture/Framing: recent drafts + recent decisions (broad, calm)

  let q = supabase
    .from("decisions")
    .select("id,title,status,created_at,decided_at,review_at,chaptered_at")
    .eq("user_id", uid);

  if ("statusEq" in filter) {
    q = q.eq("status", filter.statusEq);
  } else if ("notDraft" in filter && filter.notDraft) {
    q = q.neq("status", "draft");
    if ("notChapter" in filter && filter.notChapter) q = q.neq("status", "chapter");
    if ("requireReviewAt" in filter && filter.requireReviewAt) q = q.not("review_at", "is", null);
  }

  // Ordering per scope
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

  for (const d of res.data ?? []) {
    const status = safeStr((d as any).status);
    const subtitle =
      status === "draft" ? "Draft" : status === "chapter" ? "Chapter" : "Decision";

    out.push({
      kind: "decision",
      id: String((d as any).id),
      title: safeStr((d as any).title) || "Untitled",
      subtitle,
      href: routeForDecision(scope, String((d as any).id)),
    });
  }

  return out.slice(0, 7);
}

async function fetchMatches(scope: Scope, q: string): Promise<Suggestion[]> {
  const uid = await getUserId();
  if (!uid) return [];

  const query = q.trim();
  if (!query) return fetchTopSuggestions(scope);

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

  // Order per scope for relevance
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
    const subtitle =
      status === "draft" ? "Draft" : status === "chapter" ? "Chapter" : "Decision";

    return {
      kind: "decision",
      id: String(d.id),
      title: safeStr(d.title) || "Untitled",
      subtitle,
      href: routeForDecision(scope, String(d.id)),
    };
  });
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
      const next = debouncedQ.trim()
        ? await fetchMatches(scope, debouncedQ)
        : await fetchTopSuggestions(scope);

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
        {loading ? (
          <span className="text-xs text-zinc-400">…</span>
        ) : (
          <span className="text-xs text-zinc-400">⌘K</span>
        )}
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="px-3 py-2 text-xs text-zinc-500">
            {q.trim() ? "Matches" : "Suggestions"}
          </div>

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
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {it.title}
                    </div>
                    {it.subtitle ? (
                      <div className="truncate text-xs text-zinc-500">{it.subtitle}</div>
                    ) : null}
                  </div>
                  <Chip className="shrink-0 text-xs">
                    {it.kind === "decision" ? "Decision" : "Inbox"}
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
