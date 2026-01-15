"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, CardContent, useToast, Chip } from "@/components/ui";
import { Page } from "@/components/Page";

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  severity: number | null; // 1 = highest priority, 3 = lowest
  status: string; // open | snoozed | done
  snoozed_until: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function isoNowPlusMinutes(mins: number) {
  const d = new Date(Date.now() + mins * 60 * 1000);
  return d.toISOString();
}

const clamp = (n: number, min = 1, max = 3) => Math.max(min, Math.min(max, n));
type LiveStatus = "connecting" | "live" | "offline";

export default function InboxPage() {
  const { showToast } = useToast();

  const [statusLine, setStatusLine] = useState("Loading...");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [affirmation, setAffirmation] = useState<string | null>(null);

  // manual add
  const [newItemTitle, setNewItemTitle] = useState("");
  const [adding, setAdding] = useState(false);

  // refresh tracking
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  // per-item inputs
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [decisionConfidence, setDecisionConfidence] = useState<Record<string, number>>({});

  // AI Preview (per-item)
  const [aiPreview, setAiPreview] = useState<Record<string, any>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, string>>({});

  // Live indicator
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");

  // stable load reference (prevents stale closure issues in realtime callbacks)
  const loadRef = useRef<() => void>(() => {});
  // Realtime: throttle reload
  const reloadTimerRef = useRef<number | null>(null);

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRef.current();
    }, 250);
  };

  // ---------- helpers ----------
  function severityStyle(severity: number | null) {
    switch (severity) {
      case 1:
        return { border: "border-red-200", bg: "bg-red-50" };
      case 2:
        return { border: "border-amber-200", bg: "bg-amber-50" };
      case 3:
      default:
        return { border: "border-zinc-200", bg: "bg-white" };
    }
  }

  function severityBadge(severity: number | null) {
    if (severity === 1) return { label: "Top", variant: "danger" as const };
    if (severity === 2) return { label: "Mid", variant: "warning" as const };
    return { label: "Low", variant: "muted" as const };
  }

  const clearPerItemInputs = (id: string) => {
    setDecisionReason((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    setDecisionConfidence((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    setAiPreview((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setAiLoading((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setAiError((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const priorityValue = (sev: number | null) => {
    if (sev === 1) return 0;
    if (sev === 2) return 1;
    if (sev === 3) return 2;
    return 1;
  };

  const analyzeItem = async (item: InboxItem) => {
    setAiError((prev) => ({ ...prev, [item.id]: "" }));
    setAiLoading((prev) => ({ ...prev, [item.id]: true }));

    try {
      const res = await fetch("/api/analyze-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          body: item.body,
          type: item.type,
          severity: item.severity,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "AI analysis failed");

      setAiPreview((prev) => ({ ...prev, [item.id]: json.analysis }));
    } catch (e: any) {
      setAiError((prev) => ({ ...prev, [item.id]: e?.message ?? "AI analysis failed" }));
    } finally {
      setAiLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const isEngineItem = (it: InboxItem) => it.type === "engine";

  function engineCardClasses(base: { border: string; bg: string }, isEngine: boolean) {
    if (!isEngine) return `${base.border} ${base.bg}`;
    // subtle "official" reminder styling: soft background + left accent, without changing severity meaning
    return `${base.border} bg-zinc-50 border-l-4 border-l-zinc-400`;
  }

  // ---------- auth + load ----------
  const load = async () => {
    setStatusLine("Loading...");
    setAffirmation(null);

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) {
      setStatusLine(`Auth error: ${authError.message}`);
      setUserId(null);
      setLiveStatus("offline");
      return;
    }

    const user = auth.user;
    if (!user) {
      setStatusLine("Not signed in. Go to /auth/login");
      setUserId(null);
      setLiveStatus("offline");
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? "");

    const { data, error } = await supabase
      .from("decision_inbox")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    setItems((data ?? []) as InboxItem[]);
    setLastLoadedAt(new Date());
    setStatusLine(`Loaded ${data?.length ?? 0} item(s).`);
  };

  // keep loadRef updated
  useEffect(() => {
    loadRef.current = () => {
      load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    load();

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription: decision_inbox changes for this user
  useEffect(() => {
    if (!userId) return;

    setLiveStatus("connecting");

    const channel = supabase
      .channel(`decision-inbox-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "decision_inbox",
          filter: `user_id=eq.${userId}`,
        },
        () => scheduleReload()
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR") setLiveStatus("offline");
      });

    return () => {
      supabase.removeChannel(channel);
      setLiveStatus("offline");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ticker + focus refresh (no polling)
  useEffect(() => {
    const ticker = setInterval(() => setTick((t) => t + 1), 10_000);
    const onFocus = () => loadRef.current();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(ticker);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // ---------- computed ----------
  const now = Date.now();

  const visibleItems = useMemo(() => {
    return items.filter((it) => {
      if (it.status === "done") return false;
      if (!it.snoozed_until) return true;
      const snoozeMs = Date.parse(it.snoozed_until);
      return Number.isNaN(snoozeMs) ? true : snoozeMs <= now;
    });
  }, [items, now]);

  const handledTodayCount = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return items.filter((it) => {
      if (it.status !== "done") return false;
      if (!it.updated_at) return false;
      const updated = new Date(it.updated_at);
      return updated >= startOfToday;
    }).length;
  }, [items]);

  const hasDecisionThisWeek = useMemo(() => {
    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    return items.some((it) => {
      if (it.status !== "done") return false;
      if (!it.updated_at) return false;
      return new Date(it.updated_at) >= startOfWeek;
    });
  }, [items]);

  const focusItems = useMemo(() => {
    const sorted = [...visibleItems].sort((a, b) => {
      const pa = priorityValue(a.severity);
      const pb = priorityValue(b.severity);
      if (pa !== pb) return pa - pb;

      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      return tb - ta;
    });

    return sorted.slice(0, 2);
  }, [visibleItems]);

  // ---------- manual add ----------
  const addManualInboxItem = async () => {
    if (!userId) {
      setStatusLine("Not signed in.");
      return;
    }

    const title = newItemTitle.trim();
    if (!title) {
      setStatusLine("Type something first.");
      return;
    }

    setAffirmation(null);
    setAdding(true);
    setStatusLine("Adding to inbox...");

    try {
      const dedupe_key = `manual_${Date.now()}`;

      const { data, error } = await supabase
        .from("decision_inbox")
        .insert({
          user_id: userId,
          type: "next_action",
          title,
          body: null,
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key,
        })
        .select("*")
        .single();

      if (error) {
        setStatusLine(`Add failed: ${error.message}`);
        return;
      }

      setItems((prev) => [data as any, ...prev]);
      setNewItemTitle("");
      setStatusLine("Added ✅");
    } catch (e: any) {
      setStatusLine(e?.message ?? "Add failed");
    } finally {
      setAdding(false);
    }
  };

  // ---------- actions ----------
  const forceUnsnoozeAll = async () => {
    if (!userId) return;

    setAffirmation(null);
    setStatusLine("Unsnoozing all snoozed items...");

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "open", snoozed_until: null })
      .eq("user_id", userId)
      .eq("status", "snoozed");

    if (error) {
      setStatusLine(`Force unsnooze failed: ${error.message}`);
      return;
    }

    setItems((prev) =>
      prev.map((it) => (it.status === "snoozed" ? { ...it, status: "open", snoozed_until: null } : it))
    );

    setStatusLine("All snoozed items are now open ✅");
  };

  const updateSeverity = async (id: string, next: number) => {
    if (!userId) return;

    const severity = clamp(next);

    const { error } = await supabase.from("decision_inbox").update({ severity }).eq("id", id).eq("user_id", userId);

    if (error) {
      setStatusLine(`Priority update failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, severity } : it)));
  };

  const doneItem = async (id: string) => {
    if (!userId) return;

    setAffirmation(null);
    setStatusLine("Marking done...");

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "done", snoozed_until: null })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Done failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "done", snoozed_until: null } : it)));
    clearPerItemInputs(id);
    setStatusLine("Done ✅");
  };

  const snoozeItemMinutes = async (id: string, mins: number) => {
    if (!userId) return;

    const until = isoNowPlusMinutes(mins);

    setAffirmation(null);
    setStatusLine(`Snoozing for ${mins} minute(s)...`);

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "snoozed", snoozed_until: until })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Snooze failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "snoozed", snoozed_until: until } : it)));
    clearPerItemInputs(id);

    setStatusLine(`Snoozed ✅ (${mins} min)`);
  };

  const undoToOpen = async (id: string) => {
    if (!userId) return;

    setAffirmation(null);
    setStatusLine("Re-opening...");

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "open", snoozed_until: null })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Undo failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "open", snoozed_until: null } : it)));
    clearPerItemInputs(id);

    setStatusLine("Open ✅");
  };

  const decideNowAndCloseInboxItem = async (item: InboxItem) => {
    if (!userId) return;

    try {
      setStatusLine("Saving decision...");
      setAffirmation(null);

      const userReason = decisionReason[item.id]?.trim() ? decisionReason[item.id].trim() : null;
      const confidenceLevel = decisionConfidence[item.id] ?? null;

      // 1) AI (must not block)
      let ai: any = null;
      try {
        const res = await fetch("/api/analyze-decision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            body: item.body,
            type: item.type,
            severity: item.severity,
          }),
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "AI analysis failed");
        ai = json.analysis;
      } catch {
        ai = null;
      }

      // 2) Insert decision AND capture its id (needed for Undo)
      const { data: inserted, error: insertError } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          inbox_item_id: item.id,
          title: item.title,
          context: item.body ?? null,

          user_reasoning: userReason,
          confidence_level: confidenceLevel,

          ai_summary: ai ? (ai.reasoning ?? null) : null,
          ai_json: ai ?? null,

          status: "decided",
          decided_at: new Date().toISOString(),

          review_notes: null,
          review_history: [],
        })
        .select("id")
        .single();

      if (insertError) {
        setStatusLine(`Decision save failed: ${insertError.message}`);
        return;
      }

      const decisionId = inserted?.id as string | undefined;
      if (!decisionId) {
        setStatusLine("Decision saved but missing id (unexpected).");
        return;
      }

      // 3) Close inbox item
      const { error: closeError } = await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("id", item.id)
        .eq("user_id", userId);

      if (closeError) {
        setStatusLine(`Saved decision, but couldn't close inbox item: ${closeError.message}`);
        return;
      }

      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: "done", snoozed_until: null } : it)));
      clearPerItemInputs(item.id);

      setStatusLine("Decision saved ✅");

      showToast(
        {
          message: "Decision saved ✅",
          undoLabel: "Undo",
          onUndo: async () => {
            setStatusLine("Undoing decision...");

            const { error: delErr } = await supabase.from("decisions").delete().eq("id", decisionId).eq("user_id", userId);
            if (delErr) {
              setStatusLine(`Undo failed (delete): ${delErr.message}`);
              return;
            }

            const { error: reopenErr } = await supabase
              .from("decision_inbox")
              .update({ status: "open", snoozed_until: null })
              .eq("id", item.id)
              .eq("user_id", userId);

            if (reopenErr) {
              setStatusLine(`Undo partial (reopen failed): ${reopenErr.message}`);
              return;
            }

            setStatusLine("Undone ✅");
          },
        },
        8000
      );
    } catch (e: any) {
      setStatusLine(e?.message ?? "Failed to save decision");
    }
  };

  // ✅ NEW: Promote (Inbox → Decisions) without deciding yet
  const promoteInboxItemToDecision = async (item: InboxItem) => {
    if (!userId) return;

    try {
      setStatusLine("Promoting to Decisions...");
      setAffirmation(null);

      // 1) Create a draft decision linked to the inbox item
      const { data: inserted, error: insertError } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          inbox_item_id: item.id,
          title: item.title,
          context: item.body ?? null,

          // Draft: not yet decided
          status: "draft",
          decided_at: null,

          // Keep these clean for later
          user_reasoning: null,
          confidence_level: null,
          ai_summary: null,
          ai_json: null,
          review_notes: null,
          review_history: [],
        })
        .select("id")
        .single();

      if (insertError) {
        setStatusLine(`Promote failed: ${insertError.message}`);
        return;
      }

      const decisionId = inserted?.id as string | undefined;
      if (!decisionId) {
        setStatusLine("Promoted, but missing decision id (unexpected).");
        return;
      }

      // 2) Close inbox item (so it disappears from Visible)
      const { error: closeError } = await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("id", item.id)
        .eq("user_id", userId);

      if (closeError) {
        setStatusLine(`Promoted, but couldn't close inbox item: ${closeError.message}`);
        return;
      }

      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: "done", snoozed_until: null } : it))
      );
      clearPerItemInputs(item.id);

      setStatusLine("Promoted ✅");

      showToast(
        {
          message: "Promoted to Decisions ✅",
          undoLabel: "Undo",
          onUndo: async () => {
            setStatusLine("Undoing promotion...");

            const { error: delErr } = await supabase
              .from("decisions")
              .delete()
              .eq("id", decisionId)
              .eq("user_id", userId);

            if (delErr) {
              setStatusLine(`Undo failed (delete): ${delErr.message}`);
              return;
            }

            const { error: reopenErr } = await supabase
              .from("decision_inbox")
              .update({ status: "open", snoozed_until: null })
              .eq("id", item.id)
              .eq("user_id", userId);

            if (reopenErr) {
              setStatusLine(`Undo partial (reopen failed): ${reopenErr.message}`);
              return;
            }

            setStatusLine("Undone ✅");
          },
        },
        8000
      );
    } catch (e: any) {
      setStatusLine(e?.message ?? "Promote failed");
    }
  };

  const minutesAgo = lastLoadedAt ? Math.floor((Date.now() - lastLoadedAt.getTime() + tick * 0) / 60000) : null;

  const liveBadge = () => {
    if (liveStatus === "live") return { text: "Live", variant: "success" as const };
    if (liveStatus === "connecting") return { text: "Connecting…", variant: "warning" as const };
    return { text: "Offline", variant: "danger" as const };
  };

  const badge = liveBadge();

  const headerSubtitle = (
    <div className="space-y-1">
      {email && <div>Signed in as: {email}</div>}
      <div className="text-zinc-700">{statusLine}</div>
      {lastLoadedAt && (
        <div className="text-xs text-zinc-500">
          Updated {minutesAgo !== null && minutesAgo < 1 ? "just now" : `${minutesAgo ?? 0}m ago`}
        </div>
      )}
    </div>
  );

  // ---------- UI ----------
  return (
    <Page
      title="Inbox"
      subtitle={headerSubtitle}
      right={
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant} title="Realtime connection status">
            ● {badge.text}
          </Badge>
          <Button onClick={() => loadRef.current()}>Refresh</Button>
          {process.env.NODE_ENV === "development" && (
            <Button variant="secondary" onClick={forceUnsnoozeAll}>
              Force Unsnooze (dev)
            </Button>
          )}
        </div>
      }
    >
      {affirmation && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="text-sm text-emerald-900">{affirmation}</CardContent>
        </Card>
      )}

      {/* Manual add */}
      <Card>
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm text-zinc-600">Add something that’s on your mind</div>

            <div className="flex flex-wrap gap-2">
              <input
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                placeholder="e.g. Decide if we can do takeaway tonight"
                className="min-w-[320px] flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManualInboxItem();
                }}
              />

              <Button onClick={addManualInboxItem} disabled={adding}>
                {adding ? "Adding..." : "Add to Inbox"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visible */}
      <div className="space-y-3">
        <h2 className="m-0 text-lg font-semibold tracking-tight">Visible</h2>

        <div className="grid gap-3">
          {visibleItems.map((it) => {
            const b = severityBadge(it.severity);
            const s = severityStyle(it.severity);
            const engine = isEngineItem(it);

            const analysis = aiPreview[it.id];
            const loading = !!aiLoading[it.id];
            const err = aiError[it.id];

            return (
              <Card key={it.id} className={engineCardClasses(s, engine)}>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-base">{it.title}</strong>
                        <Badge variant={b.variant}>{b.label}</Badge>
                        {engine && <Chip>Engine</Chip>}
                      </div>

                      <div className="text-xs text-zinc-500">
                        {it.status}
                        {it.snoozed_until ? ` (until ${it.snoozed_until})` : ""}
                      </div>
                    </div>

                    {engine && <div className="text-xs text-zinc-500">Truth reminder from Engine</div>}

                    {it.body && <div className="whitespace-pre-wrap text-sm text-zinc-800">{it.body}</div>}

                    <div className="space-y-2">
                      <Button variant="secondary" onClick={() => analyzeItem(it)} disabled={loading}>
                        {loading ? "Analyzing..." : analysis ? "Re-analyze with AI" : "Analyze with AI"}
                      </Button>

                      {err && <div className="text-xs text-red-700">AI error: {err}</div>}

                      {analysis && (
                        <Card className="border-sky-200 bg-sky-50">
                          <CardContent>
                            <div className="space-y-3">
                              <div className="text-xs text-zinc-500">AI analysis</div>

                              <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
                                {analysis.decision_type && <span>Type: {analysis.decision_type}</span>}
                                {analysis.stakes && <span>• Stakes: {analysis.stakes}</span>}
                                {analysis.reversible != null && (
                                  <span>• Reversible: {analysis.reversible ? "Yes" : "No"}</span>
                                )}
                                {analysis.time_horizon && <span>• Horizon: {analysis.time_horizon}</span>}
                              </div>

                              {analysis.suggested_default && (
                                <div className="text-sm">
                                  <strong>Suggested default:</strong> {analysis.suggested_default}
                                </div>
                              )}

                              {analysis.reasoning && (
                                <div className="whitespace-pre-wrap text-sm leading-relaxed">{analysis.reasoning}</div>
                              )}

                              {Array.isArray(analysis.key_questions) && analysis.key_questions.length > 0 && (
                                <div className="text-sm">
                                  <strong>Key questions</strong>
                                  <ul className="mt-2 list-disc pl-5">
                                    {analysis.key_questions.map((q: string, idx: number) => (
                                      <li key={idx} className="mb-1">
                                        {q}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500">How confident do you feel about this?</div>

                      <div className="flex flex-wrap gap-4">
                        {[1, 2, 3].map((level) => (
                          <label
                            key={level}
                            className={`flex cursor-pointer items-center gap-2 text-sm ${
                              decisionConfidence[it.id] === level ? "opacity-100" : "opacity-80"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`confidence-${it.id}`}
                              checked={decisionConfidence[it.id] === level}
                              onChange={() =>
                                setDecisionConfidence((prev) => ({
                                  ...prev,
                                  [it.id]: level,
                                }))
                              }
                            />
                            {level === 1 ? "Low" : level === 2 ? "Medium" : "High"}
                          </label>
                        ))}
                      </div>

                      <textarea
                        placeholder="Why did you decide this? (optional)"
                        value={decisionReason[it.id] ?? ""}
                        onChange={(e) =>
                          setDecisionReason((prev) => ({
                            ...prev,
                            [it.id]: e.target.value,
                          }))
                        }
                        className="w-full min-h-[70px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => decideNowAndCloseInboxItem(it)}>Decide Now ✅</Button>

                      {/* ✅ NEW BUTTON */}
                      <Button variant="secondary" onClick={() => promoteInboxItemToDecision(it)}>
                        Promote → Decisions
                      </Button>

                      <Button variant="secondary" onClick={() => doneItem(it.id)}>
                        Done
                      </Button>

                      <Button variant="secondary" onClick={() => snoozeItemMinutes(it.id, 1)}>
                        Snooze 1 min
                      </Button>

                      <Button variant="secondary" onClick={() => snoozeItemMinutes(it.id, 10)}>
                        Snooze 10 min
                      </Button>

                      {(it.status === "done" || it.status === "snoozed") && (
                        <Button variant="secondary" onClick={() => undoToOpen(it.id)}>
                          Undo → Open
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        onClick={() => updateSeverity(it.id, (it.severity ?? 2) - 1)}
                        title="Raise priority (towards 1)"
                      >
                        ↑ Priority
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => updateSeverity(it.id, (it.severity ?? 2) + 1)}
                        title="Lower priority (towards 3)"
                      >
                        ↓ Priority
                      </Button>
                    </div>

                    <div className="text-xs text-zinc-500">
                      type: {it.type} • severity: {it.severity ?? 2} • id: {it.id}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {visibleItems.length === 0 && (
            <Card className="bg-zinc-50">
              <CardContent>
                <div className="space-y-2">
                  <strong>You’re clear right now.</strong>
                  <div className="text-sm text-zinc-600">Everything that needs attention is handled or scheduled.</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}
