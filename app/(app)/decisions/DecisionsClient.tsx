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

/** ✅ sharing */
type HouseholdOption = {
  household_id: string;
  name: string | null;
  role: string | null;
};

type DecisionShare = {
  id?: string;
  decision_id?: string;
  household_id: string;
  household_name?: string | null;
  permission: "view" | "edit" | string;
  note?: string | null;
  created_at?: string | null;
  shared_by?: string | null;
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

function PrimaryActionButton(props: { children: React.ReactNode; onClick?: () => void; title?: string; disabled?: boolean }) {
  const { children, onClick, title, disabled } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={[
        "inline-flex select-none items-center justify-center rounded-full px-4 py-2 text-sm transition",
        "bg-[#1F5E5C] text-white",
        "hover:bg-[#174947] hover:text-white",
        "disabled:bg-[#9FB8B6] disabled:text-white/90",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6FAFB2]/35 focus-visible:ring-offset-2",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function TextAction(props: { children: React.ReactNode; onClick?: () => void; title?: string; subtle?: boolean; danger?: boolean }) {
  const { children, onClick, title, subtle, danger } = props;

  // ✅ Change "danger" to black (per request)
  const cls = danger ? "text-zinc-900 hover:bg-zinc-100" : subtle ? "text-zinc-500 hover:bg-zinc-50" : "text-zinc-700 hover:bg-zinc-50";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-medium transition",
        cls,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6FAFB2]/30 focus-visible:ring-offset-2",
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
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full transition",
        active ? "bg-zinc-100 text-zinc-900" : "bg-transparent text-zinc-700 hover:bg-zinc-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6FAFB2]/30 focus-visible:ring-offset-2",
      ].join(" ")}
      aria-label="Filters"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>

      {count && count > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[11px] font-medium text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function SortIconButton({ active, onClick, title }: { active?: boolean; onClick?: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-3 transition",
        active ? "bg-zinc-100 text-zinc-900" : "bg-transparent text-zinc-700 hover:bg-zinc-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6FAFB2]/30 focus-visible:ring-offset-2",
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
  const parts = String(text ?? "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean);
  return parts.map((p, i) => {
    const m = p.match(/^\*\*([^*]+)\*\*$/);
    if (m) return <strong key={i}>{m[1]}</strong>;
    return <span key={i}>{p}</span>;
  });
}
function isGenericSummaryLine(line: string) {
  const s = stripMdMarkers(stripBulletPrefix(line)).toLowerCase();
  return (
    s === "here’s a summary of the conversation so far:" ||
    s === "here's a summary of the conversation so far:" ||
    s.startsWith("here’s a summary") ||
    s.startsWith("here's a summary")
  );
}

function summaryHeadingFrom(text: string, fallbackTitle: string) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meaningful = lines.filter((l) => !isGenericSummaryLine(l));

  const decisionLine =
    meaningful.find((l) => /^[-•]\s*\**\s*Decision\s*\**\s*:/i.test(l)) ?? meaningful.find((l) => /Decision\s*:/i.test(l));

  if (decisionLine) {
    const cleaned = stripMdMarkers(stripBulletPrefix(decisionLine));
    const after = cleaned.split(/Decision\s*:/i)[1]?.trim();
    if (after) return after.length > 84 ? `${after.slice(0, 81)}…` : after;
  }

  const first = meaningful[0] ?? "";
  const one = stripMdMarkers(stripBulletPrefix(first));
  if (one) return one.length > 84 ? `${one.slice(0, 81)}…` : one;

  const fb = (fallbackTitle ?? "").trim();
  return fb.length > 84 ? `${fb.slice(0, 81)}…` : fb || "Summary";
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

function SegTabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const TabBtn = ({ t, label }: { t: Tab; label: string }) => {
    const active = tab === t;
    return (
      <button
        type="button"
        onClick={() => onTab(t)}
        className={[
          "h-10 rounded-full px-4 text-sm font-medium transition",
          active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6FAFB2]/30 focus-visible:ring-offset-2",
        ].join(" ")}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-1 rounded-full bg-zinc-100 p-1">
        <TabBtn t="new" label="New Decision" />
        <TabBtn t="active" label="Active Decisions" />
        <TabBtn t="closed" label="Closed Decisions" />
      </div>
    </div>
  );
}

/* ---------- review helpers (required dropdown + custom date + explicit set/clear) ---------- */

type ReviewPreset = "none" | "oneDay" | "oneWeek" | "oneMonth" | "threeMonths" | "sixMonths" | "oneYear" | "custom";

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function isoAtLocalNoon(date: Date) {
  const x = new Date(date);
  x.setHours(12, 0, 0, 0);
  return x.toISOString();
}
function addDaysLocal(base: Date, days: number) {
  const x = new Date(base);
  x.setDate(x.getDate() + days);
  return x;
}
function addMonthsLocal(base: Date, months: number) {
  const x = new Date(base);
  x.setMonth(x.getMonth() + months);
  return x;
}
function reviewIsoFromPreset(preset: ReviewPreset): string | null {
  const today = startOfLocalDay(new Date());
  if (preset === "none") return null;
  if (preset === "oneDay") return isoAtLocalNoon(addDaysLocal(today, 1));
  if (preset === "oneWeek") return isoAtLocalNoon(addDaysLocal(today, 7));
  if (preset === "oneMonth") return isoAtLocalNoon(addMonthsLocal(today, 1));
  if (preset === "threeMonths") return isoAtLocalNoon(addMonthsLocal(today, 3));
  if (preset === "sixMonths") return isoAtLocalNoon(addMonthsLocal(today, 6));
  if (preset === "oneYear") return isoAtLocalNoon(addMonthsLocal(today, 12));
  return null;
}

function shortId(id: string) {
  const s = String(id || "");
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function DecisionsClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const tabParam = (searchParams.get("tab") as Tab | null) ?? "new";
  const tab: Tab = tabParam === "active" || tabParam === "closed" || tabParam === "new" ? tabParam : "new";

  const openFromQuery = searchParams.get("open");
  const workFromQuery = searchParams.get("work") === "1";

  const initialQ = searchParams.get("q") ?? "";
  const initialSort = (searchParams.get("sort") as SortKey | null) ?? "newest";
  const initialDomain = searchParams.get("domain");
  const initialGroup = searchParams.get("group");
  const initialHasReview = searchParams.get("hasReview") === "1";
  const initialReviewDue = searchParams.get("reviewDue") === "1";

  useEffect(() => {
    const hasTab = searchParams.get("tab");
    if (!hasTab) router.replace(buildUrl("new"), { scroll: false });
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

  const [expandedClosed, setExpandedClosed] = useState<Record<string, boolean>>({});
  const [closedSummariesByDecisionId, setClosedSummariesByDecisionId] = useState<Record<string, DecisionSummary[]>>({});
  const [closedSummariesLoadingByDecisionId, setClosedSummariesLoadingByDecisionId] = useState<Record<string, boolean>>({});

  const reloadTimerRef = useRef<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const topAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [confirmDeleteForId, setConfirmDeleteForId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState<string>(initialQ);
  const [searchDebounced, setSearchDebounced] = useState<string>(initialQ);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const filterBoxRef = useRef<HTMLDivElement | null>(null);

  const [sortOpen, setSortOpen] = useState<boolean>(false);
  const sortBoxRef = useRef<HTMLDivElement | null>(null);

  const newRef = useRef<HTMLTextAreaElement | null>(null);
  const [newText, setNewText] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState<boolean>(false);

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

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);

  /** ✅ decision notes state */
  const [notesByDecisionId, setNotesByDecisionId] = useState<Record<string, DecisionNote[]>>({});
  const [notesLoadingByDecisionId, setNotesLoadingByDecisionId] = useState<Record<string, boolean>>({});
  const [noteDraftByDecisionId, setNoteDraftByDecisionId] = useState<Record<string, string>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteDraft, setEditingNoteDraft] = useState<string>("");

  /* ---------- add/edit controls ---------- */
  const [noteComposerOpenByDecisionId, setNoteComposerOpenByDecisionId] = useState<Record<string, boolean>>({});
  const [filesComposerOpenByDecisionId, setFilesComposerOpenByDecisionId] = useState<Record<string, boolean>>({});
  const [reviewEditorOpenByDecisionId, setReviewEditorOpenByDecisionId] = useState<Record<string, boolean>>({});

  // ✅ subsection hide/expand (requested)
  const [summariesExpandedByDecisionId, setSummariesExpandedByDecisionId] = useState<Record<string, boolean>>({});
  const [notesExpandedByDecisionId, setNotesExpandedByDecisionId] = useState<Record<string, boolean>>({});
  const [filesExpandedByDecisionId, setFilesExpandedByDecisionId] = useState<Record<string, boolean>>({});
  const [reviewExpandedByDecisionId, setReviewExpandedByDecisionId] = useState<Record<string, boolean>>({});

  // ✅ review draft (no auto set)
  const [reviewPresetByDecisionId, setReviewPresetByDecisionId] = useState<Record<string, ReviewPreset>>({});
  const [reviewCustomDateByDecisionId, setReviewCustomDateByDecisionId] = useState<Record<string, string>>({});

  const prevAttachmentCountRef = useRef<Record<string, number>>({});

  // ✅ editable chat summaries
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [editingSummaryDraft, setEditingSummaryDraft] = useState<string>("");

  /** ✅ Sharing state */
  const [households, setHouseholds] = useState<HouseholdOption[]>([]);
  const [sharesByDecisionId, setSharesByDecisionId] = useState<Record<string, DecisionShare[]>>({});
  const [sharesLoadingByDecisionId, setSharesLoadingByDecisionId] = useState<Record<string, boolean>>({});
  const [sharingExpandedByDecisionId, setSharingExpandedByDecisionId] = useState<Record<string, boolean>>({});
  const [shareComposerOpenByDecisionId, setShareComposerOpenByDecisionId] = useState<Record<string, boolean>>({});
  const [shareNoteDraftByDecisionId, setShareNoteDraftByDecisionId] = useState<Record<string, string>>({});
  const [shareTargetHouseholdByDecisionId, setShareTargetHouseholdByDecisionId] = useState<Record<string, string>>({});
  const [sharePermissionDraftByDecisionId, setSharePermissionDraftByDecisionId] = useState<Record<string, "view" | "edit">>({});

  const scrollToDecisionTop = (id: string) => {
    const anchor = topAnchorRefs.current[id] ?? cardRefs.current[id];
    anchor?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => void load({ silent: true }), 250);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchText), 200);
    return () => window.clearTimeout(t);
  }, [searchText]);

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

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;

      if (filterBoxRef.current && !filterBoxRef.current.contains(t)) setFilterOpen(false);
      if (sortBoxRef.current && !sortBoxRef.current.contains(t)) setSortOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

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
    const current = `/decisions?${searchParams.toString()}`;
    if (current !== desiredUrl) router.replace(desiredUrl, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredUrl]);

  /** ✅ fetch households the user belongs to (best-effort; safe if schema differs) */
  const loadHouseholds = async (uid: string) => {
    try {
      // Preferred shape: household_members -> households join
      const res = await supabase
        .from("household_members")
        .select("household_id,role,households(id,name)")
        .eq("user_id", uid);

      if (!res.error) {
        const rows = (res.data ?? []) as any[];
        const next: HouseholdOption[] = rows
          .filter((r) => r && r.household_id)
          .map((r) => ({
            household_id: String(r.household_id),
            role: r.role ? String(r.role) : null,
            name: r.households?.name ? String(r.households.name) : r.households?.id ? String(r.households.id) : null,
          }));
        setHouseholds(next);
        return;
      }

      // Fallback: just household_members if no join
      const res2 = await supabase.from("household_members").select("household_id,role").eq("user_id", uid);
      if (!res2.error) {
        const rows = (res2.data ?? []) as any[];
        const next: HouseholdOption[] = rows
          .filter((r) => r && r.household_id)
          .map((r) => ({
            household_id: String(r.household_id),
            role: r.role ? String(r.role) : null,
            name: null,
          }));
        setHouseholds(next);
        return;
      }

      setHouseholds([]);
    } catch {
      setHouseholds([]);
    }
  };

  const loadDecisionShares = async (decisionId: string) => {
    if (!decisionId) return;

    setSharesLoadingByDecisionId((p) => ({ ...p, [decisionId]: true }));

    try {
      const { data, error } = await supabase.rpc("list_decision_shares", { p_decision_id: decisionId });

      if (error) {
        setSharesByDecisionId((p) => ({ ...p, [decisionId]: [] }));
        setSharesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
        return;
      }

      const rows = Array.isArray(data) ? (data as any[]) : [];
      const safe: DecisionShare[] = rows
        .filter((r) => r && r.household_id)
        .map((r) => ({
          id: r.id ? String(r.id) : undefined,
          decision_id: r.decision_id ? String(r.decision_id) : undefined,
          household_id: String(r.household_id),
          household_name: r.household_name ? String(r.household_name) : r.household?.name ? String(r.household.name) : null,
          permission: r.permission ? String(r.permission) : "view",
          note: r.note ? String(r.note) : null,
          created_at: r.created_at ? String(r.created_at) : null,
          shared_by: r.shared_by ? String(r.shared_by) : null,
        }));

      setSharesByDecisionId((p) => ({ ...p, [decisionId]: safe }));
      setSharesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
    } catch {
      setSharesByDecisionId((p) => ({ ...p, [decisionId]: [] }));
      setSharesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
    }
  };

  const shareDecision = async (decisionId: string) => {
    if (!decisionId) return;

    const householdId = String(shareTargetHouseholdByDecisionId[decisionId] ?? "").trim();
    const permission = sharePermissionDraftByDecisionId[decisionId] ?? "view";
    const note = (shareNoteDraftByDecisionId[decisionId] ?? "").trim();

    if (!householdId) {
      showToast({ message: "Choose a household first." }, 2200);
      return;
    }

    const { error } = await supabase.rpc("share_decision_to_household", {
      p_decision_id: decisionId,
      p_household_id: householdId,
      p_note: note || null,
      p_permission: permission,
    });

    if (error) {
      showToast({ message: `Couldn’t share: ${error.message}` }, 3500);
      return;
    }

    showToast({ message: permission === "edit" ? "Shared (edit access)." : "Shared (view access)." }, 1600);

    setShareNoteDraftByDecisionId((p) => ({ ...p, [decisionId]: "" }));
    setShareComposerOpenByDecisionId((p) => ({ ...p, [decisionId]: false }));
    setSharingExpandedByDecisionId((p) => ({ ...p, [decisionId]: true }));
    void loadDecisionShares(decisionId);
  };

  const updateSharePermission = async (decisionId: string, householdId: string, permission: "view" | "edit") => {
    const { error } = await supabase.rpc("update_decision_share_permission", {
      p_decision_id: decisionId,
      p_household_id: householdId,
      p_permission: permission,
    });

    if (error) {
      showToast({ message: `Couldn’t update: ${error.message}` }, 3500);
      return;
    }

    showToast({ message: "Updated." }, 1400);
    void loadDecisionShares(decisionId);
  };

  const unshareDecision = async (decisionId: string, householdId: string) => {
    const { error } = await supabase.rpc("unshare_decision_from_household", {
      p_decision_id: decisionId,
      p_household_id: householdId,
    });

    if (error) {
      showToast({ message: `Couldn’t unshare: ${error.message}` }, 3500);
      return;
    }

    showToast({ message: "Unshared." }, 1400);
    void loadDecisionShares(decisionId);
  };

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

    // ✅ IMPORTANT: do NOT force user_id filter — let RLS decide (owned + shared)
    let q = supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments", { count: "exact" });

    if (tab === "active" || tab === "new") q = q.neq("status", "chapter");
    if (tab === "closed") q = q.eq("status", "chapter");

    const t = (searchDebounced ?? "").trim();
    if (t) {
      const safe = t.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${safe}%,context.ilike.%${safe}%`);
    }

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

    // User-scoped domains/constellations remain user_id-based (personal taxonomy)
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

    // ✅ load households once per auth (best-effort)
    void loadHouseholds(uid);
  };

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

  useEffect(() => {
    if (!userId) return;

    // ✅ IMPORTANT: do NOT filter to user_id; shared decisions must also refresh
    const channel = supabase
      .channel(`decisions-${tab}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => {
        scheduleReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab]);

  // ✅ FIX: there was an accidentally-nested duplicate useEffect here (caused TS2345 + parse cascade).
  // Keep a single effect that syncs open/work from query params when in Active tab.
  useEffect(() => {
    if (tab !== "active") return;

    if (openFromQuery) setOpenId(openFromQuery);
    else setOpenId(null);

    if (workFromQuery && openFromQuery) setWorkForId(openFromQuery);
    else setWorkForId(null);
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

  const loadClosedSummaries = async (decisionId: string) => {
    if (!userId) return;

    setClosedSummariesLoadingByDecisionId((p) => ({ ...p, [decisionId]: true }));

    const { data, error } = await supabase
      .from("decision_summaries")
      .select("id,decision_id,summary_text,created_at")
      .eq("user_id", userId)
      .eq("decision_id", decisionId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (error) {
      setClosedSummariesByDecisionId((p) => ({ ...p, [decisionId]: [] }));
      setClosedSummariesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
      return;
    }

    setClosedSummariesByDecisionId((p) => ({ ...p, [decisionId]: (data ?? []) as DecisionSummary[] }));
    setClosedSummariesLoadingByDecisionId((p) => ({ ...p, [decisionId]: false }));
  };

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
    setNoteComposerOpenByDecisionId((p) => ({ ...p, [decisionId]: false }));
    setNotesExpandedByDecisionId((p) => ({ ...p, [decisionId]: true }));
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

  // ✅ chat summary edit/save
  const startEditSummary = (s: DecisionSummary) => {
    setEditingSummaryId(s.id);
    setEditingSummaryDraft(s.summary_text ?? "");
    setExpandedSummary((p) => ({ ...p, [s.id]: true }));
  };
  const cancelEditSummary = () => {
    setEditingSummaryId(null);
    setEditingSummaryDraft("");
  };
  const saveEditSummary = async (decisionId: string, summaryId: string) => {
    if (!userId) return;

    const next = (editingSummaryDraft ?? "").trim();
    if (!next) {
      showToast({ message: "Summary can’t be empty." }, 2000);
      return;
    }

    const { error } = await supabase.from("decision_summaries").update({ summary_text: next }).eq("user_id", userId).eq("id", summaryId);

    if (error) {
      showToast({ message: `Couldn’t update summary: ${error.message}` }, 3500);
      return;
    }

    setEditingSummaryId(null);
    setEditingSummaryDraft("");
    showToast({ message: "Updated." }, 1400);
    void reloadSummaries(decisionId);
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

  useEffect(() => {
    if (!userId) return;
    if (tab !== "active") return;
    if (!openDecision?.id) return;

    void loadNotes(openDecision.id);

    const count = normalizeAttachments(openDecision.attachments).length;
    prevAttachmentCountRef.current[openDecision.id] = count;

    // ✅ review draft state init (no auto-set)
    const iso = openDecision.review_at;
    const dateStr = iso ? new Date(safeMs(iso) ?? Date.now()).toISOString().slice(0, 10) : "";
    setReviewCustomDateByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: dateStr }));
    setReviewPresetByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: iso ? "custom" : "none" }));

    // defaults for expand/hide (compact state)
    setNotesExpandedByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: false }));
    setFilesExpandedByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: false }));
    setReviewExpandedByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: false }));
    setSummariesExpandedByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: true }));

    // ✅ sharing init
    setSharingExpandedByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: false }));
    setShareComposerOpenByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: false }));
    setSharePermissionDraftByDecisionId((p) => (p[openDecision.id] != null ? p : { ...p, [openDecision.id]: "view" }));
    // pick a default household (first one you belong to)
    setShareTargetHouseholdByDecisionId((p) => {
      if (p[openDecision.id]) return p;
      const first = households[0]?.household_id ?? "";
      return { ...p, [openDecision.id]: first };
    });

    // load shares
    void loadDecisionShares(openDecision.id);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tab, openDecision?.id]);

  const filteredItems = useMemo(() => {
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
  const activeSnapshotLine = useMemo(() => {
    if (tab !== "active") return "";

    const count = filteredItems.length;
    const withReviewDate = filteredItems.filter((d) => !!d.review_at).length;
    const dueForReview = filteredItems.filter((d) => isReviewDue(d.review_at)).length;

    if (count <= 0) return "You have no active decisions right now.";

    const decisionWord = count === 1 ? "decision" : "decisions";
    const base = `You have ${count} active ${decisionWord}.`;

    if (dueForReview > 0) {
      const dueWord = dueForReview === 1 ? "is" : "are";
      return `${base} ${dueForReview} ${dueWord} due for review.`;
    }

    if (withReviewDate > 0) {
      const haveWord = withReviewDate === 1 ? "has" : "have";
      return `${base} ${withReviewDate} ${haveWord} review dates set.`;
    }

    return base;
  }, [filteredItems, tab]);

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
          review_at: null, // ✅ ensure no auto review date set on creation
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
        }),
        { scroll: false }
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

    // ✅ allow delete by RLS (shared editors may delete if allowed), but keep extra safety: only attempt by id
    const { data, error } = await supabase.from("decisions").delete().eq("id", d.id).select("id");
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

    const { error } = await supabase.from("decisions").update({ status: "chapter" }).eq("id", d.id);
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
      }),
      { scroll: false }
    );
  };

  const reopenDecision = async (d: Decision) => {
    if (!userId) return;

    setItems((p) => p.map((x) => (x.id === d.id ? { ...x, status: "open" } : x)));

    const { error } = await supabase.from("decisions").update({ status: "open" }).eq("id", d.id);
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
      }),
      { scroll: false }
    );
  };

  const setReviewAt = async (d: Decision, review_at: string | null) => {
    if (!userId) return;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at } : x)));

    const { error } = await supabase.from("decisions").update({ review_at }).eq("id", d.id);

    if (error) {
      showToast({ message: `Couldn’t update: ${error.message}` }, 3500);
      scheduleReload();
      return;
    }

    showToast({ message: review_at ? "Review scheduled." : "Review cleared." }, 1600);
  };

  const openAttachment = async (a: AttachmentMeta) => {
    try {
      const { data, error } = await supabase.storage.from("captures").createSignedUrl(a.path, 60 * 15);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "Couldn’t open file.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t open file." }, 3000);
    }
  };

  const filterCount = useMemo(() => {
    return (activeDomainId ? 1 : 0) + (activeConstellationId ? 1 : 0) + (hasReviewDateOnly ? 1 : 0) + (reviewDueOnly ? 1 : 0);
  }, [activeDomainId, activeConstellationId, hasReviewDateOnly, reviewDueOnly]);

  const sortIsActive = sortKey !== "newest";

  const DecisionRow = ({ d }: { d: Decision }) => (
    <div className="py-4 border-b border-zinc-100 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-zinc-900">{d.title}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Started {softWhen(d.created_at)}
            {d.review_at ? <> • Next review {softWhen(d.review_at)}</> : null}
            {d.user_id && userId && d.user_id !== userId ? <span className="ml-2">• Shared</span> : null}
          </div>
        </div>
        <div className="shrink-0">
          <TextAction
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
                }),
                { scroll: false }
              );
            }}
            title="Open"
          >
            Open
          </TextAction>
        </div>
      </div>
    </div>
  );

  const renderOpenDecision = (d: Decision) => {
    const ctx = splitContext(d.context);
    const capturedForChat = (ctx.captured || "").trim();
    const isAskPromoted = d.origin === "ask_promotion";

    const allAtt = normalizeAttachments(d.attachments) as AttachmentMeta[];
    const isWorking = workForId === d.id;

    const notes = notesByDecisionId[d.id] ?? [];
    const notesLoading = !!notesLoadingByDecisionId[d.id];
    const composerValue = noteDraftByDecisionId[d.id] ?? "";

    const noteComposerOpen = !!noteComposerOpenByDecisionId[d.id];
    const filesComposerOpen = !!filesComposerOpenByDecisionId[d.id];
    const reviewEditorOpen = !!reviewEditorOpenByDecisionId[d.id];

    const summariesHasAny = summaries.length > 0;
    const notesCount = notes.length;
    const filesCount = allAtt.length;
    const latestSummary = summaries[0] ?? null;
    const statusLabel = d.status === "chapter" ? "Closed" : d.status === "open" ? "Active" : d.status || "Active";
    const decisionReason = (ctx.captured || ctx.notes || "").trim();

    const summariesExpanded = !!summariesExpandedByDecisionId[d.id];
    const notesExpanded = !!notesExpandedByDecisionId[d.id];
    const filesExpanded = !!filesExpandedByDecisionId[d.id];
    const reviewExpanded = !!reviewExpandedByDecisionId[d.id];

    const preset = (reviewPresetByDecisionId[d.id] ?? (d.review_at ? "custom" : "none")) as ReviewPreset;
    const customDateStr =
      reviewCustomDateByDecisionId[d.id] ??
      (d.review_at ? new Date(safeMs(d.review_at) ?? Date.now()).toISOString().slice(0, 10) : "");

    const currentAttCount = allAtt.length;
    const prevAttCount = prevAttachmentCountRef.current[d.id] ?? currentAttCount;
    if (prevAttCount !== currentAttCount) {
      prevAttachmentCountRef.current[d.id] = currentAttCount;
      if (filesComposerOpen && currentAttCount > prevAttCount) {
        setFilesComposerOpenByDecisionId((p) => ({ ...p, [d.id]: false }));
      }
    }

    const closeChat = () => {
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
        }),
        { scroll: false }
      );
    };

    const SectionRow = (props: {
      title: string;
      meta?: string;
      count?: number;
      showPlus?: boolean;
      expanded?: boolean;
      onToggle?: () => void;
      onPlus?: () => void;
    }) => {
      const { title, meta, count, showPlus, expanded, onToggle, onPlus } = props;
      return (
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <div className="text-sm font-semibold text-zinc-900">{title}</div>
            {typeof count === "number" ? <div className="text-xs text-zinc-500">({count})</div> : null}
            {meta ? <div className="text-xs text-zinc-500 truncate">{meta}</div> : null}

            {showPlus ? (
              <button
                type="button"
                onClick={onPlus}
                className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6FAFB2]/30 focus-visible:ring-offset-2"
                title="Add"
                aria-label="Add"
              >
                +
              </button>
            ) : null}
          </div>

          <div className="shrink-0">
            {onToggle ? (
              <TextAction subtle onClick={onToggle} title={expanded ? "Hide" : "Expand"}>
                {expanded ? "Hide" : "Expand"}
              </TextAction>
            ) : null}
          </div>
        </div>
      );
    };

    const shares = sharesByDecisionId[d.id] ?? [];
    const sharesLoading = !!sharesLoadingByDecisionId[d.id];
    const sharingExpanded = !!sharingExpandedByDecisionId[d.id];
    const shareComposerOpen = !!shareComposerOpenByDecisionId[d.id];
    const shareNote = shareNoteDraftByDecisionId[d.id] ?? "";
    const shareTarget = shareTargetHouseholdByDecisionId[d.id] ?? "";
    const sharePerm = sharePermissionDraftByDecisionId[d.id] ?? "view";

    const sharedCount = shares.length;

    const availableHouseholds = households.filter((h) => !!h.household_id);
    const alreadyShared = new Set(shares.map((s) => s.household_id));
    const shareableHouseholds = availableHouseholds.filter((h) => !alreadyShared.has(h.household_id));

    const shareMeta = sharedCount > 0 ? "Visible to others you’ve shared with." : "Not shared.";

    return (
      <div
        ref={(el) => {
          cardRefs.current[d.id] = el;
        }}
        className="rounded-2xl bg-zinc-50 p-5 sm:p-6 shadow-sm"
      >
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
              {d.review_at ? <> • Next review {softWhen(d.review_at)}</> : null}
              {d.user_id && userId && d.user_id !== userId ? <span className="ml-2">• Shared</span> : null}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <TextAction
              subtle
              onClick={() => {
                setOpenId(null);
                setWorkForId(null);
                setConfirmDeleteForId(null);
                cancelEditNote();
                cancelEditSummary();
                router.push(
                  buildUrl("active", {
                    q: searchDebounced,
                    sort: sortKey,
                    domain: activeDomainId,
                    group: activeConstellationId,
                    hasReview: hasReviewDateOnly,
                    reviewDue: reviewDueOnly,
                  }),
                  { scroll: false }
                );
              }}
              title="Hide decision"
            >
              Hide
            </TextAction>
          </div>
        </div>

        {/* Durable decision record */}
        <div className="mt-4 rounded-2xl bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">{statusLabel}</span>
            {d.review_at ? (
              <span className="text-xs text-zinc-600">Next review {softWhen(d.review_at)}</span>
            ) : (
              <span className="text-xs text-zinc-500">No review date set</span>
            )}
          </div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Why this decision exists</div>
              <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                {decisionReason || "No rationale captured yet."}
              </div>
            </div>

            {summariesHasAny ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Durable reasoning</div>
                <div className="mt-1 text-sm text-zinc-800">{summaryHeadingFrom(latestSummary?.summary_text ?? "", d.title)}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {summaries.length === 1 ? "1 saved summary" : `${summaries.length} saved summaries`}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Sections */}
        <div className="mt-5 divide-y divide-zinc-100 rounded-2xl bg-white px-4">
          {/* ✅ Sharing */}
          <SectionRow
            title="Sharing"
            meta={shareMeta}
            count={sharedCount}
            showPlus={true}
            expanded={sharingExpanded}
            onToggle={() => {
              setSharingExpandedByDecisionId((p) => ({ ...p, [d.id]: !sharingExpanded }));
              if (!sharingExpanded) void loadDecisionShares(d.id);
            }}
            onPlus={() => {
              setShareComposerOpenByDecisionId((p) => ({ ...p, [d.id]: true }));
              setSharingExpandedByDecisionId((p) => ({ ...p, [d.id]: true }));
              void loadDecisionShares(d.id);

              // best default target if none set
              setShareTargetHouseholdByDecisionId((p) => {
                if (p[d.id]) return p;
                const first = shareableHouseholds[0]?.household_id ?? households[0]?.household_id ?? "";
                return { ...p, [d.id]: first };
              });
              setSharePermissionDraftByDecisionId((p) => ({ ...p, [d.id]: p[d.id] ?? "view" }));
            }}
          />

          {sharingExpanded ? (
            <div className="pb-4 space-y-3">
              {sharesLoading ? <div className="text-sm text-zinc-500">Loading sharing…</div> : null}

              {!sharesLoading && shares.length === 0 ? <div className="text-sm text-zinc-600">Not shared yet.</div> : null}

              {!sharesLoading && shares.length > 0 ? (
                <div className="divide-y divide-zinc-100 rounded-2xl bg-white">
                  {shares.map((s, idx) => {
                    const name =
                      (s.household_name && String(s.household_name)) ||
                      households.find((h) => h.household_id === s.household_id)?.name ||
                      null;

                    const perm = (String(s.permission ?? "view") as any) === "edit" ? "edit" : "view";
                    const stamp = s.created_at ? `Shared ${softWhen(s.created_at)}` : "Shared";

                    return (
                      <div key={`${s.household_id}-${idx}`} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-zinc-900 truncate">{name ? name : `Household ${shortId(s.household_id)}`}</div>
                            <div className="mt-1 text-xs text-zinc-500">{stamp}</div>
                            {s.note ? <div className="mt-2 text-sm text-zinc-700 whitespace-pre-wrap">{s.note}</div> : null}
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            <select
                              className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs text-zinc-700"
                              value={perm}
                              onChange={(e) => void updateSharePermission(d.id, s.household_id, (e.target.value as any) === "edit" ? "edit" : "view")}
                              title="Permission"
                            >
                              <option value="view">View</option>
                              <option value="edit">Edit</option>
                            </select>

                            <TextAction danger onClick={() => void unshareDecision(d.id, s.household_id)} title="Unshare">
                              Unshare
                            </TextAction>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {shareComposerOpen ? (
                <div className="rounded-2xl bg-white p-3 space-y-3">
                  <div className="text-sm font-semibold text-zinc-900">Share to a household</div>

                  {households.length === 0 ? (
                    <div className="text-sm text-zinc-600">No households found for your account.</div>
                  ) : shareableHouseholds.length === 0 ? (
                    <div className="text-sm text-zinc-600">Already shared to all your households.</div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                          value={shareTarget}
                          onChange={(e) => setShareTargetHouseholdByDecisionId((p) => ({ ...p, [d.id]: e.target.value }))}
                          title="Choose household"
                        >
                          {shareableHouseholds.map((h) => (
                            <option key={h.household_id} value={h.household_id}>
                              {h.name ? h.name : shortId(h.household_id)}
                            </option>
                          ))}
                        </select>

                        <select
                          className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                          value={sharePerm}
                          onChange={(e) =>
                            setSharePermissionDraftByDecisionId((p) => ({ ...p, [d.id]: (e.target.value as any) === "edit" ? "edit" : "view" }))
                          }
                          title="Permission"
                        >
                          <option value="view">View</option>
                          <option value="edit">Edit</option>
                        </select>
                      </div>

                      <textarea
                        value={shareNote}
                        onChange={(e) => setShareNoteDraftByDecisionId((p) => ({ ...p, [d.id]: e.target.value }))}
                        placeholder="Optional note…"
                        className="w-full min-h-[72px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <TextAction onClick={() => void shareDecision(d.id)} title="Share">
                          Share
                        </TextAction>
                        <TextAction
                          subtle
                          onClick={() => {
                            setShareComposerOpenByDecisionId((p) => ({ ...p, [d.id]: false }));
                            setShareNoteDraftByDecisionId((p) => ({ ...p, [d.id]: "" }));
                          }}
                          title="Close"
                        >
                          Close
                        </TextAction>
                      </div>

                      <div className="text-xs text-zinc-500">
                        View = they can read. Edit = they can update the decision and its related items (if your database policies allow).
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Chat summaries (only appear once at least one exists) */}
          {summariesHasAny ? (
            <>
              <SectionRow
                title="Chat summaries"
                count={summaries.length}
                showPlus={false}
                expanded={summariesExpanded}
                onToggle={() => setSummariesExpandedByDecisionId((p) => ({ ...p, [d.id]: !summariesExpanded }))}
              />

              {summariesExpanded ? (
                <div className="pb-4">
                  <div className="divide-y divide-zinc-100 rounded-2xl bg-white">
                    {summaries.map((s) => {
                      const one = summaryHeadingFrom(s.summary_text, d.title);
                      const open = !!expandedSummary[s.id];
                      const isEditing = editingSummaryId === s.id;

                      return (
                        <div key={s.id} className="py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                              <div className="mt-1 text-sm font-medium text-zinc-900 truncate">{renderInlineBold(one)}</div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1">
                              {!isEditing ? (
                                <>
                                  <TextAction subtle onClick={() => startEditSummary(s)} title="Edit summary">
                                    Edit
                                  </TextAction>
                                  <TextAction
                                    subtle
                                    onClick={() => setExpandedSummary((p) => ({ ...p, [s.id]: !open }))}
                                    title="Expand"
                                  >
                                    {open ? "Hide" : "Expand"}
                                  </TextAction>
                                </>
                              ) : (
                                <>
                                  <TextAction onClick={() => void saveEditSummary(d.id, s.id)} title="Save summary edits">
                                    Save
                                  </TextAction>
                                  <TextAction subtle onClick={cancelEditSummary} title="Cancel">
                                    Cancel
                                  </TextAction>
                                </>
                              )}
                            </div>
                          </div>

                          {open ? (
                            <div className="mt-3 space-y-2">
                              {!isEditing ? (
                                renderSummaryBody(s.summary_text)
                              ) : (
                                <textarea
                                  value={editingSummaryDraft}
                                  onChange={(e) => setEditingSummaryDraft(e.target.value)}
                                  className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                                />
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {/* Notes (always present) */}
          <SectionRow
            title="Notes"
            count={notesCount}
            showPlus
            expanded={notesExpanded}
            onToggle={() => {
              setNotesExpandedByDecisionId((p) => ({ ...p, [d.id]: !notesExpanded }));
              if (!notesExpanded) void loadNotes(d.id);
            }}
            onPlus={() => {
              setNoteComposerOpenByDecisionId((p) => ({ ...p, [d.id]: true }));
              setNotesExpandedByDecisionId((p) => ({ ...p, [d.id]: true }));
              void loadNotes(d.id);
            }}
          />

          {notesExpanded ? (
            <div className="pb-4 space-y-3">
              {noteComposerOpen ? (
                <>
                  <textarea
                    value={composerValue}
                    onChange={(e) => setNoteDraftByDecisionId((p) => ({ ...p, [d.id]: e.target.value }))}
                    placeholder="Add a note…"
                    className="w-full min-h-[96px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
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
                    <TextAction onClick={() => void addNote(d.id)} title="Save note">
                      Save note
                    </TextAction>
                    <TextAction
                      subtle
                      onClick={() => {
                        setNoteComposerOpenByDecisionId((p) => ({ ...p, [d.id]: false }));
                        setNoteDraftByDecisionId((p) => ({ ...p, [d.id]: "" }));
                      }}
                      title="Cancel"
                    >
                      Cancel
                    </TextAction>
                  </div>
                </>
              ) : null}

              {notesLoading ? <div className="text-sm text-zinc-500">Loading notes…</div> : null}

              {!notesLoading && notes.length === 0 ? <div className="text-sm text-zinc-600">No notes yet.</div> : null}

              {!notesLoading && notes.length > 0 ? (
                <div className="divide-y divide-zinc-100 rounded-2xl bg-white">
                  {notes.map((n) => {
                    const isEditing = editingNoteId === n.id;
                    const stamp = softWhenDateTime(n.created_at);
                    const edited = n.updated_at ? ` • edited ${softWhenDateTime(n.updated_at)}` : "";

                    return (
                      <div key={n.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs text-zinc-500">
                              {stamp}
                              {edited}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1">
                            {!isEditing ? (
                              <>
                                <TextAction subtle onClick={() => startEditNote(n)} title="Edit note">
                                  Edit
                                </TextAction>
                                <TextAction danger onClick={() => void deleteNote(d.id, n.id)} title="Delete note">
                                  Delete
                                </TextAction>
                              </>
                            ) : (
                              <>
                                <TextAction onClick={() => void saveEditNote(d.id, n.id)} title="Save changes">
                                  Save
                                </TextAction>
                                <TextAction subtle onClick={cancelEditNote} title="Cancel edit">
                                  Cancel
                                </TextAction>
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
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Files (always present) */}
          <SectionRow
            title="Files"
            count={filesCount}
            showPlus
            expanded={filesExpanded}
            onToggle={() => setFilesExpandedByDecisionId((p) => ({ ...p, [d.id]: !filesExpanded }))}
            onPlus={() => {
              setFilesComposerOpenByDecisionId((p) => ({ ...p, [d.id]: true }));
              setFilesExpandedByDecisionId((p) => ({ ...p, [d.id]: true }));
            }}
          />

          {filesExpanded ? (
            <div className="pb-4 space-y-3">
              {filesCount > 0 ? (
                <div className="rounded-2xl bg-white px-4 py-3">
                  <ul className="space-y-2">
                    {allAtt.map((a, idx) => (
                      <li key={`${a.path}-${idx}`} className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => void openAttachment(a)}
                          className="min-w-0 truncate text-sm text-zinc-700 hover:underline underline-offset-4"
                          title="Open file"
                        >
                          {a.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-zinc-600">No files yet.</div>
              )}

              {filesComposerOpen ? (
                <div className="rounded-2xl bg-white p-3">
                  {userId ? (
                    <AttachmentsBlock
                      userId={userId}
                      decisionId={d.id}
                      title={allAtt.length ? `Add files (currently ${allAtt.length})` : "Add files"}
                      bucket="captures"
                      initial={allAtt}
                    />
                  ) : (
                    <div className="text-sm text-zinc-600">Files unavailable.</div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs text-zinc-500">Tip: after an upload completes, this panel will close automatically.</div>
                    <TextAction subtle onClick={() => setFilesComposerOpenByDecisionId((p) => ({ ...p, [d.id]: false }))} title="Close">
                      Close
                    </TextAction>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Review (always present) */}
          <SectionRow
            title="Review"
            meta={""}
            showPlus
            expanded={reviewExpanded}
            onToggle={() => setReviewExpandedByDecisionId((p) => ({ ...p, [d.id]: !reviewExpanded }))}
            onPlus={() => {
              setReviewEditorOpenByDecisionId((p) => ({ ...p, [d.id]: true }));
              setReviewExpandedByDecisionId((p) => ({ ...p, [d.id]: true }));

              // init draft (no auto set)
              setReviewPresetByDecisionId((p) => ({ ...p, [d.id]: d.review_at ? "custom" : "none" }));
              setReviewCustomDateByDecisionId((p) => ({
                ...p,
                [d.id]: d.review_at ? new Date(safeMs(d.review_at) ?? Date.now()).toISOString().slice(0, 10) : p[d.id] ?? "",
              }));
            }}
          />

          {reviewExpanded ? (
            <div className="pb-4 space-y-3">
              <div className="text-sm text-zinc-700">{d.review_at ? `Next review: ${softWhen(d.review_at)}` : "No review date set."}</div>

              {reviewEditorOpen ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                      value={preset}
                      onChange={(e) => {
                        const next = e.target.value as ReviewPreset;
                        setReviewPresetByDecisionId((p) => ({ ...p, [d.id]: next }));

                        // do not auto-apply; user must press "Set review date"
                        if (next !== "custom" && next !== "none") return;
                        if (next === "none") return;

                        const fallback = d.review_at ? new Date(safeMs(d.review_at) ?? Date.now()).toISOString().slice(0, 10) : "";
                        setReviewCustomDateByDecisionId((p) => ({ ...p, [d.id]: p[d.id] ?? fallback }));
                      }}
                      title="Choose a review time"
                    >
                      <option value="none">No review date</option>
                      <option value="oneDay">1 day</option>
                      <option value="oneWeek">1 week</option>
                      <option value="oneMonth">1 month</option>
                      <option value="threeMonths">3 months</option>
                      <option value="sixMonths">6 months</option>
                      <option value="oneYear">1 year</option>
                      <option value="custom">Custom…</option>
                    </select>

                    {preset === "custom" ? (
                      <input
                        type="date"
                        className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                        value={customDateStr}
                        onChange={(e) => setReviewCustomDateByDecisionId((p) => ({ ...p, [d.id]: e.target.value }))}
                        title="Pick a date"
                      />
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <TextAction
                      onClick={() => {
                        if (preset === "none") {
                          void setReviewAt(d, null);
                          setReviewEditorOpenByDecisionId((p) => ({ ...p, [d.id]: false }));
                          return;
                        }

                        if (preset === "custom") {
                          const iso = isoFromDateInput(customDateStr);
                          if (!iso) {
                            showToast({ message: "Pick a valid date." }, 2200);
                            return;
                          }
                          void setReviewAt(d, iso);
                          setReviewEditorOpenByDecisionId((p) => ({ ...p, [d.id]: false }));
                          return;
                        }

                        const iso = reviewIsoFromPreset(preset);
                        if (!iso) {
                          showToast({ message: "Choose a review option." }, 2200);
                          return;
                        }
                        void setReviewAt(d, iso);
                        setReviewEditorOpenByDecisionId((p) => ({ ...p, [d.id]: false }));
                      }}
                      title="Set review date"
                    >
                      Set review date
                    </TextAction>

                    <TextAction
                      danger
                      onClick={() => {
                        setReviewPresetByDecisionId((p) => ({ ...p, [d.id]: "none" }));
                        setReviewCustomDateByDecisionId((p) => ({ ...p, [d.id]: "" }));
                        void setReviewAt(d, null);
                      }}
                      title="Delete review date"
                    >
                      Delete review date
                    </TextAction>

                    <TextAction subtle onClick={() => setReviewEditorOpenByDecisionId((p) => ({ ...p, [d.id]: false }))} title="Close">
                      Close
                    </TextAction>
                  </div>
                </div>
              ) : null}

              {!reviewEditorOpen ? (
                <TextAction
                  subtle
                  onClick={() => {
                    setReviewEditorOpenByDecisionId((p) => ({ ...p, [d.id]: true }));
                    setReviewPresetByDecisionId((p) => ({ ...p, [d.id]: d.review_at ? "custom" : "none" }));
                    setReviewCustomDateByDecisionId((p) => ({
                      ...p,
                      [d.id]: d.review_at ? new Date(safeMs(d.review_at) ?? Date.now()).toISOString().slice(0, 10) : p[d.id] ?? "",
                    }));
                  }}
                  title="Edit review date"
                >
                  Set review date
                </TextAction>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Conversation (secondary) */}
        <div className="mt-4 rounded-2xl bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-zinc-900">Conversation</div>
              <div className="text-xs text-zinc-500">
                {isAskPromoted ? "Continue the same thought here." : "Optional workspace for thinking this through."}
              </div>
            </div>
            {!isWorking ? (
              <TextAction
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
                    }),
                    { scroll: false }
                  );
                }}
                title={isAskPromoted ? "Continue conversation" : "Open conversation"}
              >
                {isAskPromoted ? "Continue conversation" : "Open conversation"}
              </TextAction>
            ) : (
              <TextAction onClick={closeChat} title="Close conversation">
                Close conversation
              </TextAction>
            )}
          </div>

          {isWorking ? (
            <div id="work-through-panel" className="mt-4 rounded-2xl bg-zinc-50 p-3 sm:p-4">
              <ConversationPanel
                decisionId={d.id}
                decisionTitle={d.title}
                askedText={capturedForChat || ""}
                frame={{ decision_statement: capturedForChat || d.title }}
                autoFocusToken={1}
                autoStartToken={1}
                continuationFromAsk={isAskPromoted}
                onClose={() => {}}
                onSummarySaved={() => void reloadSummaries(d.id)}
              />
            </div>
          ) : null}
        </div>
        {/* Bottom actions */}
        {confirmDeleteForId === d.id ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-zinc-100 px-4 py-3">
            <div className="text-sm text-zinc-900">
              Delete this decision? <span className="opacity-70">This can’t be undone.</span>
            </div>
            <div className="flex items-center gap-2">
              <TextAction subtle onClick={() => setConfirmDeleteForId(null)}>
                Cancel
              </TextAction>
              <button
                type="button"
                onClick={() => void performDelete(d)}
                className="inline-flex select-none items-center justify-center rounded-full bg-zinc-900 px-4 py-2 text-sm text-white transition hover:bg-zinc-800"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
            <TextAction onClick={() => void closeDecision(d)} title="Move to Closed">
              Move to Closed
            </TextAction>
            <TextAction danger onClick={() => setConfirmDeleteForId(d.id)} title="Delete decision">
              Delete
            </TextAction>
          </div>
        )}
      </div>
    );
  };

  const shouldShowStatusLine = statusLine && (statusLine.startsWith("Error:") || statusLine === "Not signed in." || statusLine === "Loading…");

  const ActiveFilterChips = () => {
    const any = filterCount > 0 || sortIsActive || !!(searchDebounced ?? "").trim();
    if (!any) return null;

    const areaName = activeDomainId ? domains.find((d) => d.id === activeDomainId)?.name ?? "Area" : "";
    const groupName = activeConstellationId ? constellations.find((c) => c.id === activeConstellationId)?.name ?? "Group" : "";

    const ChipPill = ({ label, onClear }: { label: string; onClear: () => void }) => (
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200/70"
        title="Clear"
      >
        <span className="truncate max-w-[260px]">{label}</span>
        <span className="text-zinc-500">×</span>
      </button>
    );

    return (
      <div className="flex flex-wrap items-center gap-2">
        {(searchDebounced ?? "").trim() ? <ChipPill label={`Search: ${(searchDebounced ?? "").trim()}`} onClear={() => setSearchText("")} /> : null}
        {sortIsActive ? <ChipPill label={`Sort: ${sortLabel[sortKey]}`} onClear={() => setSortKey("newest")} /> : null}
        {activeDomainId ? <ChipPill label={`Area: ${areaName}`} onClear={() => setActiveDomainId(null)} /> : null}
        {activeConstellationId ? <ChipPill label={`Group: ${groupName}`} onClear={() => setActiveConstellationId(null)} /> : null}
        {hasReviewDateOnly ? <ChipPill label="Has review date" onClear={() => setHasReviewDateOnly(false)} /> : null}
        {reviewDueOnly ? <ChipPill label="Review due" onClear={() => setReviewDueOnly(false)} /> : null}

        {filterCount > 0 || sortIsActive || (searchDebounced ?? "").trim() ? (
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
            className="ml-1 inline-flex items-center rounded-full bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-200/70"
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
        <div className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
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

            {hasReviewDateOnly || reviewDueOnly ? (
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
        <div className="absolute right-0 z-50 mt-2 w-[260px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
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
                  "w-full rounded-2xl px-3 py-2 text-left text-sm transition",
                  sortKey === k ? "bg-zinc-100 text-zinc-900" : "bg-white hover:bg-zinc-50 text-zinc-700",
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
      {/* ✅ wider layout so cards fill the page better */}
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 sm:px-6 lg:px-8">
        <SegTabs
          tab={tab}
          onTab={(t) => {
            if (t === "new") router.push(buildUrl("new"), { scroll: false });
            if (t === "active")
              router.push(
                buildUrl("active", {
                  q: searchDebounced,
                  sort: sortKey,
                  domain: activeDomainId,
                  group: activeConstellationId,
                  hasReview: hasReviewDateOnly,
                  reviewDue: reviewDueOnly,
                }),
                { scroll: false }
              );
            if (t === "closed")
              router.push(
                buildUrl("closed", {
                  q: searchDebounced,
                  sort: sortKey,
                  domain: activeDomainId,
                  group: activeConstellationId,
                  hasReview: hasReviewDateOnly,
                  reviewDue: reviewDueOnly,
                }),
                { scroll: false }
              );
          }}
        />

        {/* Page 1: New Decision */}
        {tab === "new" ? (
          <div className="space-y-5">
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
                  <div className="rounded-2xl bg-zinc-50 px-4 py-3">
                    <div className="text-xs font-semibold text-zinc-500">What I’m hearing</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">{frameDraft.what_im_hearing}</div>
                  </div>
                ) : null}

                <div className="space-y-3">
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
                        <TextAction subtle onClick={() => setNewStep("edit")} title="Edit the statement">
                          Edit
                        </TextAction>
                      </>
                    ) : (
                      <>
                        <PrimaryActionButton disabled={creatingNew} onClick={() => void saveFramedDecision()} title="Save to Active Decisions">
                          {creatingNew ? "Saving…" : "Save to Active"}
                        </PrimaryActionButton>
                        <TextAction subtle onClick={() => setNewStep("confirm")} title="Done editing">
                          Done
                        </TextAction>
                      </>
                    )}

                    <TextAction
                      subtle
                      onClick={() => {
                        setFrameDraft(null);
                        setNewStep("input");
                      }}
                      title="Start over"
                    >
                      Start over
                    </TextAction>
                  </div>
                </div>
              </div>
            ) : null}

            {newStep === "input" ? (
              <div className="flex flex-wrap items-center gap-3">
                <PrimaryActionButton disabled={framingBusy || creatingNew} onClick={() => void requestFrame()} title="Clarify this decision">
                  {framingBusy ? "Clarifying…" : "Next"}
                </PrimaryActionButton>

                <TextAction
                  subtle
                  onClick={() =>
                    router.push(
                      buildUrl("active", {
                        q: searchDebounced,
                        sort: sortKey,
                        domain: activeDomainId,
                        group: activeConstellationId,
                        hasReview: hasReviewDateOnly,
                        reviewDue: reviewDueOnly,
                      }),
                      { scroll: false }
                    )
                  }
                  title="Go to Active Decisions"
                >
                  Go to Active
                </TextAction>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Page 2: Active Decisions */}
        {tab === "active" ? (
          <div className="space-y-4">
            <div className="text-sm text-zinc-600">{activeSnapshotLine}</div>

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

            <ActiveFilterChips />

            {shouldShowStatusLine ? <div className="text-xs text-zinc-500">{statusLine}</div> : null}

            {filteredItems.length === 0 ? (
              <div className="space-y-2 pt-2">
                <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                <div className="text-sm text-zinc-600">This space stays ready for anything worth thinking through.</div>
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
                        <TextAction subtle onClick={() => setShowAll((v) => !v)}>
                          {showAll ? "Show less" : "Show all"}
                        </TextAction>
                        {!showAll ? (
                          <div className="text-xs text-zinc-500">
                            Showing {DEFAULT_LIMIT} of {others.length}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="divide-y divide-zinc-100">
                    {visibleOthers.map((d) => (
                      <DecisionRow key={d.id} d={d} />
                    ))}
                  </div>

                  {showAll && hasServerMore ? (
                    <div className="flex items-center justify-center pt-2">
                      <TextAction onClick={loadMore} title="Load more decisions">
                        Load more
                      </TextAction>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Page 3: Closed Decisions */}
        {tab === "closed" ? (
          <div className="space-y-4">
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

            <ActiveFilterChips />

            {shouldShowStatusLine ? <div className="text-xs text-zinc-500">{statusLine}</div> : null}

            {filteredItems.length === 0 ? <div className="text-sm text-zinc-600 pt-2">Closed decisions will collect here over time.</div> : null}

            {filteredItems.length > 0 ? (
              <div className="divide-y divide-zinc-100">
                {filteredItems.map((d) => {
                  const isOpen = !!expandedClosed[d.id];
                  const notes = notesByDecisionId[d.id] ?? [];
                  const notesLoading = !!notesLoadingByDecisionId[d.id];
                  const closedSummaries = closedSummariesByDecisionId[d.id] ?? [];
                  const closedSummariesLoading = !!closedSummariesLoadingByDecisionId[d.id];
                  const captured = splitContext(d.context).captured;

                  return (
                    <div key={d.id} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold text-zinc-900">{d.title}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            Started {softWhen(d.created_at)}
                            {d.user_id && userId && d.user_id !== userId ? <span className="ml-2">• Shared</span> : null}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <TextAction
                            subtle
                            onClick={() => {
                              setExpandedClosed((p) => {
                                const nextOpen = !p[d.id];
                                if (nextOpen) {
                                  void loadNotes(d.id);
                                  void loadClosedSummaries(d.id);
                                }
                                return { ...p, [d.id]: nextOpen };
                              });
                            }}
                            title={isOpen ? "Hide details" : "Show details"}
                          >
                            {isOpen ? "Hide details" : "Show details"}
                          </TextAction>

                          <TextAction onClick={() => void reopenDecision(d)} title="Re-open this decision">
                            Re-open
                          </TextAction>
                        </div>
                      </div>

                      {isOpen ? (
                        <div className="mt-4 space-y-5">
                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-zinc-900">Captured</div>
                            {captured ? (
                              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{captured}</div>
                            ) : d.context ? (
                              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{d.context}</div>
                            ) : (
                              <div className="text-sm text-zinc-600">No captured text.</div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-zinc-900">Notes</div>

                            {notesLoading ? (
                              <div className="text-sm text-zinc-500">Loading notes…</div>
                            ) : notes.length === 0 ? (
                              <div className="text-sm text-zinc-600">No notes yet.</div>
                            ) : (
                              <div className="divide-y divide-zinc-100 rounded-2xl bg-white">
                                {notes.map((n) => (
                                  <div key={n.id} className="px-4 py-3">
                                    <div className="text-xs text-zinc-500">
                                      {softWhenDateTime(n.created_at)}
                                      {n.updated_at ? ` • edited ${softWhenDateTime(n.updated_at)}` : ""}
                                    </div>
                                    <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{n.body}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-zinc-900">Files</div>
                            {normalizeAttachments(d.attachments).length === 0 ? (
                              <div className="text-sm text-zinc-600">No files yet.</div>
                            ) : (
                              <ul className="list-disc pl-5 text-sm text-zinc-700 space-y-1">
                                {normalizeAttachments(d.attachments).map((a, idx) => (
                                  <li key={`${a.path}-${idx}`} className="truncate">
                                    <button
                                      type="button"
                                      onClick={() => void openAttachment(a)}
                                      className="hover:underline underline-offset-4"
                                      title="Open file"
                                    >
                                      {a.name}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div className="text-sm font-semibold text-zinc-900">Review</div>
                            <div className="text-sm text-zinc-700">{d.review_at ? `Next review: ${softWhen(d.review_at)}` : "No review date."}</div>
                          </div>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-zinc-900">Chat summaries</div>
                              <div className="text-xs text-zinc-500">Saved summaries attached to this decision.</div>
                            </div>

                            {closedSummariesLoading ? (
                              <div className="text-sm text-zinc-500">Loading summaries…</div>
                            ) : closedSummaries.length === 0 ? (
                              <div className="text-sm text-zinc-600">No summaries yet.</div>
                            ) : (
                              <div className="divide-y divide-zinc-100 rounded-2xl bg-white">
                                {closedSummaries.map((s) => {
                                  const heading = summaryHeadingFrom(s.summary_text, d.title);
                                  const open = !!expandedSummary[s.id];

                                  return (
                                    <div key={s.id} className="px-4 py-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                                          <div className="mt-1 text-sm font-medium text-zinc-900 truncate">{renderInlineBold(heading)}</div>
                                        </div>

                                        <div className="shrink-0">
                                          <TextAction subtle onClick={() => setExpandedSummary((p) => ({ ...p, [s.id]: !open }))}>
                                            {open ? "Hide" : "Expand"}
                                          </TextAction>
                                        </div>
                                      </div>

                                      {open ? <div className="mt-3 space-y-2">{renderSummaryBody(s.summary_text)}</div> : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {hasServerMore ? (
              <div className="flex items-center justify-center pt-2">
                <TextAction onClick={loadMore} title="Load more decisions">
                  Load more
                </TextAction>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
