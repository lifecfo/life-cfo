"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, CardContent, Chip, useToast } from "@/components/ui";
import { Page } from "@/components/Page";

type Decision = {
  id: string;
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
      const at = typeof x.at === "string" ? x.at : null;
      const note = typeof x.note === "string" ? x.note : null;
      if (!at || !note) return null;
      return { at, note } as ReviewEntry;
    })
    .filter(Boolean) as ReviewEntry[];
}

type TypeFilter = "all" | "spending" | "time" | "relationship" | "health" | "other";
type StakesFilter = "all" | "high";
type SuggestedFilter = "all" | "decide_now" | "delay" | "gather_info";
type TabMode = "all" | "review";

export default function DecisionsPage() {
  const { showToast } = useToast();

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
        "id,title,context,status,decided_at,review_at,created_at,user_reasoning,confidence_level,ai_summary,ai_json,pinned,reviewed_at,review_notes,review_history"
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

  const reviewList = useMemo(() => rows.filter((d) => d.review_at != null && d.status !== "draft"), [rows]);

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

  const markReviewedNow = async (id: string) => {
    const prevReviewedAt = rows.find((x) => x.id === id)?.reviewed_at ?? null;
    const nowIso = new Date().toISOString();

    const { error } = await supabase.from("decisions").update({ reviewed_at: nowIso }).eq("id", id);
    if (error) {
      setStatusLine(`Mark reviewed failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((d) => (d.id === id ? { ...d, reviewed_at: nowIso } : d)));
    setStatusLine("Reviewed ✅");

    showToast(
      {
        message: "Reviewed ✅",
        undoLabel: "Undo",
        onUndo: async () => {
          const { error: undoErr } = await supabase.from("decisions").update({ reviewed_at: prevReviewedAt }).eq("id", id);
          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            return;
          }
          setRows((prev) => prev.map((d) => (d.id === id ? { ...d, reviewed_at: prevReviewedAt } : d)));
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

  const saveReviewNote = async (d: Decision) => {
    const note = (reviewDraft[d.id] ?? "").trim();
    if (!note) return;

    const at = new Date().toISOString();
    const history = normalizeHistory(d.review_history);
    const nextHistory: ReviewEntry[] = [...history, { at, note }];
    const nextReviewNotes = note;

    const { error } = await supabase
      .from("decisions")
      .update({
        review_history: nextHistory,
        review_notes: nextReviewNotes,
        reviewed_at: at,
      })
      .eq("id", d.id);

    if (error) {
      setStatusLine(`Save review note failed: ${error.message}`);
      return;
    }

    setRows((prev) =>
      prev.map((x) =>
        x.id === d.id ? { ...x, review_history: nextHistory, review_notes: nextReviewNotes, reviewed_at: at } : x
      )
    );

    setReviewDraft((prev) => {
      const copy = { ...prev };
      delete copy[d.id];
      return copy;
    });

    setStatusLine("Review note saved ✅");
  };

  const bulkMarkReviewed = async () => {
    const ids = selectedIds;
    if (ids.length === 0) return;

    const prevMap: Record<string, string | null> = {};
    for (const d of rows) if (ids.includes(d.id)) prevMap[d.id] = d.reviewed_at ?? null;

    setStatusLine("Marking selected as reviewed...");
    const nowIso = new Date().toISOString();

    const { error } = await supabase.from("decisions").update({ reviewed_at: nowIso }).in("id", ids);
    if (error) {
      setStatusLine(`Bulk reviewed failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, reviewed_at: nowIso } : d)));
    setStatusLine(`Reviewed ${ids.length} ✅`);

    showToast(
      {
        message: `Reviewed ${ids.length} ✅`,
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing bulk review...");
          const tasks = ids.map((id) =>
            supabase.from("decisions").update({ reviewed_at: prevMap[id] ?? null }).eq("id", id)
          );
          const results = await Promise.all(tasks);
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            setStatusLine(`Undo failed: ${failed.error.message}`);
            return;
          }
          setRows((prev) => prev.map((d) => (ids.includes(d.id) ? { ...d, reviewed_at: prevMap[d.id] ?? null } : d)));
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

  // ✅ NEW: mark draft as decided
  const markDraftDecided = async (d: Decision) => {
    const nowIso = new Date().toISOString();
    setStatusLine("Marking decided...");

    const { error } = await supabase
      .from("decisions")
      .update({ status: "decided", decided_at: nowIso })
      .eq("id", d.id);

    if (error) {
      setStatusLine(`Mark decided failed: ${error.message}`);
      return;
    }

    setRows((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: "decided", decided_at: nowIso } : x)));
    setStatusLine("Decided ✅");

    showToast(
      {
        message: "Marked decided ✅",
        undoLabel: "Undo",
        onUndo: async () => {
          const { error: undoErr } = await supabase
            .from("decisions")
            .update({ status: "draft", decided_at: null })
            .eq("id", d.id);

          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            return;
          }

          setRows((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: "draft", decided_at: null } : x)));
          setStatusLine("Undone ✅");
        },
      },
      8000
    );
  };

  // ---------- filtering ----------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((d) => {
      // keep drafts out of the Review tab (review tab = decisions due)
      if (tab === "review") {
        if (d.status === "draft") return false;
        if (!isDueForReview(d)) return false;
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

  const drafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((d) => d.status === "draft")
      .filter((d) => {
        if (!q) return true;
        const hay = [d.title, d.context ?? ""].join("\n").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta;
      });
  }, [rows, query]);

  const decidedCount = useMemo(() => rows.filter((d) => d.status === "decided").length, [rows]);

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
        <strong>{decidedCount}</strong> decided • <strong>{drafts.length}</strong> draft • {statusLine}
      </div>
      <div>You’re building a trail of clarity — one decision at a time.</div>
    </div>
  );

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
      {/* Drafts */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold tracking-tight">Drafts</h2>
          <div className="text-sm text-zinc-600">{drafts.length} waiting</div>
        </div>

        {drafts.length === 0 ? (
          <Card className="bg-zinc-50">
            <CardContent>
              <div className="space-y-2">
                <strong>No drafts right now.</strong>
                <div className="text-sm text-zinc-600">Use “Promote → Decisions” from Inbox to park something here.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {drafts.map((d) => (
              <Card key={`draft-${d.id}`} className="border-zinc-200 bg-white">
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base">{d.pinned ? "⭐ " : ""}{d.title}</strong>
                          <Badge variant="muted">Draft</Badge>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">Created: {formatLocal(d.created_at)}</div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => togglePinned(d.id, !d.pinned)}>
                          {d.pinned ? "⭐ Pinned" : "☆ Pin"}
                        </Button>
                        <Button onClick={() => markDraftDecided(d)}>Mark Decided ✅</Button>
                      </div>
                    </div>

                    {d.context && (
                      <div className="whitespace-pre-wrap text-sm text-zinc-800">{d.context}</div>
                    )}

                    <div className="text-xs text-zinc-500">status: {d.status}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="my-2 h-px w-full bg-zinc-200" />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Chip active={tab === "all"} onClick={() => setTab("all")}>
          All
        </Chip>

        <Chip active={tab === "review"} onClick={() => setTab("review")} title="Decisions due for review">
          Review {dueForReviewCount > 0 ? `(${dueForReviewCount})` : ""}
        </Chip>

        {tab === "review" && dueForReviewCount === 0 && (
          <div className="self-center text-sm text-zinc-600">Nothing is due right now 🎉</div>
        )}
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
                {selectedIds.length > 0 && <Badge variant="muted">Selected: {selectedIds.length}</Badge>}
              </div>

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
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={bulkMarkReviewed} disabled={selectedIds.length === 0}>
                ✅ Mark reviewed
              </Button>

              <Button
                variant="secondary"
                onClick={() => bulkScheduleMinutes(60 * 24 * 3)}
                disabled={selectedIds.length === 0}
              >
                ⏳ Review in 3 days
              </Button>

              <Button
                variant="secondary"
                onClick={() => bulkScheduleMinutes(60 * 24 * 7)}
                disabled={selectedIds.length === 0}
              >
                ⏳ Review in 7 days
              </Button>

              <Button
                variant="secondary"
                onClick={() => bulkScheduleMinutes(60 * 24 * 30)}
                disabled={selectedIds.length === 0}
              >
                ⏳ Review in 30 days
              </Button>

              <Button variant="secondary" onClick={bulkClearReviewAt} disabled={selectedIds.length === 0}>
                🧹 Clear review date
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "review" ? "Search reviews..." : "Search decisions..."}
          className="min-w-[260px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {/* Filters */}
      <Card className="bg-zinc-50">
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="text-sm text-zinc-600">
                Filters {activeFiltersCount > 0 ? `• ${activeFiltersCount} active` : ""}
              </div>

              <Button variant="secondary" onClick={clearFilters} disabled={activeFiltersCount === 0}>
                Clear
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Chip
                active={needsAttention}
                onClick={() => setNeedsAttention((v) => !v)}
                title="High stakes OR gather info OR delay"
              >
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
        {filtered
          .filter((d) => d.status !== "draft")
          .map((d) => {
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

            return (
              <Card
                key={d.id}
                className={due ? "border-amber-200 bg-amber-50" : dueSoon ? "border-yellow-200 bg-yellow-50" : "bg-white"}
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

                  <button
                    onClick={() => toggleOne(d.id)}
                    className="w-full cursor-pointer bg-transparent p-0 text-left"
                    title={isOpen ? "Collapse" : "Expand"}
                    style={{ border: "none" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span
                          title={d.status}
                          className="mt-2 inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            background: d.status === "decided" ? "green" : "gray",
                            opacity: 0.75,
                          }}
                        />

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-base">
                              {d.pinned ? "⭐ " : ""}
                              {d.title}
                            </strong>

                            {due && <Badge variant="warning">Due for review</Badge>}
                            {dueSoon && <Badge variant="muted">Due soon</Badge>}
                            {conf && <Badge variant="muted">Confidence: {conf}</Badge>}
                            {suggested && <Badge variant="muted">AI: {suggested}</Badge>}
                          </div>

                          <div className="mt-1 text-xs text-zinc-500">
                            Decided: {formatLocal(d.decided_at)} • Created: {formatLocal(d.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-zinc-500">{isOpen ? "▾" : "▸"}</div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 grid gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" onClick={() => togglePinned(d.id, !d.pinned)}>
                          {d.pinned ? "⭐ Pinned" : "☆ Pin"}
                        </Button>

                        <Button onClick={() => markReviewedNow(d.id)}>✅ Reviewed</Button>

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
                        <Card className="bg-zinc-50">
                          <CardContent>
                            <div className="mb-2 text-xs text-zinc-500">Context</div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.context}</div>
                          </CardContent>
                        </Card>
                      )}

                      {d.user_reasoning && (
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

                      <Card className="bg-zinc-50">
                        <CardContent>
                          <div className="mb-2 text-xs text-zinc-500">Review notes</div>

                          {d.review_notes ? (
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{d.review_notes}</div>
                          ) : (
                            <div className="text-sm text-zinc-500">No review notes yet.</div>
                          )}

                          <div className="mt-3 text-xs text-zinc-500">
                            Add a new note (saved into history + marks reviewed)
                          </div>

                          <textarea
                            value={reviewDraft[d.id] ?? ""}
                            onChange={(e) => setReviewDraft((prev) => ({ ...prev, [d.id]: e.target.value }))}
                            placeholder="e.g. New info: vet quote came in lower, okay to proceed."
                            className="mt-2 w-full min-h-[70px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                          />

                          <div className="mt-3 flex flex-wrap gap-2">
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
                        <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-3 text-xs text-zinc-100">
                          {JSON.stringify(d.ai_json, null, 2)}
                        </pre>
                      )}

                      <div className="text-xs text-zinc-500">status: {d.status}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

        {filtered.filter((d) => d.status !== "draft").length === 0 && (
          <div className="text-sm text-zinc-600">{tab === "review" ? "No reviews due." : "No decisions found."}</div>
        )}
      </div>
    </Page>
  );
}
