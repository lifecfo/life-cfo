// app/(app)/decisions/DecisionsClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, useToast } from "@/components/ui";
import { ConversationPanel } from "./ConversationPanel";

import { AttachmentsBlock } from "@/components/AttachmentsBlock";

export const dynamic = "force-dynamic";

type AttachmentMeta = {
  name: string;
  path: string;
  type: string;
  size: number;
};

type Decision = {
  id: string;
  user_id: string;
  title: string;
  context: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
  review_at: string | null;
  origin: string | null;
  framed_at: string | null;
  attachments: AttachmentMeta[] | null;
};

type DecisionSummary = {
  id: string;
  user_id: string;
  decision_id: string;
  summary_text: string;
  created_at: string;
};

type Domain = { id: string; name: string; sort_order?: number | null };
type Constellation = { id: string; name: string; sort_order?: number | null };

type Tab = "new" | "active" | "closed";

type SortKey = "newest" | "oldest" | "reviewSoon" | "reviewLate" | "titleAZ" | "titleZA";

/** ✅ decision notes table rows */
type DecisionNote = {
  id: string;
  user_id: string;
  decision_id: string;
  body: string;
  created_at: string;
  updated_at: string | null;
};

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softWhen(iso: string | null | undefined) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function softWhenDateTime(iso: string | null | undefined) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isoFromDateInput(dateStr: string) {
  if (!dateStr) return null;
  const ms = Date.parse(`${dateStr}T12:00:00`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeAttachments(raw: unknown): AttachmentMeta[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a: any) => a && typeof a.path === "string")
    .map((a: any) => ({
      name: typeof a.name === "string" ? a.name : "Attachment",
      path: String(a.path),
      type: typeof a.type === "string" ? a.type : "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
    }));
}

function sortByName<T extends { name: string; sort_order?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 9999;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 9999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

function titleFromStatement(statement: string) {
  const s = (statement || "").trim().replace(/\s+/g, " ");
  if (!s) return "Untitled";
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

/**
 * Context format:
 * Captured:
 * <original capture>
 *
 * ---
 * Draft:
 * <notes>
 *
 * ✅ We keep Captured in context for provenance,
 * but decision NOTES are now stored in decision_notes table.
 */
function splitContext(context: string | null) {
  const raw = (context ?? "").trim();
  if (!raw) return { captured: "", notes: "" };

  const sep = "\n\n---\nDraft:\n";
  const altSep = "\n---\nDraft:\n";

  const idx = raw.indexOf(sep);
  const idxAlt = raw.indexOf(altSep);

  const cut = idx >= 0 ? idx : idxAlt;
  const sepLen = idx >= 0 ? sep.length : idxAlt >= 0 ? altSep.length : 0;

  if (cut >= 0) {
    const capturedPart = raw.slice(0, cut).trim();
    const draftPart = raw.slice(cut + sepLen).trim();
    const captured = capturedPart.replace(/^Captured:\s*/i, "").trim();
    return { captured, notes: draftPart };
  }

  const captured = raw.replace(/^Captured:\s*/i, "").trim();
  return { captured, notes: "" };
}

function composeContext(captured: string, notes: string) {
  const cap = (captured ?? "").trim();
  const n = (notes ?? "").trim();

  if (!cap && !n) return null;
  if (cap && !n) return `Captured:\n${cap}`;
  if (!cap && n) return n;

  return `Captured:\n${cap}\n\n---\nDraft:\n${n}`;
}

function PrimaryActionButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const { children, onClick, title, disabled } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={[
        "inline-flex select-none items-center justify-center rounded-full border px-4 py-2 text-sm transition",
        "border-[#1F5E5C] bg-[#1F5E5C] text-white",
        "hover:bg-[#174947] hover:text-white",
        "disabled:border-[#9FB8B6] disabled:bg-[#9FB8B6] disabled:text-white/90",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function isReviewDue(review_at: string | null) {
  const ms = safeMs(review_at);
  if (!ms) return false;
  return ms <= Date.now();
}

function FilterIconButton({
  active,
  count,
  onClick,
  title,
}: {
  active?: boolean;
  count?: number;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
        active ? "border-zinc-300 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
        "text-zinc-700",
      ].join(" ")}
      aria-label="Filters"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>

      {count && count > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full border border-white bg-zinc-900 px-1.5 text-[11px] font-medium text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SortIconButton({
  active,
  onClick,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 transition",
        active ? "border-zinc-300 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50",
        "text-zinc-700",
      ].join(" ")}
      aria-label="Sort"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 6h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4 4v16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="hidden sm:inline text-sm">Sort</span>
    </button>
  );
}

function buildUrl(
  tab: Tab,
  opts?: {
    open?: string | null;
    work?: boolean;
    q?: string;
    sort?: SortKey;
    domain?: string | null;
    group?: string | null;
    hasReview?: boolean;
    reviewDue?: boolean;
  }
) {
  const sp = new URLSearchParams();
  sp.set("tab", tab);

  if (opts?.open) sp.set("open", opts.open);
  if (opts?.work) sp.set("work", "1");

  const q = (opts?.q ?? "").trim();
  if (q) sp.set("q", q);

  if (opts?.sort && opts.sort !== "newest") sp.set("sort", opts.sort);

  if (opts?.domain) sp.set("domain", opts.domain);
  if (opts?.group) sp.set("group", opts.group);

  if (opts?.hasReview) sp.set("hasReview", "1");
  if (opts?.reviewDue) sp.set("reviewDue", "1");

  const s = sp.toString();
  return s ? `/decisions?${s}` : "/decisions";
}

const sortLabel: Record<SortKey, string> = {
  newest: "Newest",
  oldest: "Oldest",
  reviewSoon: "Review soonest",
  reviewLate: "Review latest",
  titleAZ: "Title A–Z",
  titleZA: "Title Z–A",
};

// --- summary rendering helpers (bullets + real bold) ---
function stripBulletPrefix(line: string) {
  return line.replace(/^[-•]\s+/, "").trim();
}
function stripMdMarkers(line: string) {
  return line.replace(/\*\*/g, "");
}
function renderInlineBold(text: string) {
  const parts = String(text ?? "").split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <span key={i}>{p}</span>;
  });
}
function summaryOneLine(text: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? "";
  return stripMdMarkers(stripBulletPrefix(first));
}
function renderSummaryBody(text: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isBullet = /^[-•]\s+/.test(line);

    if (isBullet) {
      const bullets: string[] = [];
      while (i < lines.length && /^[-•]\s+/.test(lines[i])) {
        bullets.push(stripBulletPrefix(lines[i]));
        i++;
      }
      out.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-zinc-800">
          {bullets.map((b, idx) => (
            <li key={idx}>{renderInlineBold(b)}</li>
          ))}
        </ul>
      );
      continue;
    }

    out.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed text-zinc-800">
        {renderInlineBold(line)}
      </p>
    );
    i++;
  }

  return out;
}

