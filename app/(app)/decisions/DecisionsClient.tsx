// app/(app)/decisions/DecisionsClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, CardContent, Chip, useToast } from "@/components/ui";
import { Page } from "@/components/Page";

type Decision = {
  id: string;
  inbox_item_id: string | null;
  title: string;
  context: string | null;
  status: string;
  decided_at: string | null;
  review_at: string | null;
  created_at: string;

  user_reasoning: string | null;
  confidence_level: number | null;
  ai_summary: string | null;
  ai_json: any | null;

  pinned: boolean;
  reviewed_at: string | null;

  review_notes: string | null;
  review_history: any[];
};

type ReviewEntry = { at: string; note: string };

function formatLocal(dt: string | null) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString();
}

function confidenceLabel(n: number | null) {
  if (n === 1) return "Low";
  if (n === 2) return "Medium";
  if (n === 3) return "High";
  return null;
}

function suggestedLabel(v: any) {
  if (v === "decide_now") return "Decide now";
  if (v === "delay") return "Delay";
  if (v === "gather_info") return "Gather info";
  return null;
}

function typeLabel(v: any) {
  if (v === "spending") return "Spending";
  if (v === "time") return "Time";
  if (v === "relationship") return "Relationship";
  if (v === "health") return "Health";
  if (v === "other") return "Other";
  return null;
}

function stakesLabel(v: any) {
  if (v === "low") return "Low stakes";
  if (v === "medium") return "Medium stakes";
  if (v === "high") return "High stakes";
  return null;
}

function horizonLabel(v: any) {
  if (v === "today") return "Today";
  if (v === "this_week") return "This week";
  if (v === "ongoing") return "Ongoing";
  return null;
}

function reversibleLabel(v: any) {
  if (v === true) return "Reversible";
  if (v === false) return "Hard to undo";
  return null;
}

function getAI(ai_json: any | null) {
  if (!ai_json) return null;
  if (typeof ai_json === "string") {
    try {
      return JSON.parse(ai_json);
    } catch {
      return null;
    }
  }
  if (typeof ai_json === "object") return ai_json;
  return null;
}

function normalizeHistory(input: any): ReviewEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const at = typeof (x as any).at === "string" ? (x as any).at : null;
      const note = typeof (x as any).note === "string" ? (x as any).note : null;
      if (!at || !note) return null;
      return { at, note } as ReviewEntry;
    })
    .filter(Boolean) as ReviewEntry[];
}

type TypeFilter = "all" | "spending" | "time" | "relationship" | "health" | "other";
type StakesFilter = "all" | "high";
type SuggestedFilter = "all" | "decide_now" | "delay" | "gather_info";
type TabMode = "all" | "review" | "drafts";

const DEFAULT_REVIEW_BUMP_DAYS = 30;
const REVIEW_PRESETS_DAYS = [14, 30, 60] as const;

function isoNowPlusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function parseMs(dt: string | null) {
  if (!dt) return null;
  const ms = Date.parse(dt);
  return Number.isNaN(ms) ? null : ms;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export default function DecisionsClient() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [statusLine, setStatusLine] = useState("Loading...");
  const [rows, setRows] = useState<Decision[]>([]);
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showAIJson, setShowAIJson] = useState(false);

  // filters
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [stakesFilter, setStakesFilter] = useState<StakesFilter>("all");
  const [suggestedFilter, setSuggestedFilter] = useState<SuggestedFilter>("all");
  const [onlyWithAI, setOnlyWithAI] = useState(false);
  const [needsAttention, setNeedsAttention] = useState(false);

  // tabs
  const [tab, setTab] = useState<TabMode>("all");

  // bulk selection (Review tab)
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // review drafts
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});

  // review cadence UI (per decision)
  const [showCustomNextReview, setShowCustomNextReview] = useState<Record<string, boolean>>({});
  const [customNextReviewDays, setCustomNextReviewDays] = useState<Record<string, string>>({});

  // draft finishing inputs
  const [draftReason, setDraftReason] = useState<Record<string, string>>({});
  const [draftConfidence, setDraftConfidence] = useState<Record<string, number>>({});
  const [draftSaving, setDraftSaving] = useState<Record<string, boolean>>({});
  const [draftAiLoading, setDraftAiLoading] = useState<Record<string, boolean>>({});
  const [draftAiError, setDraftAiError] = useState<Record<string, string>>({});

  // ✅ URL -> tab sync (so /decisions?tab=review selects Review)
  useEffect(() => {
    const urlTab = (searchParams.get("tab") || "all") as TabMode;
    if (urlTab === "all" || urlTab === "review" || urlTab === "drafts") setTab(urlTab);
  }, [searchParams]);

  const setTabAndUrl = (next: TabMode) => {
    setTab(next);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next === "all") sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    router.replace(qs ? `/decisions?${qs}` : "/decisions");
  };

  const load = async () => {
    setStatusLine("Loading...");

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setStatusLine(`Auth error: ${authError.message}`);
      return;
    }

    const user = auth.user;
    if (!user) {
      setStatusLine("Not signed in. Go to /auth/login");
      return;
    }

    setEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("decisions")
      .select(
        "id,inbox_item_id,title,context,status,decided_at,review_at,created_at,user_reasoning,confidence_level,ai_summary,ai_json,pinned,reviewed_at,review_notes,review_history"
      )
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    setRows((data ?? []) as Decision[]);
    setStatusLine(`Loaded ${data?.length ?? 0} decision(s).`);

    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      for (const r of data ?? []) if (prev[r.id]) next[r.id] = true;
      return next;
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decidedCount = useMemo(() => rows.filter((d) => d.status === "decided").length, [rows]);
  const draftCount = useMemo(() => rows.filter((d) => d.status === "draft").length, [rows]);

  const toggleOne = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  const expandAll = (list: Decision[]) => {
    const next: Record<string, boolean> = {};
    for (const d of list) next[d.id] = true;
    setExpanded(next);
  };
  const collapseAll = () => setExpanded({});
  const clearFilters = () => {
    setTypeFilter("all");
    setStakesFilter("all");
    setSuggestedFilter("all");
    setOnlyWithAI(false);
    setNeedsAttention(false);
  };

  // ---------- review logic ----------
  const nowMs = Date.now();

  const isDueForReview = (d: Decision) => {
    if (!d.review_at) return false;
    const dueMs = Date.parse(d.review_at);
    if (Number.isNaN(dueMs)) return false;
    if (dueMs > nowMs) return false;

    if (d.reviewed_at) {
      const reviewedMs = Date.parse(d.reviewed_at);
      if (!Number.isNaN(reviewedMs) && reviewedMs >= dueMs) return false;
    }
    return true;
  };

  const isDueSoon = (d: Decision, hours = 48) => {
    if (!d.review_at) return false;
    const dueMs = Date.parse(d.review_at);
    if (Number.isNaN(dueMs)) return false;
    const soonWindowMs = hours * 60 * 60 * 1000;
    return dueMs > nowMs && dueMs <= nowMs + soonWindowMs;
  };

  const dueForReviewCount = useMemo(() => rows.filter(isDueForReview).length, [rows]);
  const reviewList = useMemo(() => rows.filter((d) => d.review_at != null), [rows]);

  const reviewSorted = useMemo(() => {
    const copy = [...reviewList];
    copy.sort((a, b) => {
      const ta = a.review_at ? Date.parse(a.review_at) : Number.MAX_SAFE_INTEGER;
      const tb = b.review_at ? Date.parse(b.review_at) : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });
    return copy;
  }, [reviewList]);

  const overdueCount = useMemo(() => reviewSorted.filter((d) => isDueForReview(d)).length, [reviewSorted]);
  const dueSoonCount = useMemo(
    () => reviewSorted.filter((d) => !isDueForReview(d) && isDueSoon(d)).length,
    [reviewSorted]
  );
  const scheduledCount = useMemo(() => reviewSorted.length, [reviewSorted]);

  // ---------- selection ----------
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const toggleSelected = (id: string) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const clearSelection = () => setSelected({});

  // ---------- actions ----------
  const togglePinned = async (id: string, next: boolean) => {
    const { error } = await supabase.from("decisions").update({ pinned: next }).eq("id", id);
    if (error) {
      setStatusLine(`Pin failed: ${error.message}`);
      return;
    }
    setRows((prev) => prev.map((d) => (d.id === id ? { ...d, pinned: next } : d)));
  };

  /**
   * ✅ Mark reviewed now.
   * - If nextDays is provided: set review_at = now + nextDays (always)
   * - Else: if overdue, bump review_at by DEFAULT_REVIEW_BUMP_DAYS
   * Undo restores BOTH reviewed_at and review_at.
   */
  const markReviewedNow = async (id: string, nextDays?: number) => {
    const row = rows.find((x) => x.id === id);
    if (!row) return;

    const prevReviewedAt = row.reviewed_at ?? null;
    const prevReviewAt = row.review_at ?? null;

    const nowIso = new Date().toISOString();

    const reviewAtMs = parseMs(row.review_at);
    const isOverdue = reviewAtMs != null && reviewAtMs <= Date.now();

    const shouldSetExplicit = typeof nextDays === "number" && Number.isFinite(nextDays) && nextDays > 0;
    const explicitDays = shouldSetExplicit ? clampInt(nextDays, 1, 3650) : null;

    const shouldBumpDefault = !shouldSetExplicit && isOverdue;
    const nextReviewAt = shouldSetExplicit
      ? isoNowPlusDays(explicitDays!)
      : shouldBumpDefault
      ? isoNowPlusDays(DEFAULT_REVIEW_BUMP_DAYS)
      : prevReviewAt;

    const payload: any = { reviewed_at: nowIso };
    if (shouldSetExplicit || shouldBumpDefault) payload.review_at = nextReviewAt;

    const { error } = await supabase.from("decisions").update(payload).eq("id", id);
    if (error) {
      setStatusLine(`Mark reviewed failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((d) => (d.id === id ? { ...d, reviewed_at: nowIso, review_at: nextReviewAt } : d)));

    const msg = shouldSetExplicit
      ? `Reviewed ✅ (next in ${explicitDays}d)`
      : shouldBumpDefault
      ? `Reviewed ✅ (next in ${DEFAULT_REVIEW_BUMP_DAYS}d)`
      : "Reviewed ✅";

    setStatusLine(msg);

    showToast(
      {
        message: msg,
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing review...");

          const { error: undoErr } = await supabase
            .from("decisions")
            .update({ reviewed_at: prevReviewedAt, review_at: prevReviewAt })
            .eq("id", id);

          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            return;
          }

          setRows((prev) =>
            prev.map((d) => (d.id === id ? { ...d, reviewed_at: prevReviewedAt, review_at: prevReviewAt } : d))
          );
          setStatusLine("Undone ✅");
        },
      },
      8000
    );
  };

  const setReviewLaterMinutes = async (id: string, minsFromNow: number) => {
    const dt = new Date(Date.now() + minsFromNow * 60 * 1000).toISOString();
    const { error } = await supabase.from("decisions").update({ review_at: dt }).eq("id", id);
    if (error) {
      setStatusLine(`Review later failed: ${error.message}`);
      return;
    }
    setRows((prev) => prev.map((d) => (d.id === id ? { ...d, review_at: dt } : d)));
    setStatusLine("Scheduled ✅");
  };

  const reviewIn1Day = async (id: string) => setReviewLaterMinutes(id, 60 * 24 * 1);
  const reviewIn3Days = async (id: string) => setReviewLaterMinutes(id, 60 * 24 * 3);
  const reviewIn7Days = async (id: string) => setReviewLaterMinutes(id, 60 * 24 * 7);
  const reviewIn30Days = async (id: string) => setReviewLaterMinutes(id, 60 * 24 * 30);

  const clearReviewAt = async (id: string) => {
    const { error } = await supabase.from("decisions").update({ review_at: null }).eq("id", id);
    if (error) {
      setStatusLine(`Clear review failed: ${error.message}`);
      return;
    }
    setRows((prev) => prev.map((d) => (d.id === id ? { ...d, review_at: null } : d)));
    setStatusLine("Cleared ✅");
  };

  /**
   * ✅ Save review note:
   * - Adds note to history
   * - Sets review_notes = latest
   * - Sets reviewed_at = now
   * - If nextDays is provided: set review_at = now + nextDays (always)
   * - Else: if currently overdue, bumps review_at forward by DEFAULT_REVIEW_BUMP_DAYS
   * Undo restores reviewed_at, review_at, review_notes, review_history.
   */
  const saveReviewNote = async (d: Decision, nextDays?: number) => {
    const note = (reviewDraft[d.id] ?? "").trim();
    if (!note) return;

    const prevReviewedAt = d.reviewed_at ?? null;
    const prevReviewAt = d.review_at ?? null;
    const prevReviewNotes = d.review_notes ?? null;
    const prevHistory = normalizeHistory(d.review_history);

    const at = new Date().toISOString();
    const nextHistory: ReviewEntry[] = [...prevHistory, { at, note }];
    const nextReviewNotes = note;

    const reviewAtMs = parseMs(d.review_at);
    const isOverdue = reviewAtMs != null && reviewAtMs <= Date.now();

    const shouldSetExplicit = typeof nextDays === "number" && Number.isFinite(nextDays) && nextDays > 0;
    const explicitDays = shouldSetExplicit ? clampInt(nextDays, 1, 3650) : null;

    const shouldBumpDefault = !shouldSetExplicit && isOverdue;
    const nextReviewAt = shouldSetExplicit
      ? isoNowPlusDays(explicitDays!)
      : shouldBumpDefault
      ? isoNowPlusDays(DEFAULT_REVIEW_BUMP_DAYS)
      : prevReviewAt;

    const payload: any = {
      review_history: nextHistory,
      review_notes: nextReviewNotes,
      reviewed_at: at,
    };
    if (shouldSetExplicit || shouldBumpDefault) payload.review_at = nextReviewAt;

    const { error } = await supabase.from("decisions").update(payload).eq("id", d.id);

    if (error) {
      setStatusLine(`Save review note failed: ${error.message}`);
      return;
    }

    setRows((prev) =>
      prev.map((x) =>
        x.id === d.id
          ? {
              ...x,
              review_history: nextHistory,
              review_notes: nextReviewNotes,
              reviewed_at: at,
              review_at: nextReviewAt,
            }
          : x
      )
    );

    setReviewDraft((prev) => {
      const copy = { ...prev };
      delete copy[d.id];
      return copy;
    });

    setShowCustomNextReview((prev) => ({ ...prev, [d.id]: false }));
    setCustomNextReviewDays((prev) => {
      const copy = { ...prev };
      delete copy[d.id];
      return copy;
    });

    const msg = shouldSetExplicit
      ? `Review note saved ✅ (next in ${explicitDays}d)`
      : shouldBumpDefault
      ? `Review note saved ✅ (next in ${DEFAULT_REVIEW_BUMP_DAYS}d)`
      : "Review note saved ✅";

    setStatusLine(msg);

    showToast(
      {
        message: msg,
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing review note...");

          const { error: undoErr } = await supabase
            .from("decisions")
            .update({
              reviewed_at: prevReviewedAt,
              review_at: prevReviewAt,
              review_notes: prevReviewNotes,
              review_history: prevHistory,
            })
            .eq("id", d.id);

          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            return;
          }

          setRows((prev) =>
            prev.map((x) =>
              x.id === d.id
                ? {
                    ...x,
                    reviewed_at: prevReviewedAt,
                    review_at: prevReviewAt,
                    review_notes: prevReviewNotes,
                    review_history: prevHistory,
                  }
                : x
            )
          );

          setStatusLine("Undone ✅");
        },
      },
      8000
    );
  };

  /**
   * ✅ Bulk mark reviewed (default behavior):
   * - Sets reviewed_at=now for all selected
   * - For any that are overdue, also bumps review_at forward by DEFAULT_REVIEW_BUMP_DAYS
   * Undo restores reviewed_at + review_at per-id.
   */
  const bulkMarkReviewed = async () => {
    const ids = selectedIds;
    if (ids.length === 0) return;

    const prevReviewedMap: Record<string, string | null> = {};
    const prevReviewAtMap: Record<string, string | null> = {};

    const nowIso = new Date().toISOString();
    const bumpIso = isoNowPlusDays(DEFAULT_REVIEW_BUMP_DAYS);

    const overdueIds: string[] = [];
    for (const d of rows) {
      if (!ids.includes(d.id)) continue;
      prevReviewedMap[d.id] = d.reviewed_at ?? null;
      prevReviewAtMap[d.id] = d.review_at ?? null;

      const ms = parseMs(d.review_at);
      if (ms != null && ms <= Date.now()) overdueIds.push(d.id);
    }

    setStatusLine("Marking selected as reviewed...");

    // 1) reviewed_at for all
    const { error: baseErr } = await supabase.from("decisions").update({ reviewed_at: nowIso }).in("id", ids);
    if (baseErr) {
      setStatusLine(`Bulk reviewed failed: ${baseErr.message}`);
      return;
    }

    // 2) bump review_at for overdue subset
    if (overdueIds.length > 0) {
      const { error: bumpErr } = await supabase.from("decisions").update({ review_at: bumpIso }).in("id", overdueIds);
      if (bumpErr) {
        setStatusLine(`Reviewed ✅ but bump failed: ${bumpErr.message}`);
        setRows((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, reviewed_at: nowIso } : d)));
        clearSelection();
        return;
      }
    }

    setRows((prev) =>
      prev.map((d) =>
        ids.includes(d.id)
          ? { ...d, reviewed_at: nowIso, review_at: overdueIds.includes(d.id) ? bumpIso : d.review_at }
          : d
      )
    );

    const bumpedN = overdueIds.length;
    setStatusLine(bumpedN > 0 ? `Reviewed ${ids.length} ✅ (bumped ${bumpedN})` : `Reviewed ${ids.length} ✅`);

    showToast(
      {
        message: bumpedN > 0 ? `Reviewed ${ids.length} ✅ (bumped ${bumpedN})` : `Reviewed ${ids.length} ✅`,
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing bulk review...");

          const tasks = ids.map((id) =>
            supabase
              .from("decisions")
              .update({ reviewed_at: prevReviewedMap[id] ?? null, review_at: prevReviewAtMap[id] ?? null })
              .eq("id", id)
          );
          const results = await Promise.all(tasks);
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            setStatusLine(`Undo failed: ${failed.error.message}`);
            return;
          }

          setRows((prev) =>
            prev.map((d) =>
              ids.includes(d.id)
                ? { ...d, reviewed_at: prevReviewedMap[d.id] ?? null, review_at: prevReviewAtMap[d.id] ?? null }
                : d
            )
          );

          setStatusLine("Undone ✅");
        },
      },
      8000
    );

    clearSelection();
  };

  /**
   * ✅ Bulk mark reviewed with explicit cadence:
   * - Sets reviewed_at=now for all selected
   * - Sets review_at=now+days for ALL selected (always)
   * Undo restores reviewed_at + review_at per-id.
   */
  const bulkMarkReviewedWithCadence = async (days: number) => {
    const ids = selectedIds;
    if (ids.length === 0) return;

    const safeDays = clampInt(days, 1, 3650);

    const prevReviewedMap: Record<string, string | null> = {};
    const prevReviewAtMap: Record<string, string | null> = {};

    for (const d of rows) {
      if (!ids.includes(d.id)) continue;
      prevReviewedMap[d.id] = d.reviewed_at ?? null;
      prevReviewAtMap[d.id] = d.review_at ?? null;
    }

    const nowIso = new Date().toISOString();
    const nextReviewIso = isoNowPlusDays(safeDays);

    setStatusLine(`Marking selected as reviewed (next in ${safeDays}d)...`);

    const { error } = await supabase
      .from("decisions")
      .update({ reviewed_at: nowIso, review_at: nextReviewIso })
      .in("id", ids);

    if (error) {
      setStatusLine(`Bulk reviewed failed: ${error.message}`);
      return;
    }

    setRows((prev) =>
      prev.map((d) => (ids.includes(d.id) ? { ...d, reviewed_at: nowIso, review_at: nextReviewIso } : d))
    );

    setStatusLine(`Reviewed ${ids.length} ✅ (next in ${safeDays}d)`);

    showToast(
      {
        message: `Reviewed ${ids.length} ✅ (next in ${safeDays}d)`,
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing bulk review...");

          const tasks = ids.map((id) =>
            supabase
              .from("decisions")
              .update({ reviewed_at: prevReviewedMap[id] ?? null, review_at: prevReviewAtMap[id] ?? null })
              .eq("id", id)
          );

          const results = await Promise.all(tasks);
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            setStatusLine(`Undo failed: ${failed.error.message}`);
            return;
          }

          setRows((prev) =>
            prev.map((d) =>
              ids.includes(d.id)
                ? { ...d, reviewed_at: prevReviewedMap[d.id] ?? null, review_at: prevReviewAtMap[d.id] ?? null }
                : d
            )
          );

          setStatusLine("Undone ✅");
        },
      },
      8000
    );

    clearSelection();
  };

  const bulkScheduleMinutes = async (mins: number) => {
    const ids = selectedIds;
    if (ids.length === 0) return;

    setStatusLine("Scheduling reviews...");
    const iso = new Date(Date.now() + mins * 60 * 1000).toISOString();

    const { error } = await supabase.from("decisions").update({ review_at: iso }).in("id", ids);
    if (error) {
      setStatusLine(`Bulk schedule failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, review_at: iso } : d)));
    setStatusLine(`Scheduled ${ids.length} ✅`);
    clearSelection();
  };

  const bulkClearReviewAt = async () => {
    const ids = selectedIds;
    if (ids.length === 0) return;

    setStatusLine("Clearing review dates...");
    const { error } = await supabase.from("decisions").update({ review_at: null }).in("id", ids);
    if (error) {
      setStatusLine(`Bulk clear failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, review_at: null } : d)));
    setStatusLine(`Cleared ${ids.length} ✅`);
    clearSelection();
  };

  // ---------- draft finish logic ----------
  const runAiForDraft = async (d: Decision) => {
    setDraftAiError((prev) => ({ ...prev, [d.id]: "" }));
    setDraftAiLoading((prev) => ({ ...prev, [d.id]: true }));

    try {
      const res = await fetch("/api/analyze-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: d.title,
          body: d.context,
          type: "draft",
          severity: 2,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "AI analysis failed");

      const analysis = json.analysis;

      const { error: upErr } = await supabase
        .from("decisions")
        .update({
          ai_summary: analysis?.reasoning ?? null,
          ai_json: analysis ?? null,
        })
        .eq("id", d.id);

      if (upErr) {
        setDraftAiError((prev) => ({ ...prev, [d.id]: upErr.message }));
        return;
      }

      setRows((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, ai_summary: analysis?.reasoning ?? null, ai_json: analysis ?? null } : x))
      );
    } catch (e: any) {
      setDraftAiError((prev) => ({ ...prev, [d.id]: e?.message ?? "AI analysis failed" }));
    } finally {
      setDraftAiLoading((prev) => ({ ...prev, [d.id]: false }));
    }
  };

  const finishDraftDecision = async (d: Decision) => {
    setDraftSaving((prev) => ({ ...prev, [d.id]: true }));
    setStatusLine("Saving decision...");

    const reason = (draftReason[d.id] ?? "").trim() || null;
    const conf = draftConfidence[d.id] ?? null;
    const nowIso = new Date().toISOString();

    const prevRow = rows.find((x) => x.id === d.id);
    const prevStatus = prevRow?.status ?? d.status;
    const prevDecidedAt = prevRow?.decided_at ?? d.decided_at;

    const { error } = await supabase
      .from("decisions")
      .update({
        status: "decided",
        decided_at: nowIso,
        user_reasoning: reason,
        confidence_level: conf,
      })
      .eq("id", d.id);

    if (error) {
      setStatusLine(`Finish failed: ${error.message}`);
      setDraftSaving((prev) => ({ ...prev, [d.id]: false }));
      return;
    }

    let inboxClosedOk = false;
    if (d.inbox_item_id) {
      const { error: inboxErr } = await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("id", d.inbox_item_id);

      if (inboxErr) {
        setStatusLine(`Decided ✅ but couldn't close inbox item: ${inboxErr.message}`);
      } else {
        inboxClosedOk = true;
      }
    }

    setRows((prev) =>
      prev.map((x) =>
        x.id === d.id
          ? {
              ...x,
              status: "decided",
              decided_at: nowIso,
              user_reasoning: reason,
              confidence_level: conf,
            }
          : x
      )
    );

    setStatusLine(inboxClosedOk ? "Decided ✅ (Inbox closed)" : "Decided ✅");

    showToast(
      {
        message: inboxClosedOk ? "Decided ✅ (Inbox closed)" : "Decided ✅",
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing...");

          const { error: undoErr } = await supabase.from("decisions").update({ status: "draft", decided_at: null }).eq("id", d.id);

          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            return;
          }

          if (d.inbox_item_id && inboxClosedOk) {
            const { error: reopenErr } = await supabase
              .from("decision_inbox")
              .update({ status: "open", snoozed_until: null })
              .eq("id", d.inbox_item_id);

            if (reopenErr) {
              setStatusLine(`Undo partial (reopen inbox failed): ${reopenErr.message}`);
              return;
            }
          }

          setRows((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: prevStatus, decided_at: prevDecidedAt ?? null } : x)));
          setStatusLine("Undone ✅");
        },
      },
      8000
    );

    setDraftSaving((prev) => ({ ...prev, [d.id]: false }));
  };

  // ---------- filtering ----------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((d) => {
      if (tab === "review") {
        if (!isDueForReview(d)) return false;
      }
      if (tab === "drafts") {
        if (d.status !== "draft") return false;
      }

      const ai = getAI(d.ai_json);
      const aiType = ai?.decision_type ?? null;
      const aiStakes = ai?.stakes ?? null;
      const aiSuggested = ai?.suggested_default ?? null;

      if (q) {
        const hay = [
          d.title,
          d.context ?? "",
          d.user_reasoning ?? "",
          d.ai_summary ?? "",
          d.review_notes ?? "",
          d.review_history ? JSON.stringify(d.review_history) : "",
        ]
          .join("\n")
          .toLowerCase();

        if (!hay.includes(q)) return false;
      }

      if (onlyWithAI && !ai) return false;
      if (typeFilter !== "all") if (!aiType || aiType !== typeFilter) return false;
      if (stakesFilter === "high") if (aiStakes !== "high") return false;
      if (suggestedFilter !== "all") if (aiSuggested !== suggestedFilter) return false;

      if (needsAttention) {
        const attention = aiStakes === "high" || aiSuggested === "gather_info" || aiSuggested === "delay";
        if (!attention) return false;
      }

      return true;
    });
  }, [rows, query, onlyWithAI, typeFilter, stakesFilter, suggestedFilter, needsAttention, tab]);

  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (typeFilter !== "all") n++;
    if (stakesFilter !== "all") n++;
    if (suggestedFilter !== "all") n++;
    if (onlyWithAI) n++;
    if (needsAttention) n++;
    return n;
  }, [typeFilter, stakesFilter, suggestedFilter, onlyWithAI, needsAttention]);

  const headerSubtitle = (
    <div className="space-y-1">
      {email && <div>Signed in as: {email}</div>}
      <div className="text-zinc-700">
        <strong>{decidedCount}</strong> handled • <strong>{draftCount}</strong> drafts • {statusLine}
      </div>
      <div>You’re building a trail of clarity — one decision at a time.</div>
    </div>
  );

  const statusDotColor = (s: string) => {
    if (s === "decided") return "green";
    if (s === "draft") return "#71717a";
    return "gray";
  };

  const NextReviewControls = ({
    decisionId,
    onPickDays,
    compact = false,
  }: {
    decisionId: string;
    onPickDays: (days: number) => void;
    compact?: boolean;
  }) => {
    const showCustom = !!showCustomNextReview[decisionId];
    const customStr = customNextReviewDays[decisionId] ?? "";

    return (
      <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
        {!compact && <div className="text-xs text-zinc-500">Next review</div>}

        <div className="flex flex-wrap items-center gap-2">
          {REVIEW_PRESETS_DAYS.map((days) => (
            <Button
              key={`${decisionId}-nr-${days}`}
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onPickDays(days);
              }}
              title={`Mark reviewed and set next review in ${days} days`}
            >
              {days}d
            </Button>
          ))}

          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setShowCustomNextReview((prev) => ({ ...prev, [decisionId]: !prev[decisionId] }));
            }}
            title="Pick a custom number of days"
          >
            Custom…
          </Button>
        </div>

        {showCustom && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={customStr}
              onChange={(e) => setCustomNextReviewDays((prev) => ({ ...prev, [decisionId]: e.target.value }))}
              placeholder="e.g. 5"
              inputMode="numeric"
              className="w-[140px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(customStr);
                  if (Number.isFinite(n) && n > 0) onPickDays(clampInt(n, 1, 3650));
                }
              }}
            />

            <div className="text-sm text-zinc-600">days</div>

            <Button
              onClick={(e) => {
                e.stopPropagation();
                const n = Number(customStr);
                if (!Number.isFinite(n) || n <= 0) return;
                onPickDays(clampInt(n, 1, 3650));
              }}
              disabled={!customStr.trim()}
              title="Apply custom cadence"
            >
              Set
            </Button>

            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                setShowCustomNextReview((prev) => ({ ...prev, [decisionId]: false }));
              }}
            >
              Cancel
            </Button>

            <div className="text-xs text-zinc-500">Max 3650 days.</div>
          </div>
        )}
      </div>
    );
  };

  // ---------- UI ----------
  return (
    <Page
      title="Decisions"
      subtitle={headerSubtitle}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={load}>Refresh</Button>
          <Button variant="secondary" onClick={() => expandAll(filtered)}>
            Expand filtered
          </Button>
          <Button variant="secondary" onClick={collapseAll}>
            Collapse all
          </Button>

          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <input type="checkbox" checked={showAIJson} onChange={(e) => setShowAIJson(e.target.checked)} />
            Show AI JSON
          </label>
        </div>
      }
    >
      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Chip active={tab === "all"} onClick={() => setTabAndUrl("all")}>
          All
        </Chip>

        <Chip active={tab === "drafts"} onClick={() => setTabAndUrl("drafts")} title="Promoted items waiting to be decided">
          Drafts {draftCount > 0 ? `(${draftCount})` : ""}
        </Chip>

        <Chip active={tab === "review"} onClick={() => setTabAndUrl("review")} title="Decisions due for review">
          Review {dueForReviewCount > 0 ? `(${dueForReviewCount})` : ""}
        </Chip>

        {tab === "review" && dueForReviewCount === 0 && <div className="self-center text-sm text-zinc-600">Nothing is due right now 🎉</div>}

        {tab === "drafts" && draftCount === 0 && <div className="self-center text-sm text-zinc-600">No drafts right now 🎉</div>}
      </div>

      {/* Review summary + bulk controls */}
      <Card className="bg-zinc-50">
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">Scheduled: {scheduledCount}</Badge>
                <Badge variant="warning">Overdue: {overdueCount}</Badge>
                <Badge variant="muted">Due soon: {dueSoonCount}</Badge>
                {tab === "review" && selectedIds.length > 0 && <Badge variant="muted">Selected: {selectedIds.length}</Badge>}
              </div>

              {tab === "review" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const next: Record<string, boolean> = {};
                      for (const d of filtered) next[d.id] = true;
                      setSelected(next);
                    }}
                  >
                    Select all (filtered)
                  </Button>
                  <Button variant="secondary" onClick={clearSelection} disabled={selectedIds.length === 0}>
                    Clear selection
                  </Button>
                </div>
              )}
            </div>

            {tab === "review" && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={bulkMarkReviewed} disabled={selectedIds.length === 0}>
                  ✅ Mark reviewed (bump overdue +{DEFAULT_REVIEW_BUMP_DAYS}d)
                </Button>

                {REVIEW_PRESETS_DAYS.map((days) => (
                  <Button
                    key={`bulk-reviewed-${days}`}
                    variant="secondary"
                    onClick={() => bulkMarkReviewedWithCadence(days)}
                    disabled={selectedIds.length === 0}
                    title={`Marks reviewed now and sets next review to ${days} days for all selected`}
                  >
                    ✅ Reviewed +{days}d
                  </Button>
                ))}

                <Button variant="secondary" onClick={() => bulkScheduleMinutes(60 * 24 * 3)} disabled={selectedIds.length === 0}>
                  ⏳ Review in 3 days
                </Button>

                <Button variant="secondary" onClick={() => bulkScheduleMinutes(60 * 24 * 7)} disabled={selectedIds.length === 0}>
                  ⏳ Review in 7 days
                </Button>

                <Button variant="secondary" onClick={() => bulkScheduleMinutes(60 * 24 * 30)} disabled={selectedIds.length === 0}>
                  ⏳ Review in 30 days
                </Button>

                <Button variant="secondary" onClick={bulkClearReviewAt} disabled={selectedIds.length === 0}>
                  🧹 Clear review date
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "review" ? "Search reviews..." : tab === "drafts" ? "Search drafts..." : "Search decisions..."}
          className="min-w-[260px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {/* Filters */}
      <Card className="bg-zinc-50">
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="text-sm text-zinc-600">Filters {activeFiltersCount > 0 ? `• ${activeFiltersCount} active` : ""}</div>

              <Button variant="secondary" onClick={clearFilters} disabled={activeFiltersCount === 0}>
                Clear
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip active={needsAttention} onClick={() => setNeedsAttention((v) => !v)} title="High stakes OR gather info OR delay">
                Needs attention
              </Chip>

              <Chip active={onlyWithAI} onClick={() => setOnlyWithAI((v) => !v)} title="Hide items without AI analysis">
                Only with AI
              </Chip>

              {(
                [
                  ["all", "All types"],
                  ["spending", "Spending"],
                  ["time", "Time"],
                  ["relationship", "Relationship"],
                  ["health", "Health"],
                  ["other", "Other"],
                ] as Array<[TypeFilter, string]>
              ).map(([val, label]) => (
                <Chip key={`type-${val}`} active={typeFilter === val} onClick={() => setTypeFilter(val)}>
                  {label}
                </Chip>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip
                active={stakesFilter === "high"}
                onClick={() => setStakesFilter((v) => (v === "high" ? "all" : "high"))}
                title="AI stakes = high"
              >
                High stakes
              </Chip>

              {(
                [
                  ["all", "All defaults"],
                  ["decide_now", "AI: Decide now"],
                  ["gather_info", "AI: Gather info"],
                  ["delay", "AI: Delay"],
                ] as Array<[SuggestedFilter, string]>
              ).map(([val, label]) => (
                <Chip key={`suggested-${val}`} active={suggestedFilter === val} onClick={() => setSuggestedFilter(val)}>
                  {label}
                </Chip>
              ))}
            </div>

            <div className="text-xs text-zinc-500">
              Showing <strong>{filtered.length}</strong> of {rows.length}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="grid gap-3">
        {filtered.map((d) => {
          const isOpen = !!expanded[d.id];
          const conf = confidenceLabel(d.confidence_level);

          const ai = getAI(d.ai_json);
          const suggested = suggestedLabel(ai?.suggested_default ?? null);
          const type = typeLabel(ai?.decision_type ?? null);
          const stakes = stakesLabel(ai?.stakes ?? null);
          const horizon = horizonLabel(ai?.time_horizon ?? null);
          const reversible = reversibleLabel(typeof ai?.reversible === "boolean" ? ai.reversible : null);

          const keyQuestions: string[] = Array.isArray(ai?.key_questions) ? ai.key_questions : [];

          const due = isDueForReview(d);
          const dueSoon = !due && isDueSoon(d);

          const history = normalizeHistory(d.review_history);

          const isDraft = d.status === "draft";
          const saving = !!draftSaving[d.id];
          const aiLoad = !!draftAiLoading[d.id];
          const aiErr = draftAiError[d.id];

          return (
            <Card
              key={d.id}
              className={
                isDraft
                  ? "border-zinc-200 bg-zinc-50"
                  : due
                  ? "border-amber-200 bg-amber-50"
                  : dueSoon
                  ? "border-yellow-200 bg-yellow-50"
                  : "bg-white"
              }
            >
              <CardContent>
                {tab === "review" && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                      <input checked={!!selected[d.id]} onChange={() => toggleSelected(d.id)} type="checkbox" />
                      Select
                    </label>

                    <div className="text-xs text-zinc-500">
                      review_at: {formatLocal(d.review_at)} • reviewed_at: {formatLocal(d.reviewed_at)}
                    </div>
                  </div>
                )}

                {/* ✅ IMPORTANT: this is a DIV now (not a button) to avoid nested button hydration errors */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleOne(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") toggleOne(d.id);
                  }}
                  className="w-full cursor-pointer select-none bg-transparent p-0 text-left"
                  title={isOpen ? "Collapse" : "Expand"}
                  style={{ border: "none" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        title={d.status}
                        className="mt-2 inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          background: statusDotColor(d.status),
                          opacity: 0.75,
                        }}
                      />

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base">
                            {d.pinned ? "⭐ " : ""}
                            {d.title}
                          </strong>

                          {isDraft && <Badge variant="muted">Draft</Badge>}
                          {due && <Badge variant="warning">Due for review</Badge>}
                          {dueSoon && <Badge variant="muted">Due soon</Badge>}
                          {conf && <Badge variant="muted">Confidence: {conf}</Badge>}
                          {suggested && <Badge variant="muted">AI: {suggested}</Badge>}
                          {isDraft && d.inbox_item_id && <Badge variant="muted">Linked to Inbox</Badge>}

                          {/* One-click review link (only when due) */}
                          {!isDraft && due && (
                            <Button
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/decisions/${d.id}/review`);
                              }}
                              title="Open the review form"
                            >
                              Review
                            </Button>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-zinc-500">
                          Decided: {formatLocal(d.decided_at)} • Created: {formatLocal(d.created_at)}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-zinc-500">{isOpen ? "▾" : "▸"}</div>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 grid gap-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinned(d.id, !d.pinned);
                        }}
                      >
                        {d.pinned ? "⭐ Pinned" : "☆ Pin"}
                      </Button>

                      {!isDraft && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            markReviewedNow(d.id);
                          }}
                          title={`Marks reviewed now; if overdue, bumps next review +${DEFAULT_REVIEW_BUMP_DAYS} days`}
                        >
                          ✅ Reviewed
                        </Button>
                      )}

                      <Button variant="secondary" onClick={() => reviewIn1Day(d.id)}>
                        ⏳ Review in 1 day
                      </Button>
                      <Button variant="secondary" onClick={() => reviewIn3Days(d.id)}>
                        ⏳ Review in 3 days
                      </Button>
                      <Button variant="secondary" onClick={() => reviewIn7Days(d.id)}>
                        ⏳ Review in 7 days
                      </Button>
                      <Button variant="secondary" onClick={() => reviewIn30Days(d.id)}>
                        ⏳ Review in 30 days
                      </Button>

                      <Button variant="secondary" onClick={() => clearReviewAt(d.id)}>
                        🧹 Clear review
                      </Button>
                    </div>

                    {/* ✅ New: pick next review cadence right here */}
                    {!isDraft && (
                      <Card className="bg-white">
                        <CardContent>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold">Set next review</div>
                              <div className="text-xs text-zinc-500">Marks reviewed now and schedules the next check-in.</div>
                            </div>

                            <NextReviewControls
                              decisionId={d.id}
                              onPickDays={(days) => {
                                markReviewedNow(d.id, days);
                              }}
                              compact
                            />
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="text-xs text-zinc-500">
                      review_at: {formatLocal(d.review_at)} • reviewed_at: {formatLocal(d.reviewed_at)}
                    </div>

                    {(type || stakes || horizon || reversible) && (
                      <div className="flex flex-wrap gap-2">
                        {type && <Badge variant="muted">Type: {type}</Badge>}
                        {stakes && <Badge variant="muted">{stakes}</Badge>}
                        {horizon && <Badge variant="muted">Horizon: {horizon}</Badge>}
                        {reversible && <Badge variant="muted">{reversible}</Badge>}
                      </div>
                    )}

                    {d.context && (
                      <Card className="bg-white">
                        <CardContent>
                          <div className="mb-2 text-xs text-zinc-500">Context</div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.context}</div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Draft finish UI */}
                    {isDraft && (
                      <Card className="border-zinc-200 bg-white">
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold">Finish this decision</div>
                                <div className="text-xs text-zinc-500">
                                  Add your reasoning + confidence, optionally run AI, then mark decided.
                                  {d.inbox_item_id ? " This will also close the linked Inbox item." : ""}
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="secondary"
                                  onClick={() => runAiForDraft(d)}
                                  disabled={aiLoad}
                                  title="Runs /api/analyze-decision and stores ai_summary + ai_json"
                                >
                                  {aiLoad ? "Analyzing..." : d.ai_json ? "Re-analyze with AI" : "Analyze with AI"}
                                </Button>

                                <Button onClick={() => finishDraftDecision(d)} disabled={saving} title="Sets status=decided + decided_at">
                                  {saving ? "Saving..." : "Decide Now ✅"}
                                </Button>
                              </div>
                            </div>

                            {aiErr && <div className="text-xs text-red-700">AI error: {aiErr}</div>}

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">How confident do you feel?</div>

                              <div className="flex flex-wrap gap-4">
                                {[1, 2, 3].map((level) => (
                                  <label
                                    key={level}
                                    className={`flex cursor-pointer items-center gap-2 text-sm ${
                                      draftConfidence[d.id] === level ? "opacity-100" : "opacity-80"
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`draft-confidence-${d.id}`}
                                      checked={draftConfidence[d.id] === level}
                                      onChange={() =>
                                        setDraftConfidence((prev) => ({
                                          ...prev,
                                          [d.id]: level,
                                        }))
                                      }
                                    />
                                    {level === 1 ? "Low" : level === 2 ? "Medium" : "High"}
                                  </label>
                                ))}
                              </div>

                              <textarea
                                placeholder="Why did you decide this? (optional)"
                                value={draftReason[d.id] ?? d.user_reasoning ?? ""}
                                onChange={(e) =>
                                  setDraftReason((prev) => ({
                                    ...prev,
                                    [d.id]: e.target.value,
                                  }))
                                }
                                className="w-full min-h-[70px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {d.user_reasoning && !isDraft && (
                      <Card className="bg-zinc-50">
                        <CardContent>
                          <div className="mb-2 text-xs text-zinc-500">Your reasoning</div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.user_reasoning}</div>
                        </CardContent>
                      </Card>
                    )}

                    {d.ai_summary && (
                      <Card className="border-sky-200 bg-sky-50">
                        <CardContent>
                          <div className="mb-2 text-xs text-zinc-500">AI analysis</div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.ai_summary}</div>
                        </CardContent>
                      </Card>
                    )}

                    {keyQuestions.length > 0 && (
                      <Card className="bg-white">
                        <CardContent>
                          <div className="mb-2 text-xs text-zinc-500">Key questions to sanity-check</div>
                          <ul className="list-disc pl-5 text-sm text-zinc-800">
                            {keyQuestions.map((q, idx) => (
                              <li key={`${d.id}-kq-${idx}`} className="mb-1">
                                {q}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {/* Review notes */}
                    <Card className="bg-zinc-50">
                      <CardContent>
                        <div className="mb-2 text-xs text-zinc-500">Review notes</div>

                        {d.review_notes ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.review_notes}</div>
                        ) : (
                          <div className="text-sm text-zinc-500">No review notes yet.</div>
                        )}

                        <div className="mt-3 text-xs text-zinc-500">Add a new note (saved into history + marks reviewed)</div>

                        <textarea
                          value={reviewDraft[d.id] ?? ""}
                          onChange={(e) => setReviewDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
                          placeholder="e.g. New info: vet quote came in lower, okay to proceed."
                          className="mt-2 w-full min-h-[70px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                        />

                        <div className="mt-3 flex flex-wrap items-start gap-3">
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={() => saveReviewNote(d)} disabled={!(reviewDraft[d.id] ?? "").trim()}>
                              💾 Save review note
                            </Button>

                            <Button
                              variant="secondary"
                              onClick={() =>
                                setReviewDraft((prev) => {
                                  const copy = { ...prev };
                                  delete copy[d.id];
                                  return copy;
                                })
                              }
                              disabled={!(reviewDraft[d.id] ?? "").trim()}
                            >
                              Clear draft
                            </Button>
                          </div>

                          {/* ✅ New: optionally set next review while saving note */}
                          {!isDraft && (
                            <div className="min-w-[260px]">
                              <NextReviewControls
                                decisionId={d.id}
                                onPickDays={(days) => {
                                  saveReviewNote(d, days);
                                }}
                              />
                              <div className="mt-1 text-xs text-zinc-500">
                                Optional — if not set, overdue bumps +{DEFAULT_REVIEW_BUMP_DAYS}d.
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {history.length > 0 && (
                      <Card className="bg-white">
                        <CardContent>
                          <div className="mb-2 text-xs text-zinc-500">Review history</div>
                          <div className="grid gap-3">
                            {history
                              .slice()
                              .reverse()
                              .map((h, idx) => (
                                <div key={`${d.id}-rh-${idx}`} className="text-sm">
                                  <div className="text-xs text-zinc-500">{formatLocal(h.at)}</div>
                                  <div className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-800">{h.note}</div>
                                </div>
                              ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {showAIJson && d.ai_json && (
                      <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-3 text-xs text-zinc-100">{JSON.stringify(d.ai_json, null, 2)}</pre>
                    )}

                    <div className="text-xs text-zinc-500">status: {d.status}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-sm text-zinc-600">
            {tab === "review" ? "No reviews due." : tab === "drafts" ? "No drafts found." : "No decisions found."}
          </div>
        )}
      </div>
    </Page>
  );
}