export default function DecisionsClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const tabParam = (searchParams.get("tab") as Tab | null) ?? "new";
  const tab: Tab = tabParam === "active" || tabParam === "closed" || tabParam === "new" ? tabParam : "new";

  const openFromQuery = searchParams.get("open");
  const workFromQuery = searchParams.get("work") === "1";

  // URL state (initial)
  const initialQ = searchParams.get("q") ?? "";
  const initialSort = (searchParams.get("sort") as SortKey | null) ?? "newest";
  const initialDomain = searchParams.get("domain");
  const initialGroup = searchParams.get("group");
  const initialHasReview = searchParams.get("hasReview") === "1";
  const initialReviewDue = searchParams.get("reviewDue") === "1";

  // Ensure /decisions defaults to tab=new
  useEffect(() => {
    const hasTab = searchParams.get("tab");
    if (!hasTab) router.replace(buildUrl("new"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageTitle = "Decisions";
  const pageSubtitle =
    tab === "new"
      ? "This is the place to process any decisions you're working through. I can help clarify what matters, then lay out options and tradeoffs. You can set a review date, or close out the decision when it's done. We'll hold it safely for you."
      : tab === "active"
      ? "Active decisions you’re working through."
      : "Closed decisions live here quietly — still searchable whenever you need them.";

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [domains, setDomains] = useState<Domain[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);

  // Filters (icon panel)
  const [activeDomainId, setActiveDomainId] = useState<string | null>(initialDomain ?? null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(initialGroup ?? null);
  const [hasReviewDateOnly, setHasReviewDateOnly] = useState<boolean>(initialHasReview);
  const [reviewDueOnly, setReviewDueOnly] = useState<boolean>(initialReviewDue);

  const [domainByDecision, setDomainByDecision] = useState<Record<string, string | null>>({});
  const [constellationsByDecision, setConstellationsByDecision] = useState<Record<string, string[]>>({});

  const [openId, setOpenId] = useState<string | null>(null);
  const [workForId, setWorkForId] = useState<string | null>(null);

  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);
  const [expandedSummary, setExpandedSummary] = useState<Record<string, boolean>>({});

  const reloadTimerRef = useRef<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const topAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [confirmDeleteForId, setConfirmDeleteForId] = useState<string | null>(null);

  // Search (debounced)
  const [searchText, setSearchText] = useState<string>(initialQ);
  const [searchDebounced, setSearchDebounced] = useState<string>(initialQ);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>(
    initialSort === "newest" ||
      initialSort === "oldest" ||
      initialSort === "reviewSoon" ||
      initialSort === "reviewLate" ||
      initialSort === "titleAZ" ||
      initialSort === "titleZA"
      ? initialSort
      : "newest"
  );

  // Filter panel (icon)
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const filterBoxRef = useRef<HTMLDivElement | null>(null);

  // Sort panel
  const [sortOpen, setSortOpen] = useState<boolean>(false);
  const sortBoxRef = useRef<HTMLDivElement | null>(null);

  // Page 1 new decision input
  const newRef = useRef<HTMLTextAreaElement | null>(null);
  const [newText, setNewText] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState<boolean>(false);

  // ✅ Page 1 framing step
  type FrameDraft = {
    title: string;
    statement: string;
    what_im_hearing: string;
    questions: string[];
  };

  const [newStep, setNewStep] = useState<"input" | "framing" | "confirm" | "edit">("input");
  const [frameDraft, setFrameDraft] = useState<FrameDraft | null>(null);
  const [framingBusy, setFramingBusy] = useState(false);

  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  // server pagination
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  /** ✅ decision notes state (per open decision) */
  const [notesByDecisionId, setNotesByDecisionId] = useState<Record<string, DecisionNote[]>>({});
  const [notesLoadingByDecisionId, setNotesLoadingByDecisionId] = useState<Record<string, boolean>>({});
  const [noteDraftByDecisionId, setNoteDraftByDecisionId] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState<string>("");

  const scrollToDecisionTop = (id: string) => {
    const anchor = topAnchorRefs.current[id] ?? cardRefs.current[id];
    anchor?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => void load({ silent: true }), 250);
  };

  // debounce search
  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchText), 200);
    return () => window.clearTimeout(t);
  }, [searchText]);

  // Cmd/Ctrl+K focuses search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = (e.key || "").toLowerCase();
      const cmdOrCtrl = e.metaKey || e.ctrlKey;

      if (cmdOrCtrl && key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus?.();
      }
      if (key === "escape") {
        setFilterOpen(false);
        setSortOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close popovers on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;

      if (filterBoxRef.current && !filterBoxRef.current.contains(t)) setFilterOpen(false);
      if (sortBoxRef.current && !sortBoxRef.current.contains(t)) setSortOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // keep URL in sync (without changing anything else)
  const desiredUrl = useMemo(() => {
    return buildUrl(tab, {
      open: openFromQuery ?? openId ?? null,
      work: (openFromQuery ? workFromQuery : workForId === (openFromQuery ?? openId ?? "")) ? true : false,
      q: searchDebounced,
      sort: sortKey,
      domain: activeDomainId,
      group: activeConstellationId,
      hasReview: hasReviewDateOnly,
      reviewDue: reviewDueOnly,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tab,
    openFromQuery,
    workFromQuery,
    openId,
    workForId,
    searchDebounced,
    sortKey,
    activeDomainId,
    activeConstellationId,
    hasReviewDateOnly,
    reviewDueOnly,
  ]);

  useEffect(() => {
    // Avoid replace loops: only replace if params differ.
    const current = `/decisions?${searchParams.toString()}`;
    if (current !== desiredUrl) router.replace(desiredUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredUrl]);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setStatusLine("Loading…");

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      setUserId(null);
      setItems([]);
      setTotalCount(0);
      setStatusLine("Not signed in.");
      return;
    }

    const uid = auth.user.id;
    setUserId(uid);

    // ✅ Decisions query: push search + sort + pagination into Supabase (filters remain client-side for now)
    let q = supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments", { count: "exact" })
      .eq("user_id", uid);

    // Tab scope
    if (tab === "active" || tab === "new") q = q.neq("status", "chapter");
    if (tab === "closed") q = q.eq("status", "chapter");

    // Search (server-side)
    const t = (searchDebounced ?? "").trim();
    if (t) {
      const safe = t.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${safe}%,context.ilike.%${safe}%`);
    }

    // Sort (server-side)
    if (sortKey === "newest") {
      q = q.order("created_at", { ascending: false });
    } else if (sortKey === "oldest") {
      q = q.order("created_at", { ascending: true });
    } else if (sortKey === "reviewSoon") {
      q = q.order("review_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    } else if (sortKey === "reviewLate") {
      q = q.order("review_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    } else if (sortKey === "titleAZ") {
      q = q.order("title", { ascending: true }).order("created_at", { ascending: false });
    } else if (sortKey === "titleZA") {
      q = q.order("title", { ascending: false }).order("created_at", { ascending: false });
    } else {
      q = q.order("created_at", { ascending: false });
    }

    // Pagination range
    const to = page * PAGE_SIZE - 1;
    q = q.range(0, to);

    const { data, error, count } = await q;

    if (error) {
      setItems([]);
      setTotalCount(0);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const listRaw = (data ?? []) as any[];
    const list: Decision[] = listRaw.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      title: r.title ?? "",
      context: r.context ?? null,
      status: r.status ?? "",
      created_at: r.created_at ?? new Date().toISOString(),
      decided_at: r.decided_at ?? null,
      review_at: r.review_at ?? null,
      origin: r.origin ?? null,
      framed_at: r.framed_at ?? null,
      attachments: normalizeAttachments(r.attachments),
    }));

    setItems(list);
    setTotalCount(typeof count === "number" ? count : list.length);
    setStatusLine(list.length === 0 ? "All clear." : "Loaded.");

    // Labels
    const [domRes, conRes] = await Promise.all([
      supabase.from("domains").select("id,name,sort_order").eq("user_id", uid).order("sort_order", { ascending: true }),
      supabase.from("constellations").select("id,name,sort_order").eq("user_id", uid).order("sort_order", { ascending: true }),
    ]);

    if (!domRes.error) {
      const rows = (domRes.data ?? []) as any[];
      const next: Domain[] = rows
        .filter((r) => r && r.id && r.name)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
        }));
      setDomains(sortByName(next));
    }

    if (!conRes.error) {
      const rows = (conRes.data ?? []) as any[];
      const next: Constellation[] = rows
        .filter((r) => r && r.id && r.name)
        .map((r) => ({
          id: String(r.id),
          name: String(r.name),
          sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
        }));
      setConstellations(sortByName(next));
    }

    const decisionIds = list.map((d) => d.id);
    if (decisionIds.length > 0) {
      const [ddRes, ciRes] = await Promise.all([
        supabase.from("decision_domains").select("decision_id,domain_id").eq("user_id", uid).in("decision_id", decisionIds),
        supabase.from("constellation_items").select("decision_id,constellation_id").eq("user_id", uid).in("decision_id", decisionIds),
      ]);

      if (!ddRes.error) {
        const next: Record<string, string | null> = {};
        for (const row of ddRes.data ?? []) next[String((row as any).decision_id)] = String((row as any).domain_id);
        setDomainByDecision(next);
      } else setDomainByDecision({});

      if (!ciRes.error) {
        const next: Record<string, string[]> = {};
        for (const row of ciRes.data ?? []) {
          const did = String((row as any).decision_id);
          const cid = String((row as any).constellation_id);
          next[did] = next[did] ? [...next[did], cid] : [cid];
        }
        setConstellationsByDecision(next);
      } else setConstellationsByDecision({});
    } else {
      setDomainByDecision({});
      setConstellationsByDecision({});
    }
  };

  // reset paging when tab / search / sort change (server-side concerns)
  useEffect(() => {
    setPage(1);
    setShowAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchDebounced, sortKey]);

  useEffect(() => {
    void load();
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, searchDebounced, sortKey]);

  // Realtime decisions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`decisions-${tab}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, () => {
        scheduleReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab]);

  // Apply query open/work
  useEffect(() => {
    if (tab !== "active") return;

    if (openFromQuery) {
      setOpenId(openFromQuery);
      window.setTimeout(() => {
        scrollToDecisionTop(openFromQuery);
      }, 60);
    } else {
      setOpenId(null);
    }

    if (workFromQuery && openFromQuery) {
      setWorkForId(openFromQuery);
      // ✅ keep anchored at top of card (no scroll to chat)
      window.setTimeout(() => {
        scrollToDecisionTop(openFromQuery);
      }, 60);
      window.setTimeout(() => {
        scrollToDecisionTop(openFromQuery);
      }, 320);
    } else {
      setWorkForId(null);
    }
  }, [tab, openFromQuery, workFromQuery]);

  const reloadSummaries = async (decisionId: string) => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("decision_summaries")
      .select("id,decision_id,summary_text,created_at")
      .eq("user_id", userId)
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      setSummaries([]);
      return;
    }

    setSummaries((data ?? []) as DecisionSummary[]);
  };

  /** ✅ load notes for a decision */
  const loadNotes = async (decisionId: string) => {
    if (!userId) return;

    setNotesLoadingByDecisionId((p) => ({ ...p, [decisionId]: true }));

    const { data, error } = await supabase
      .from("decision_notes")
      .select("id,user_id,decision_id,body,created_at,updated_at")
      .eq("user_id", userId)
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: false });

    if (error) {
      showToast({ message: `Couldn’t load notes: ${error.message}` }, 3500);
      setNotesByDecisionId((p) => ({ ...p, [decisionId]: [] }));
      setNotesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
      return;
    }

    const rows = (data ?? []) as any[];
    const safe: DecisionNote[] = rows
      .filter((r) => r && r.id && typeof r.body === "string")
      .map((r) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        decision_id: String(r.decision_id),
        body: String(r.body),
        created_at: String(r.created_at ?? new Date().toISOString()),
        updated_at: r.updated_at ? String(r.updated_at) : null,
      }));

    setNotesByDecisionId((p) => ({ ...p, [decisionId]: safe }));
    setNotesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
  };

  const addNote = async (decisionId: string) => {
    if (!userId) {
      showToast({ message: "Not signed in." }, 2500);
      return;
    }

    const text = (noteDraftByDecisionId[decisionId] ?? "").trim();
    if (!text) {
      showToast({ message: "Type a note first." }, 1800);
      return;
    }

    setNoteDraftByDecisionId((p) => ({ ...p, [decisionId]: "" }));

    const { error } = await supabase.from("decision_notes").insert({
      user_id: userId,
      decision_id: decisionId,
      body: text,
    });

    if (error) {
      showToast({ message: `Couldn’t save note: ${error.message}` }, 3500);
      setNoteDraftByDecisionId((p) => ({ ...p, [decisionId]: text }));
      return;
    }

    showToast({ message: "Note saved." }, 1400);
    void loadNotes(decisionId);
  };

  const startEditNote = (n: DecisionNote) => {
    setEditingNoteId(n.id);
    setEditingNoteDraft(n.body);
  };

  const cancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteDraft("");
  };

  const saveEditNote = async (decisionId: string, noteId: string) => {
    if (!userId) return;

    const next = (editingNoteDraft ?? "").trim();
    if (!next) {
      showToast({ message: "Note can’t be empty." }, 2000);
      return;
    }

    const { error } = await supabase.from("decision_notes").update({ body: next }).eq("user_id", userId).eq("id", noteId);

    if (error) {
      showToast({ message: `Couldn’t update note: ${error.message}` }, 3500);
      return;
    }

    setEditingNoteId(null);
    setEditingNoteDraft("");
    showToast({ message: "Updated." }, 1400);
    void loadNotes(decisionId);
  };

  const deleteNote = async (decisionId: string, noteId: string) => {
    if (!userId) return;

    const { error } = await supabase.from("decision_notes").delete().eq("user_id", userId).eq("id", noteId);

    if (error) {
      showToast({ message: `Couldn’t delete note: ${error.message}` }, 3500);
      return;
    }

    showToast({ message: "Deleted." }, 1200);
    void loadNotes(decisionId);
  };

  const openDecision = useMemo(() => items.find((d) => d.id === openId) ?? null, [items, openId]);

  useEffect(() => {
    if (!userId || !openDecision) {
      setSummaries([]);
      return;
    }
    void reloadSummaries(openDecision.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openDecision?.id]);

  // when open decision changes, load its notes
  useEffect(() => {
    if (!userId) return;
    if (tab !== "active") return;
    if (!openDecision?.id) return;

    void loadNotes(openDecision.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab, openDecision?.id]);

  const filteredItems = useMemo(() => {
    // items are already server-searched + server-sorted + paged.
    // Filters remain client-side.
    let list = items;

    if (tab === "closed") list = list.filter((d) => d.status === "chapter");
    if (tab === "active" || tab === "new") list = list.filter((d) => d.status !== "chapter");

    if (activeDomainId) list = list.filter((d) => (domainByDecision[d.id] ?? null) === activeDomainId);
    if (activeConstellationId) list = list.filter((d) => (constellationsByDecision[d.id] ?? []).includes(activeConstellationId));
    if (hasReviewDateOnly) list = list.filter((d) => !!d.review_at);
    if (reviewDueOnly) list = list.filter((d) => isReviewDue(d.review_at));

    return list;
  }, [items, tab, activeDomainId, activeConstellationId, hasReviewDateOnly, reviewDueOnly, domainByDecision, constellationsByDecision]);

  const openItem = tab === "active" && openId ? filteredItems.find((d) => d.id === openId) ?? null : null;
  const others = useMemo(() => filteredItems.filter((d) => d.id !== openId), [filteredItems, openId]);

  const visibleOthers = useMemo(() => {
    if (showAll) return others;
    return others.slice(0, DEFAULT_LIMIT);
  }, [others, showAll]);

  const hasMoreInUI = others.length > DEFAULT_LIMIT;

  const hasServerMore = useMemo(() => {
    return items.length < totalCount;
  }, [items.length, totalCount]);

  const loadMore = () => {
    if (!hasServerMore) return;
    setPage((p) => p + 1);
  };

  // Page 1 requestFrame + saveFramedDecision (unchanged)
  const requestFrame = async () => {
    const text = (newText ?? "").trim();
    if (!text) {
      showToast({ message: "Type your decision first." }, 2000);
      newRef.current?.focus?.();
      return;
    }

    setFramingBusy(true);
    setNewStep("framing");

    try {
      const res = await fetch("/api/ai/decision-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ? String(json.error) : "Couldn’t clarify right now.");
      }

      const f = json?.frame ?? null;
      if (!f) throw new Error("No frame returned.");

      const next = {
        title: String(f.title ?? "").trim() || titleFromStatement(text),
        statement: String(f.statement ?? "").trim() || text,
        what_im_hearing: String(f.what_im_hearing ?? "").trim(),
        questions: Array.isArray(f.questions) ? f.questions.map((q: any) => String(q)).filter(Boolean).slice(0, 5) : [],
      };

      setFrameDraft(next);
      setNewStep("confirm");
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t clarify right now." }, 3500);
      setNewStep("input");
    } finally {
      setFramingBusy(false);
    }
  };

  const saveFramedDecision = async () => {
    if (!userId) {
      showToast({ message: "Not signed in." }, 2500);
      return;
    }
    if (!frameDraft) return;

    const original = (newText ?? "").trim();
    if (!original) {
      showToast({ message: "Type your decision first." }, 2000);
      setNewStep("input");
      newRef.current?.focus?.();
      return;
    }

    const title = (frameDraft.title ?? "").trim();
    const statement = (frameDraft.statement ?? "").trim();
    if (!title || !statement) {
      showToast({ message: "Please confirm the decision statement." }, 2200);
      return;
    }

    setCreatingNew(true);

    try {
      const context = composeContext(original, "");

      const { data, error } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          title,
          context,
          status: "open",
          origin: "decisions",
          decided_at: null,
          framed_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error || !data?.id) {
        throw new Error(error?.message ?? "Save failed.");
      }

      const id = String(data.id);

      setNewText("");
      setFrameDraft(null);
      setNewStep("input");

      showToast({ message: "Saved to Active Decisions." }, 1500);
      router.push(
        buildUrl("active", {
          open: id,
          work: false,
          q: searchDebounced,
          sort: sortKey,
          domain: activeDomainId,
          group: activeConstellationId,
          hasReview: hasReviewDateOnly,
          reviewDue: reviewDueOnly,
        })
      );
    } catch (e: any) {
      showToast({ message: e?.message ?? "Save failed." }, 3500);
    } finally {
      setCreatingNew(false);
    }
  };

  const performDelete = async (d: Decision) => {
    if (!userId) return;

    const prev = items;
    setItems((p) => p.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (confirmDeleteForId === d.id) setConfirmDeleteForId(null);

    try {
      await supabase.from("decision_domains").delete().eq("user_id", userId).eq("decision_id", d.id);
    } catch {}
    try {
      await supabase.from("constellation_items").delete().eq("user_id", userId).eq("decision_id", d.id);
    } catch {}
    try {
      await supabase.from("decision_summaries").delete().eq("user_id", userId).eq("decision_id", d.id);
    } catch {}
    try {
      await supabase.from("decision_notes").delete().eq("user_id", userId).eq("decision_id", d.id);
    } catch {}

    const { data, error } = await supabase.from("decisions").delete().eq("id", d.id).eq("user_id", userId).select("id");
    const deletedCount = Array.isArray(data) ? data.length : 0;

    if (error || deletedCount === 0) {
      const msg = error?.message ? `Couldn’t delete: ${error.message}` : "Couldn’t delete right now.";
      showToast({ message: msg }, 3500);
      setItems(prev);
      scheduleReload();
      return;
    }

    showToast({ message: "Deleted." }, 2500);
  };

  const closeDecision = async (d: Decision) => {
    if (!userId) return;
    const prev = d.status;

    setItems((p) => p.map((x) => (x.id === d.id ? { ...x, status: "chapter" } : x)));

    const { error } = await supabase.from("decisions").update({ status: "chapter" }).eq("id", d.id).eq("user_id", userId);
    if (error) {
      showToast({ message: `Couldn’t move: ${error.message}` }, 3500);
      setItems((p) => p.map((x) => (x.id === d.id ? { ...x, status: prev } : x)));
      return;
    }

    showToast({ message: "Moved to Closed." }, 1800);
    router.push(
      buildUrl("active", {
        q: searchDebounced,
        sort: sortKey,
        domain: activeDomainId,
        group: activeConstellationId,
        hasReview: hasReviewDateOnly,
        reviewDue: reviewDueOnly,
      })
    );
  };

  const reopenDecision = async (d: Decision) => {
    if (!userId) return;

    setItems((p) => p.map((x) => (x.id === d.id ? { ...x, status: "open" } : x)));

    const { error } = await supabase.from("decisions").update({ status: "open" }).eq("id", d.id).eq("user_id", userId);
    if (error) {
      showToast({ message: `Couldn’t re-open: ${error.message}` }, 3500);
      scheduleReload();
      return;
    }

    showToast({ message: "Re-opened." }, 1600);
    router.push(
      buildUrl("active", {
        open: d.id,
        work: false,
        q: searchDebounced,
        sort: sortKey,
        domain: activeDomainId,
        group: activeConstellationId,
        hasReview: hasReviewDateOnly,
        reviewDue: reviewDueOnly,
      })
    );
  };

  const setReviewAt = async (d: Decision, review_at: string | null) => {
    if (!userId) return;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at } : x)));

    const { error } = await supabase.from("decisions").update({ review_at }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t update: ${error.message}` }, 3500);
      scheduleReload();
      return;
    }

    showToast({ message: review_at ? "Review scheduled." : "Review cleared." }, 1600);
  };

  const filterCount = useMemo(() => {
    return (activeDomainId ? 1 : 0) + (activeConstellationId ? 1 : 0) + (hasReviewDateOnly ? 1 : 0) + (reviewDueOnly ? 1 : 0);
  }, [activeDomainId, activeConstellationId, hasReviewDateOnly, reviewDueOnly]);

  const sortIsActive = sortKey !== "newest";

  const TopTabs = () => (
    <div className="flex justify-center">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={tab === "new"} onClick={() => router.push(buildUrl("new"))} title="New decision">
          New Decision
        </Chip>
        <Chip
          active={tab === "active"}
          onClick={() =>
            router.push(
              buildUrl("active", {
                q: searchDebounced,
                sort: sortKey,
                domain: activeDomainId,
                group: activeConstellationId,
                hasReview: hasReviewDateOnly,
                reviewDue: reviewDueOnly,
              })
            )
          }
          title="Active decisions"
        >
          Active Decisions
        </Chip>
        <Chip
          active={tab === "closed"}
          onClick={() =>
            router.push(
              buildUrl("closed", {
                q: searchDebounced,
                sort: sortKey,
                domain: activeDomainId,
                group: activeConstellationId,
                hasReview: hasReviewDateOnly,
                reviewDue: reviewDueOnly,
              })
            )
          }
          title="Closed decisions"
        >
          Closed Decisions
        </Chip>
      </div>
    </div>
  );

  const DecisionRow = ({ d }: { d: Decision }) => (
    <div className="px-4 py-4 border-b border-zinc-200 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-zinc-900">{d.title}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Started {softWhen(d.created_at)}
            {d.review_at ? ` • Review ${softWhen(d.review_at)}` : ""}
          </div>
        </div>

        <div className="shrink-0">
          <Chip
            onClick={() => {
              setOpenId(d.id);
              setWorkForId(null);
              setConfirmDeleteForId(null);

              router.push(
                buildUrl("active", {
                  open: d.id,
                  work: false,
                  q: searchDebounced,
                  sort: sortKey,
                  domain: activeDomainId,
                  group: activeConstellationId,
                  hasReview: hasReviewDateOnly,
                  reviewDue: reviewDueOnly,
                })
              );

              window.setTimeout(() => scrollToDecisionTop(d.id), 60);
            }}
          >
            Open
          </Chip>
        </div>
      </div>
    </div>
  );

  const renderOpenDecision = (d: Decision) => {
    splitContext(d.context);

    const allAtt = normalizeAttachments(d.attachments) as AttachmentMeta[];
    const isWorking = workForId === d.id;

    const notes = notesByDecisionId[d.id] ?? [];
    const notesLoading = !!notesLoadingByDecisionId[d.id];
    const composerValue = noteDraftByDecisionId[d.id] ?? "";

    return (
      <div
        ref={(el) => {
          cardRefs.current[d.id] = el;
        }}
        className="rounded-2xl border border-zinc-200 bg-white p-4"
      >
        {/* top anchor for scroll-to-top */}
        <div
          ref={(el) => {
            topAnchorRefs.current[d.id] = el;
          }}
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-zinc-900">{d.title}</div>
            <div className="mt-1 text-xs text-zinc-500">
              Started {softWhen(d.created_at)}
              {d.review_at ? ` • Review ${softWhen(d.review_at)}` : ""}
            </div>
          </div>
        </div>

        {/* Green button */}
        {!isWorking ? (
          <div className="mt-4">
            <PrimaryActionButton
              onClick={() => {
                setWorkForId(d.id);
                router.push(
                  buildUrl("active", {
                    open: d.id,
                    work: true,
                    q: searchDebounced,
                    sort: sortKey,
                    domain: activeDomainId,
                    group: activeConstellationId,
                    hasReview: hasReviewDateOnly,
                    reviewDue: reviewDueOnly,
                  })
                );

                // ✅ anchor to very top of decision card (yellow arrow area)
                window.setTimeout(() => scrollToDecisionTop(d.id), 0);
                window.setTimeout(() => scrollToDecisionTop(d.id), 80);
                window.setTimeout(() => scrollToDecisionTop(d.id), 320);
              }}
              title="Open the conversation"
            >
              Let’s work this through…
            </PrimaryActionButton>
          </div>
        ) : null}

        {/* Conversation */}
        {isWorking ? (
          <div id="work-through-panel" className="mt-4">
            <ConversationPanel
              decisionId={d.id}
              decisionTitle={d.title}
              askedText={""} // ✅ remove repeated small text under the header
              frame={{ decision_statement: d.title }}
              autoFocusToken={1}
              autoStartToken={1}
              onClose={() => {
                setWorkForId(null);
                router.push(
                  buildUrl("active", {
                    open: d.id,
                    work: false,
                    q: searchDebounced,
                    sort: sortKey,
                    domain: activeDomainId,
                    group: activeConstellationId,
                    hasReview: hasReviewDateOnly,
                    reviewDue: reviewDueOnly,
                  })
                );
                window.setTimeout(() => scrollToDecisionTop(d.id), 0);
              }}
              onSummarySaved={() => void reloadSummaries(d.id)}
            />
          </div>
        ) : null}

        {/* Workspace */}
        <div className="mt-5 space-y-4">
          {/* Notes */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Notes</div>
              <div className="flex items-center gap-2">
                <Chip onClick={() => void loadNotes(d.id)} title="Refresh notes">
                  Refresh
                </Chip>
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                value={composerValue}
                onChange={(e) => setNoteDraftByDecisionId((p) => ({ ...p, [d.id]: e.target.value }))}
                placeholder="Add a note…"
                className="w-full min-h-[90px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                onKeyDown={(e) => {
                  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
                  if (cmdOrCtrl && e.key === "Enter") {
                    e.preventDefault();
                    void addNote(d.id);
                  }
                }}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Chip onClick={() => void addNote(d.id)} title="Save note">
                  Save note
                </Chip>

                {editingNoteId ? <div className="text-xs text-zinc-500">Editing a note below — save/cancel there.</div> : null}
              </div>
            </div>

            <div className="pt-1 space-y-3">
              {notesLoading ? <div className="text-sm text-zinc-500">Loading notes…</div> : null}

              {!notesLoading && notes.length === 0 ? (
                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">No notes yet.</div>
              ) : null}

              {!notesLoading
                ? notes.map((n) => {
                    const isEditing = editingNoteId === n.id;
                    const stamp = softWhenDateTime(n.created_at);
                    const edited = n.updated_at ? ` • edited ${softWhenDateTime(n.updated_at)}` : "";

                    return (
                      <div key={n.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-zinc-500">
                              {stamp}
                              {edited}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {!isEditing ? (
                              <>
                                <Chip onClick={() => startEditNote(n)} title="Edit note">
                                  Edit
                                </Chip>
                                <Chip onClick={() => void deleteNote(d.id, n.id)} title="Delete note">
                                  Delete
                                </Chip>
                              </>
                            ) : (
                              <>
                                <Chip onClick={() => void saveEditNote(d.id, n.id)} title="Save changes">
                                  Save
                                </Chip>
                                <Chip onClick={cancelEditNote} title="Cancel edit">
                                  Cancel
                                </Chip>
                              </>
                            )}
                          </div>
                        </div>

                        {!isEditing ? (
                          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{n.body}</div>
                        ) : (
                          <textarea
                            value={editingNoteDraft}
                            onChange={(e) => setEditingNoteDraft(e.target.value)}
                            className="mt-2 w-full min-h-[90px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                          />
                        )}
                      </div>
                    );
                  })
                : null}
            </div>
          </div>

          {/* Files */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            {userId ? (
              <AttachmentsBlock
                userId={userId}
                decisionId={d.id}
                title={allAtt.length ? `Files (${allAtt.length})` : "Files"}
                bucket="captures"
                initial={allAtt}
              />
            ) : (
              <div className="text-sm text-zinc-600">Files unavailable.</div>
            )}
          </div>

          {/* Review */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
            <div className="text-sm font-semibold text-zinc-900">Review</div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                value={d.review_at ? new Date(safeMs(d.review_at) ?? Date.now()).toISOString().slice(0, 10) : ""}
                onChange={(e) => {
                  const iso = isoFromDateInput(e.target.value);
                  void setReviewAt(d, iso);
                }}
                title="Set review date"
              />
              {d.review_at ? (
                <Chip onClick={() => void setReviewAt(d, null)} title="Clear review date">
                  Clear
                </Chip>
              ) : (
                <span className="text-xs text-zinc-500">Optional</span>
              )}
            </div>
          </div>

          {/* Chat summaries */}
          {summaries.length > 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Chat summaries</div>
                <div className="text-xs text-zinc-500">Saved summaries attached to this decision.</div>
              </div>

              {summaries.map((s) => {
                const one = summaryOneLine(s.summary_text);
                const open = !!expandedSummary[s.id];

                return (
                  <details
                    key={s.id}
                    open={open}
                    onToggle={(e) => {
                      const nextOpen = (e.currentTarget as HTMLDetailsElement).open;
                      setExpandedSummary((p) => ({ ...p, [s.id]: nextOpen }));
                    }}
                    className="rounded-2xl border border-zinc-200 bg-white px-4 py-3"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                          <div className="mt-1 text-sm font-medium text-zinc-900 truncate">{renderInlineBold(one)}</div>
                        </div>
                        <div className="shrink-0">
                          <span className="text-xs text-zinc-500">{open ? "Hide" : "Expand"}</span>
                        </div>
                      </div>
                    </summary>

                    <div className="mt-3 space-y-2">{renderSummaryBody(s.summary_text)}</div>
                  </details>
                );
              })}
            </div>
          ) : null}

          {/* Actions (bottom buttons) */}
          {confirmDeleteForId === d.id ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C94A4A] bg-[#FCECEC] px-4 py-3">
              <div className="text-sm text-[#7A1E1E]">
                Delete this decision? <span className="opacity-80">This can’t be undone.</span>
              </div>
              <div className="flex items-center gap-2">
                <Chip onClick={() => setConfirmDeleteForId(null)}>Cancel</Chip>
                <button
                  type="button"
                  onClick={() => void performDelete(d)}
                  className="inline-flex select-none items-center justify-center rounded-full border border-[#C94A4A] bg-[#C94A4A] px-4 py-2 text-sm text-white transition hover:bg-[#b94141]"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                onClick={() => {
                  setOpenId(null);
                  setWorkForId(null);
                  setConfirmDeleteForId(null);
                  cancelEditNote();
                  router.push(
                    buildUrl("active", {
                      q: searchDebounced,
                      sort: sortKey,
                      domain: activeDomainId,
                      group: activeConstellationId,
                      hasReview: hasReviewDateOnly,
                      reviewDue: reviewDueOnly,
                    })
                  );
                }}
                title="Hide decision"
              >
                Hide
              </Chip>

              <Chip onClick={() => void closeDecision(d)} title="Move to Closed">
                Move to Closed
              </Chip>

              <Chip onClick={() => setConfirmDeleteForId(d.id)} title="Delete decision">
                Delete
              </Chip>
            </div>
          )}
        </div>
      </div>
    );
  };

  const shouldShowStatusLine =
    statusLine && (statusLine.startsWith("Error:") || statusLine === "Not signed in." || statusLine === "Loading…");

  const ActiveFilterChips = () => {
    const any = filterCount > 0 || sortIsActive || !!(searchDebounced ?? "").trim();
    if (!any) return null;

    const areaName = activeDomainId ? domains.find((d) => d.id === activeDomainId)?.name ?? "Area" : "";
    const groupName = activeConstellationId ? constellations.find((c) => c.id === activeConstellationId)?.name ?? "Group" : "";

    const ChipPill = ({ label, onClear }: { label: string; onClear: () => void }) => (
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
        title="Clear"
      >
        <span className="truncate max-w-[220px]">{label}</span>
        <span className="text-zinc-400">×</span>
      </button>
    );

    return (
      <div className="flex flex-wrap items-center gap-2 px-1">
        {(searchDebounced ?? "").trim() ? <ChipPill label={`Search: ${(searchDebounced ?? "").trim()}`} onClear={() => setSearchText("")} /> : null}
        {sortIsActive ? <ChipPill label={`Sort: ${sortLabel[sortKey]}`} onClear={() => setSortKey("newest")} /> : null}
        {activeDomainId ? <ChipPill label={`Area: ${areaName}`} onClear={() => setActiveDomainId(null)} /> : null}
        {activeConstellationId ? <ChipPill label={`Group: ${groupName}`} onClear={() => setActiveConstellationId(null)} /> : null}
        {hasReviewDateOnly ? <ChipPill label="Has review date" onClear={() => setHasReviewDateOnly(false)} /> : null}
        {reviewDueOnly ? <ChipPill label="Review due" onClear={() => setReviewDueOnly(false)} /> : null}

        {(filterCount > 0 || sortIsActive || (searchDebounced ?? "").trim()) ? (
          <button
            type="button"
            onClick={() => {
              setSearchText("");
              setSortKey("newest");
              setActiveDomainId(null);
              setActiveConstellationId(null);
              setHasReviewDateOnly(false);
              setReviewDueOnly(false);
              setFilterOpen(false);
              setSortOpen(false);
            }}
            className="ml-1 inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
            title="Clear all"
          >
            Clear all
          </button>
        ) : null}
      </div>
    );
  };

  const FilterPanel = () => (
    <div ref={filterBoxRef} className="relative">
      <FilterIconButton
        active={filterOpen || filterCount > 0}
        count={filterCount > 0 ? filterCount : undefined}
        onClick={() => {
          setFilterOpen((v) => !v);
          setSortOpen(false);
        }}
        title="Filters"
      />

      {filterOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900">Filters</div>
            <div className="flex items-center gap-2">
              {filterCount > 0 ? (
                <Chip
                  onClick={() => {
                    setActiveDomainId(null);
                    setActiveConstellationId(null);
                    setHasReviewDateOnly(false);
                    setReviewDueOnly(false);
                  }}
                  title="Clear filters"
                >
                  Clear
                </Chip>
              ) : null}
              <Chip onClick={() => setFilterOpen(false)} title="Close filters">
                Done
              </Chip>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-4">
            {/* quick toggles */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-500">Quick</div>
              <div className="flex flex-wrap gap-2">
                <Chip active={reviewDueOnly} onClick={() => setReviewDueOnly((v) => !v)} title="Show only decisions that are due for review">
                  Review due
                </Chip>
                <Chip active={hasReviewDateOnly} onClick={() => setHasReviewDateOnly((v) => !v)} title="Show only decisions with a review date">
                  Has review date
                </Chip>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-500">Area</div>
              <div className="flex flex-wrap gap-2">
                <Chip active={!activeDomainId} onClick={() => setActiveDomainId(null)} title="All areas">
                  All
                </Chip>
                {domains.map((d) => (
                  <Chip key={d.id} active={activeDomainId === d.id} onClick={() => setActiveDomainId(d.id)} title={d.name}>
                    {d.name}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-zinc-500">Group</div>
              <div className="flex flex-wrap gap-2">
                <Chip active={!activeConstellationId} onClick={() => setActiveConstellationId(null)} title="All groups">
                  All
                </Chip>
                {constellations.map((c) => (
                  <Chip key={c.id} active={activeConstellationId === c.id} onClick={() => setActiveConstellationId(c.id)} title={c.name}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>

            {(hasReviewDateOnly || reviewDueOnly) ? (
              <div className="text-xs text-zinc-500">
                Tip: Use Sort → <span className="font-medium">Review soonest</span> to line them up.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  const SortPanel = () => (
    <div ref={sortBoxRef} className="relative">
      <SortIconButton
        active={sortOpen || sortIsActive}
        onClick={() => {
          setSortOpen((v) => !v);
          setFilterOpen(false);
        }}
        title="Sort"
      />

      {sortOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-[260px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900">Sort</div>
            <div className="flex items-center gap-2">
              {sortIsActive ? (
                <Chip onClick={() => setSortKey("newest")} title="Reset sort">
                  Reset
                </Chip>
              ) : null}
              <Chip onClick={() => setSortOpen(false)} title="Close sort">
                Done
              </Chip>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-2">
            {(
              [
                ["newest", "Newest"],
                ["oldest", "Oldest"],
                ["reviewSoon", "Review soonest"],
                ["reviewLate", "Review latest"],
                ["titleAZ", "Title A–Z"],
                ["titleZA", "Title Z–A"],
              ] as Array<[SortKey, string]>
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSortKey(k)}
                className={[
                  "w-full rounded-2xl border px-3 py-2 text-left text-sm transition",
                  sortKey === k ? "border-zinc-300 bg-zinc-50 text-zinc-900" : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const searchPlaceholder = useMemo(() => {
    const within = filterCount > 0 ? "Search within results…" : tab === "closed" ? "Search closed decisions…" : "Search decisions…";
    return within;
  }, [filterCount, tab]);

  return (
    <Page title={pageTitle} subtitle={pageSubtitle} right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <TopTabs />

        {/* Page 1: New Decision */}
        {tab === "new" ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">What needs deciding?</div>
              <div className="text-sm text-zinc-600">Start messy — we’ll clarify it.</div>
            </div>

            <textarea
              ref={newRef}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={4}
              placeholder="Start typing…"
              className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && newStep === "input") {
                  e.preventDefault();
                  void requestFrame();
                }
              }}
            />

            {newStep === "framing" ? <div className="text-sm text-zinc-500">Clarifying…</div> : null}

            {(newStep === "confirm" || newStep === "edit") && frameDraft ? (
              <div className="space-y-4">
                {frameDraft.what_im_hearing ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="text-xs font-semibold text-zinc-500">What I’m hearing</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{frameDraft.what_im_hearing}</div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
                  <div className="text-sm font-semibold text-zinc-900">Decision statement</div>

                  {newStep === "confirm" ? (
                    <div className="space-y-1">
                      <div className="text-sm text-zinc-900">{frameDraft.statement}</div>
                      <div className="text-xs text-zinc-500">{frameDraft.title}</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        value={frameDraft.title}
                        onChange={(e) => setFrameDraft((p) => (p ? { ...p, title: e.target.value } : p))}
                        className="h-10 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                        placeholder="Title"
                      />
                      <textarea
                        value={frameDraft.statement}
                        onChange={(e) => setFrameDraft((p) => (p ? { ...p, statement: e.target.value } : p))}
                        rows={3}
                        className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                        placeholder="Decision statement"
                      />
                    </div>
                  )}

                  {frameDraft.questions?.length ? (
                    <div>
                      <div className="text-xs font-semibold text-zinc-500">Quick clarifiers</div>
                      <ul className="mt-2 list-disc pl-5 text-sm text-zinc-700 space-y-1">
                        {frameDraft.questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    {newStep === "confirm" ? (
                      <>
                        <PrimaryActionButton disabled={creatingNew} onClick={() => void saveFramedDecision()} title="Save to Active Decisions">
                          {creatingNew ? "Saving…" : "Yes — Save to Active"}
                        </PrimaryActionButton>
                        <Chip onClick={() => setNewStep("edit")} title="Edit the statement">
                          Edit
                        </Chip>
                      </>
                    ) : (
                      <>
                        <PrimaryActionButton disabled={creatingNew} onClick={() => void saveFramedDecision()} title="Save to Active Decisions">
                          {creatingNew ? "Saving…" : "Save to Active"}
                        </PrimaryActionButton>
                        <Chip onClick={() => setNewStep("confirm")} title="Done editing">
                          Done
                        </Chip>
                      </>
                    )}

                    <Chip
                      onClick={() => {
                        setFrameDraft(null);
                        setNewStep("input");
                      }}
                      title="Start over"
                    >
                      Start over
                    </Chip>
                  </div>
                </div>
              </div>
            ) : null}

            {newStep === "input" ? (
              <div className="flex flex-wrap items-center gap-2">
                <PrimaryActionButton disabled={framingBusy || creatingNew} onClick={() => void requestFrame()} title="Clarify this decision">
                  {framingBusy ? "Clarifying…" : "Next"}
                </PrimaryActionButton>

                <Chip
                  onClick={() =>
                    router.push(
                      buildUrl("active", {
                        q: searchDebounced,
                        sort: sortKey,
                        domain: activeDomainId,
                        group: activeConstellationId,
                        hasReview: hasReviewDateOnly,
                        reviewDue: reviewDueOnly,
                      })
                    )
                  }
                  title="Go to Active Decisions"
                >
                  Active Decisions
                </Chip>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Page 2: Active Decisions */}
        {tab === "active" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={searchInputRef}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                />

                <SortPanel />
                <FilterPanel />
              </div>
            </div>

            <ActiveFilterChips />

            {shouldShowStatusLine ? <div className="text-xs text-zinc-500">{statusLine}</div> : null}

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                  <div className="text-sm text-zinc-600">When something needs attention, it can live here quietly.</div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {openItem ? (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-zinc-500">Open decision</div>
                    {renderOpenDecision(openItem)}
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-500">{openItem ? "Other decisions" : "Decisions"}</div>

                    {hasMoreInUI ? (
                      <div className="flex items-center gap-2">
                        <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
                        {!showAll ? (
                          <div className="text-xs text-zinc-500">
                            Showing {DEFAULT_LIMIT} of {others.length}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white">
                    {visibleOthers.map((d) => (
                      <DecisionRow key={d.id} d={d} />
                    ))}
                  </div>

                  {showAll && hasServerMore ? (
                    <div className="flex items-center justify-center pt-2">
                      <Chip onClick={loadMore} title="Load more decisions">
                        Load more
                      </Chip>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Page 3: Closed Decisions */}
        {tab === "closed" ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={searchInputRef}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                />

                <SortPanel />
                <FilterPanel />
              </div>
            </div>

            <ActiveFilterChips />

            {shouldShowStatusLine ? <div className="text-xs text-zinc-500">{statusLine}</div> : null}

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm text-zinc-600">No closed decisions yet.</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white">
                {filteredItems.map((d) => (
                  <div key={d.id} className="px-4 py-4 border-b border-zinc-200 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-zinc-900">{d.title}</div>
                        <div className="mt-1 text-xs text-zinc-500">Started {softWhen(d.created_at)}</div>
                      </div>

                      <div className="shrink-0">
                        <Chip onClick={() => void reopenDecision(d)} title="Re-open this decision">
                          Re-open
                        </Chip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasServerMore ? (
              <div className="flex items-center justify-center pt-2">
                <Chip onClick={loadMore} title="Load more decisions">
                  Load more
                </Chip>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
