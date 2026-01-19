// app/(app)/inbox/page.tsx
"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Button, Card, CardContent, useToast, Chip } from "@/components/ui";
import { Page } from "@/components/Page";

// ---- CONFIG ----
const PROMOTED_STATUS: "decided" | "draft" = "decided";

// ✅ This is the dedupe key Engine v2 writes for the patterns digest
const INSIGHTS_DEDUPE_KEY = "engine_insights_v2_digest";

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  severity: number | null;
  status: string;
  snoozed_until: string | null;
  created_at: string | null;
  updated_at: string | null;
  action_label: string | null;
  action_href: string | null;

  // ✅ important for insights actions
  dedupe_key?: string | null;
};

function isoNowPlusMinutes(mins: number) {
  const d = new Date(Date.now() + mins * 60 * 1000);
  return d.toISOString();
}

function isoNowPlusHours(hours: number) {
  return isoNowPlusMinutes(hours * 60);
}

function isoNowPlusDays(days: number) {
  return isoNowPlusHours(days * 24);
}

function safeParseMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function formatWhen(iso: string | null) {
  const ms = safeParseMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleString();
}

const clamp = (n: number, min = 1, max = 3) => Math.max(min, Math.min(max, n));
type LiveStatus = "connecting" | "live" | "offline";

type DraftStore = {
  reason?: Record<string, string>;
  confidence?: Record<string, number>;
};

export default function InboxPage() {
  const { showToast } = useToast();
  const router = useRouter();

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

  // per-item inputs
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});
  const [decisionConfidence, setDecisionConfidence] = useState<Record<string, number>>({});

  // AI Preview (per-item)
  const [aiPreview, setAiPreview] = useState<Record<string, any>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<Record<string, string>>({});

  // Live indicator
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("connecting");

  // ✅ New UX: section-level collapse (calm defaults)
  const [openRecommended, setOpenRecommended] = useState(true);
  const [openMaintenance, setOpenMaintenance] = useState(false);
  const [openNotes, setOpenNotes] = useState(true);

  // ✅ New UX: item-level collapse (collapsed by default)
  const [openItem, setOpenItem] = useState<Record<string, boolean>>({});

  // ✅ Action hierarchy: keep advanced controls tucked away
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});

  const loadRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});
  const reloadTimerRef = useRef<number | null>(null);

  // "minutes ago" display without polling: we update a lightweight clock only when the page is visible
  const [clock, setClock] = useState<number>(() => Date.now());
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) setClock(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);

    const t = window.setInterval(() => {
      if (!document.hidden) setClock(Date.now());
    }, 15_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(t);
    };
  }, []);

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRef.current({ silent: true });
    }, 250);
  };

  // ---------- local draft persistence ----------
  const draftKey = (uid: string) => `keystone:inbox:drafts:v1:${uid}`;

  const readDraftStore = (uid: string): DraftStore => {
    try {
      const raw = window.localStorage.getItem(draftKey(uid));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return {
        reason: typeof parsed.reason === "object" && parsed.reason ? parsed.reason : {},
        confidence: typeof parsed.confidence === "object" && parsed.confidence ? parsed.confidence : {},
      };
    } catch {
      return {};
    }
  };

  const writeDraftStore = (uid: string, store: DraftStore) => {
    try {
      window.localStorage.setItem(draftKey(uid), JSON.stringify(store));
    } catch {
      // ignore quota / privacy mode failures
    }
  };

  const setDraftReason = (id: string, value: string) => {
    setDecisionReason((prev) => ({ ...prev, [id]: value }));
    if (!userId) return;

    const store = readDraftStore(userId);
    const nextReason = { ...(store.reason ?? {}), [id]: value };
    writeDraftStore(userId, { ...store, reason: nextReason });
  };

  const setDraftConfidence = (id: string, value: number) => {
    setDecisionConfidence((prev) => ({ ...prev, [id]: value }));
    if (!userId) return;

    const store = readDraftStore(userId);
    const nextConf = { ...(store.confidence ?? {}), [id]: value };
    writeDraftStore(userId, { ...store, confidence: nextConf });
  };

  const clearDraftForId = (id: string) => {
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

    if (!userId) return;
    const store = readDraftStore(userId);
    const nextReason = { ...(store.reason ?? {}) };
    const nextConf = { ...(store.confidence ?? {}) };
    delete nextReason[id];
    delete nextConf[id];
    writeDraftStore(userId, { ...store, reason: nextReason, confidence: nextConf });
  };

  // Hydrate drafts on login
  const hydratedDraftsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    if (hydratedDraftsRef.current === userId) return;
    hydratedDraftsRef.current = userId;

    const store = readDraftStore(userId);
    if (store.reason) setDecisionReason(store.reason);
    if (store.confidence) setDecisionConfidence(store.confidence);
  }, [userId]);

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
    clearDraftForId(id);

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

    setOpenItem((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    setShowAdvanced((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
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

  // Engine v2: digest + (optional) other v2 items (safe heuristic)
  const isInsightsDigest = (it: InboxItem) => isEngineItem(it) && (it.dedupe_key ?? "") === INSIGHTS_DEDUPE_KEY;
  const isEngineV2Insight = (it: InboxItem) =>
    isInsightsDigest(it) || (isEngineItem(it) && String(it.dedupe_key ?? "").includes("engine_insights_v2"));
  const isEngineV1Reminder = (it: InboxItem) => isEngineItem(it) && !isEngineV2Insight(it);

  function engineCardClasses(base: { border: string; bg: string }, kind: "v2" | "v1" | null) {
    if (!kind) return `${base.border} ${base.bg}`;

    const left = kind === "v2" ? "border-l-4 border-l-sky-400 bg-zinc-50" : "border-l-4 border-l-amber-400 bg-zinc-50";
    return `${base.border} ${left}`;
  }

  const prettySupabaseError = (e: any) => {
    const msg = typeof e?.message === "string" ? e.message : "";
    if (
      msg.toLowerCase().includes("duplicate key") ||
      msg.toLowerCase().includes("unique") ||
      msg.toLowerCase().includes("already exists")
    ) {
      return "Already promoted/decided for this inbox item.";
    }
    return msg || "Something went wrong.";
  };

  const isActivelySnoozed = (it: InboxItem, nowMs: number) => {
    const ms = safeParseMs(it.snoozed_until);
    if (!ms) return false;
    return ms > nowMs;
  };

  const snippet = (text: string | null, max = 110) => {
    const t = (text ?? "").trim().replace(/\s+/g, " ");
    if (!t) return "";
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + "…";
  };

  const toggleItem = (id: string) => {
    setOpenItem((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setItemOpen = (id: string, open: boolean) => {
    setOpenItem((prev) => ({ ...prev, [id]: open }));
  };

  const toggleAdvanced = (id: string) => {
    setShowAdvanced((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setAdvancedOpen = (id: string, open: boolean) => {
    setShowAdvanced((prev) => ({ ...prev, [id]: open }));
  };

  // ---------- auth + load ----------
  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    if (!silent) setStatusLine("Loading...");
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
    if (!silent) setStatusLine(`Loaded ${data?.length ?? 0} item(s).`);
  };

  useEffect(() => {
    loadRef.current = (opts?: { silent?: boolean }) => {
      load(opts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        (payload: any) => {
          const eventType: string | undefined = payload?.eventType;
          const newRow = payload?.new as any | undefined;
          const oldRow = payload?.old as any | undefined;

          const idFromOld = oldRow?.id as string | undefined;
          const idFromNew = newRow?.id as string | undefined;
          const id = idFromNew || idFromOld;

          if (!eventType || !id) {
            scheduleReload();
            return;
          }

          const toInboxItem = (r: any): InboxItem => ({
            id: r.id,
            user_id: r.user_id,
            type: r.type ?? "next_action",
            title: r.title ?? "",
            body: r.body ?? null,
            severity: r.severity ?? null,
            status: r.status ?? "open",
            snoozed_until: r.snoozed_until ?? null,
            created_at: r.created_at ?? null,
            updated_at: r.updated_at ?? null,
            action_label: r.action_label ?? null,
            action_href: r.action_href ?? null,
            dedupe_key: r.dedupe_key ?? null,
          });

          setItems((prev) => {
            if (eventType === "INSERT") {
              if (!newRow) {
                scheduleReload();
                return prev;
              }
              const candidate = toInboxItem(newRow);

              const exists = prev.some((x) => x.id === candidate.id);
              const merged = exists
                ? prev.map((x) => (x.id === candidate.id ? { ...x, ...candidate } : x))
                : [candidate, ...prev];

              merged.sort((a, b) => {
                const ta = a.created_at ? Date.parse(a.created_at) : 0;
                const tb = b.created_at ? Date.parse(b.created_at) : 0;
                const va = Number.isNaN(ta) ? 0 : ta;
                const vb = Number.isNaN(tb) ? 0 : tb;
                return vb - va;
              });

              return merged;
            }

            if (eventType === "UPDATE") {
              if (!newRow) {
                scheduleReload();
                return prev;
              }
              const patch = toInboxItem(newRow);

              const exists = prev.some((x) => x.id === patch.id);
              const merged = exists ? prev.map((x) => (x.id === patch.id ? { ...x, ...patch } : x)) : [patch, ...prev];

              merged.sort((a, b) => {
                const ta = a.created_at ? Date.parse(a.created_at) : 0;
                const tb = b.created_at ? Date.parse(b.created_at) : 0;
                const va = Number.isNaN(ta) ? 0 : ta;
                const vb = Number.isNaN(tb) ? 0 : tb;
                return vb - va;
              });

              return merged;
            }

            if (eventType === "DELETE") {
              clearPerItemInputs(id);
              return prev.filter((x) => x.id !== id);
            }

            scheduleReload();
            return prev;
          });

          setLastLoadedAt(new Date());
        }
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

  // Focus refresh (silent) — no polling
  useEffect(() => {
    const onFocus = () => loadRef.current({ silent: true });
    window.addEventListener("focus", onFocus);

    return () => {
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

  // Buckets (UI only)
  const buckets = useMemo(() => {
    const recommended: InboxItem[] = [];
    const maintenance: InboxItem[] = [];
    const notes: InboxItem[] = [];

    for (const it of visibleItems) {
      if (isEngineV2Insight(it)) recommended.push(it);
      else if (isEngineV1Reminder(it)) maintenance.push(it);
      else notes.push(it);
    }

    return { recommended, maintenance, notes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  // optional: open Maintenance automatically if it's small (so it doesn't feel "lost")
  useEffect(() => {
    // keep the default "calm": closed when noisy
    if (buckets.maintenance.length > 0 && buckets.maintenance.length <= 2) {
      setOpenMaintenance(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets.maintenance.length]);

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
      setLastLoadedAt(new Date());
      setStatusLine("Added.");
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

    setItems((prev) => prev.map((it) => (it.status === "snoozed" ? { ...it, status: "open", snoozed_until: null } : it)));
    setLastLoadedAt(new Date());
    setStatusLine("All snoozed items are now open.");
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
    setLastLoadedAt(new Date());
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
    setLastLoadedAt(new Date());
    setStatusLine("Done.");
  };

  const snoozeItemUntil = async (id: string, untilIso: string, label: string) => {
    if (!userId) return;

    setAffirmation(null);
    setStatusLine("Snoozing...");

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "snoozed", snoozed_until: untilIso })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Snooze failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "snoozed", snoozed_until: untilIso } : it)));
    clearPerItemInputs(id);
    setLastLoadedAt(new Date());
    setStatusLine(`Snoozed (${label}).`);
  };

  const snoozeItemMinutes = async (id: string, mins: number) => {
    const until = isoNowPlusMinutes(mins);
    return snoozeItemUntil(id, until, `${mins}m`);
  };

  const snooze24h = async (id: string) => {
    const until = isoNowPlusHours(24);
    return snoozeItemUntil(id, until, "24h");
  };

  const snooze7d = async (id: string) => {
    const until = isoNowPlusDays(7);
    return snoozeItemUntil(id, until, "7d");
  };

  const unsnoozeToOpen = async (id: string) => {
    if (!userId) return;

    setAffirmation(null);
    setStatusLine("Unsnoozing...");

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "open", snoozed_until: null })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Unsnooze failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "open", snoozed_until: null } : it)));
    clearPerItemInputs(id);
    setLastLoadedAt(new Date());
    setStatusLine("Back in your inbox.");
  };

  const autoResolveWithUndo = async (it: InboxItem, message = "Marked done") => {
    if (!userId) return;

    const prevStatus = it.status;
    const prevSnooze = it.snoozed_until ?? null;

    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "done", snoozed_until: null } : x)));
    clearPerItemInputs(it.id);
    setLastLoadedAt(new Date());

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "done", snoozed_until: null })
      .eq("id", it.id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Auto-resolve failed: ${error.message}`);
      loadRef.current({ silent: true });
      return;
    }

    showToast(
      {
        message,
        undoLabel: "Undo",
        onUndo: async () => {
          const { error: undoErr } = await supabase
            .from("decision_inbox")
            .update({ status: prevStatus, snoozed_until: prevSnooze })
            .eq("id", it.id)
            .eq("user_id", userId);

          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            loadRef.current({ silent: true });
            return;
          }

          setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: prevStatus, snoozed_until: prevSnooze } : x)));
          setLastLoadedAt(new Date());
          setStatusLine("Undone.");
        },
      },
      8000
    );
  };

  const dismissAllRecommended = async () => {
    if (!userId) return;

    const ids = buckets.recommended.map((x) => x.id);
    if (ids.length === 0) {
      showToast({ message: "Nothing to clear." }, 2500);
      return;
    }

    setAffirmation(null);
    setStatusLine("Clearing recommended items...");

    setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, status: "done", snoozed_until: null } : it)));
    ids.forEach((id) => clearPerItemInputs(id));
    setLastLoadedAt(new Date());

    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "done", snoozed_until: null })
      .in("id", ids)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Clear failed: ${error.message}`);
      loadRef.current({ silent: true });
      return;
    }

    setStatusLine(`Cleared ${ids.length}.`);

    showToast(
      {
        message: `Cleared ${ids.length}.`,
        undoLabel: "Undo",
        onUndo: async () => {
          setStatusLine("Undoing clear...");

          const { error: undoErr } = await supabase
            .from("decision_inbox")
            .update({ status: "open", snoozed_until: null })
            .in("id", ids)
            .eq("user_id", userId);

          if (undoErr) {
            setStatusLine(`Undo failed: ${undoErr.message}`);
            loadRef.current({ silent: true });
            return;
          }

          setItems((prev) => prev.map((it) => (ids.includes(it.id) ? { ...it, status: "open", snoozed_until: null } : it)));
          setLastLoadedAt(new Date());
          setStatusLine("Undone.");
        },
      },
      8000
    );
  };

  const decideNowAndCloseInboxItem = async (item: InboxItem) => {
    if (!userId) return;

    try {
      setStatusLine("Saving decision...");
      setAffirmation(null);

      const userReason = (decisionReason[item.id] ?? "").trim() ? (decisionReason[item.id] ?? "").trim() : null;
      const confidenceLevel = decisionConfidence[item.id] ?? 2;

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
      setLastLoadedAt(new Date());

      setStatusLine("Decision saved.");

      showToast(
        {
          message: "Decision saved.",
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

            setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: "open", snoozed_until: null } : it)));
            setLastLoadedAt(new Date());
            setStatusLine("Undone.");
          },
        },
        8000
      );
    } catch (e: any) {
      setStatusLine(e?.message ?? "Failed to save decision");
    }
  };

  const promoteInboxItemToDecision = async (item: InboxItem) => {
    if (!userId) return;

    try {
      setStatusLine("Promoting to Decisions...");
      setAffirmation(null);

      const status = PROMOTED_STATUS;
      const decided_at = status === "decided" ? new Date().toISOString() : null;

      const { data: inserted, error: insertError } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          inbox_item_id: item.id,
          title: item.title,
          context: item.body ?? null,

          status,
          decided_at,

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
        setStatusLine(`Promote failed: ${prettySupabaseError(insertError)}`);
        return;
      }

      const decisionId = inserted?.id as string | undefined;
      if (!decisionId) {
        setStatusLine("Promoted, but missing decision id (unexpected).");
        return;
      }

      const { error: closeError } = await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("id", item.id)
        .eq("user_id", userId);

      if (closeError) {
        setStatusLine(`Promoted, but couldn't close inbox item: ${closeError.message}`);
        return;
      }

      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: "done", snoozed_until: null } : it)));
      clearPerItemInputs(item.id);
      setLastLoadedAt(new Date());

      setStatusLine("Promoted.");

      showToast(
        {
          message: "Promoted to Decisions.",
          undoLabel: "Undo",
          onUndo: async () => {
            setStatusLine("Undoing promotion...");

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

            setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: "open", snoozed_until: null } : it)));
            setLastLoadedAt(new Date());
            setStatusLine("Undone.");
          },
        },
        8000
      );
    } catch (e: any) {
      setStatusLine(e?.message ?? "Promote failed");
    }
  };

  const minutesAgo = lastLoadedAt ? Math.floor((clock - lastLoadedAt.getTime()) / 60000) : null;

  const liveBadge = () => {
    if (liveStatus === "live") return { text: "Live", variant: "success" as const };
    if (liveStatus === "connecting") return { text: "Connecting…", variant: "warning" as const };
    return { text: "Offline", variant: "danger" as const };
  };

  const badge = liveBadge();

  // ---------- UI helpers ----------
  const SectionHeader = ({
    title,
    count,
    description,
    tone = "zinc",
    open,
    onToggle,
    actions,
  }: {
    title: string;
    count: number;
    description?: string;
    tone?: "zinc" | "sky" | "amber";
    open: boolean;
    onToggle: () => void;
    actions?: ReactNode;
  }) => {
    const toneClasses =
      tone === "sky"
        ? "border-sky-200 bg-sky-50"
        : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-zinc-200 bg-zinc-50";

    return (
      <Card className={toneClasses}>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-base font-semibold tracking-tight">{title}</h2>
              <Badge variant="muted">{count}</Badge>

              <Button variant="secondary" onClick={onToggle} title={open ? "Hide section" : "Show section"}>
                {open ? "Hide" : "Show"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
          </div>

          {description && <div className="mt-2 text-xs text-zinc-600">{description}</div>}
        </CardContent>
      </Card>
    );
  };

  const renderItemCard = (it: InboxItem) => {
    const b = severityBadge(it.severity);
    const s = severityStyle(it.severity);

    const isV2 = isEngineV2Insight(it);
    const isV1 = isEngineV1Reminder(it);
    const isEng = isEngineItem(it);

    const kind: "v2" | "v1" | null = isV2 ? "v2" : isV1 ? "v1" : null;
    const insightsDigest = isInsightsDigest(it);

    const analysis = aiPreview[it.id];
    const loading = !!aiLoading[it.id];
    const err = aiError[it.id];

    const hasShortcutAction = !!it.action_href;
    const activelySnoozed = isActivelySnoozed(it, now);

    const expanded = !!openItem[it.id];
    const advOpen = !!showAdvanced[it.id];

    const subtitle =
      activelySnoozed && it.snoozed_until
        ? `Snoozed until ${formatWhen(it.snoozed_until)}`
        : it.body
        ? snippet(it.body, 120)
        : isV2
        ? "Recommended based on your current inputs."
        : isV1
        ? "Maintenance item to keep things accurate."
        : "Note you captured.";

    return (
      <Card key={it.id} className={engineCardClasses(s, kind)}>
        <CardContent>
          <div className="space-y-3">
            {/* ---- collapsed summary row ---- */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleItem(it.id)}
                className="flex min-w-[280px] flex-1 flex-col gap-1 text-left"
                aria-expanded={expanded}
                title={expanded ? "Collapse" : "Expand"}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-base">{it.title}</strong>

                  <Badge variant={b.variant}>{b.label}</Badge>

                  {isV2 && <Chip>Recommended</Chip>}
                  {isV1 && <Chip>Maintenance</Chip>}
                  {!isV2 && !isV1 && isEng && <Chip>Engine</Chip>}
                  {!isEng && <Chip>My note</Chip>}

                  {activelySnoozed && <Chip>Snoozed</Chip>}

                  {insightsDigest && (
                    <Chip
                      active={false}
                      onClick={(e) => {
                        e.stopPropagation?.();
                        router.push("/engine");
                      }}
                      title="Open Engine"
                    >
                      Digest
                    </Chip>
                  )}
                </div>

                <div className="text-xs text-zinc-600">{subtitle}</div>

                <div className="mt-1 text-xs text-zinc-500">{expanded ? "Collapse" : "Expand"}</div>
              </button>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {it.action_href && (
                  <Button
                    variant="secondary"
                    onClick={async (e) => {
                      e.stopPropagation?.();
                      await autoResolveWithUndo(it, "Shortcut used.");
                      router.push(it.action_href!);
                    }}
                    title="Use this and jump to the right place"
                  >
                    {it.action_label ?? "Open"}
                  </Button>
                )}

                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation?.();
                    setItemOpen(it.id, true);
                  }}
                  title="Expand details"
                >
                  Expand
                </Button>

                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation?.();
                    snooze24h(it.id);
                  }}
                  title="Hide until tomorrow"
                >
                  Snooze 24h
                </Button>
              </div>
            </div>

            {/* ---- expanded details ---- */}
            {expanded ? (
              <div className="space-y-3">
                {/* context / why */}
                {isV2 && (
                  <div className="text-xs text-zinc-500">
                    Why this is here: based on your current inputs (no forecasting).{" "}
                    {hasShortcutAction ? "Using the action will clear this item." : ""}
                  </div>
                )}
                {isV1 && (
                  <div className="text-xs text-zinc-500">
                    Why this is here: keeping your system accurate and up to date.{" "}
                    {hasShortcutAction ? "Using the action will clear this item." : ""}
                  </div>
                )}
                {!isV2 && !isV1 && isEng && <div className="text-xs text-zinc-500">Engine note.</div>}

                {it.body && <div className="whitespace-pre-wrap text-sm text-zinc-800">{it.body}</div>}

                {/* digest shortcuts */}
                {insightsDigest && (
                  <Card className="bg-white">
                    <CardContent>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-zinc-600">
                          Shortcut actions — use the insight, then come back. (This digest will clear itself.)
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            onClick={async () => {
                              await autoResolveWithUndo(it, "Digest cleared.");
                              router.push("/decisions?tab=review");
                            }}
                          >
                            Review decisions
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={async () => {
                              await autoResolveWithUndo(it, "Digest cleared.");
                              router.push("/engine");
                            }}
                          >
                            Open Engine
                          </Button>

                          <Button variant="secondary" onClick={() => snooze24h(it.id)}>
                            Snooze 24h
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Primary vs secondary actions */}
                <Card className="bg-white">
                  <CardContent>
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-zinc-900">Next step</div>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => decideNowAndCloseInboxItem(it)} title="Save a decision and clear this item">
                          Decide now
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => snooze24h(it.id)}
                          title="Hide this until tomorrow"
                        >
                          Snooze 24h
                        </Button>

                        <Button variant="secondary" onClick={() => snooze7d(it.id)} title="Hide this for a week">
                          Snooze 7d
                        </Button>

                        {activelySnoozed && (
                          <Button variant="secondary" onClick={() => unsnoozeToOpen(it.id)}>
                            Unsnooze
                          </Button>
                        )}

                        <Button
                          variant="secondary"
                          onClick={() => toggleAdvanced(it.id)}
                          title={advOpen ? "Hide advanced actions" : "Show advanced actions"}
                        >
                          {advOpen ? "Hide advanced" : "Advanced"}
                        </Button>
                      </div>

                      <div className="text-xs text-zinc-500">
                        Tip: If you’re not ready to decide, snooze it. If it’s fully handled, mark it done.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Advanced */}
                {advOpen ? (
                  <Card className="bg-zinc-50">
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900">Advanced</div>
                          <Button variant="secondary" onClick={() => setAdvancedOpen(it.id, false)}>
                            Hide
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button variant="secondary" onClick={() => promoteInboxItemToDecision(it)}>
                            Promote to Decisions
                          </Button>

                          <Button variant="secondary" onClick={() => doneItem(it.id)}>
                            Mark done
                          </Button>

                          <Button variant="secondary" onClick={() => snoozeItemMinutes(it.id, 10)} title="Short snooze">
                            Snooze 10m
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => updateSeverity(it.id, (it.severity ?? 2) - 1)}
                            title="Raise priority (towards Top)"
                          >
                            Raise priority
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => updateSeverity(it.id, (it.severity ?? 2) + 1)}
                            title="Lower priority (towards Low)"
                          >
                            Lower priority
                          </Button>

                          <Button variant="secondary" onClick={() => setItemOpen(it.id, false)} title="Collapse details">
                            Collapse
                          </Button>
                        </div>

                        {/* AI */}
                        <div className="space-y-2">
                          <Button variant="secondary" onClick={() => analyzeItem(it)} disabled={loading}>
                            {loading ? "Analyzing…" : analysis ? "Re-analyze with AI" : "Analyze with AI"}
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

                        {/* decision inputs */}
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
                                  onChange={() => setDraftConfidence(it.id, level)}
                                />
                                {level === 1 ? "Low" : level === 2 ? "Medium" : "High"}
                              </label>
                            ))}
                          </div>

                          <textarea
                            placeholder="Reason (optional)"
                            value={decisionReason[it.id] ?? ""}
                            onChange={(e) => setDraftReason(it.id, e.target.value)}
                            className="w-full min-h-[70px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                          />
                        </div>

                        <div className="text-xs text-zinc-500">
                          type: {it.type} • severity: {it.severity ?? 2} • id: {it.id}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  // If advanced is hidden, still keep inputs lightly accessible (not mandatory)
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500">Optional: add a reason before deciding</div>
                    <textarea
                      placeholder="Reason (optional)"
                      value={decisionReason[it.id] ?? ""}
                      onChange={(e) => setDraftReason(it.id, e.target.value)}
                      className="w-full min-h-[60px] rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const minutesAgoText =
    !lastLoadedAt ? "" : minutesAgo !== null && minutesAgo < 1 ? "just now" : `${minutesAgo ?? 0}m ago`;

  const badgeVariant = badge.variant;

  // ---------- top bar actions ----------
  const updateNow = () => loadRef.current({ silent: false });

  // ---------- UI ----------
  return (
    <Page
      title="Inbox"
      subtitle={
        <div className="space-y-1">
          {email && <div>Signed in as: {email}</div>}
          <div className="text-zinc-700">{statusLine}</div>
          {lastLoadedAt && <div className="text-xs text-zinc-500">Updated {minutesAgoText}</div>}
        </div>
      }
      right={
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant}>● {badge.text}</Badge>

          <Button onClick={updateNow}>Update now</Button>

          <Button variant="secondary" onClick={() => router.push("/decisions?tab=review")}>
            Review decisions
          </Button>

          <Button variant="secondary" onClick={() => router.push("/engine")}>
            Run Engine
          </Button>

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

      {/* Orientation */}
      <Card className="bg-zinc-50">
        <CardContent>
          <div className="text-sm text-zinc-700">
            Start with <strong>Recommended</strong>. If you’re not ready to decide, <strong>Snooze</strong>. If it’s handled, mark it done.
          </div>
        </CardContent>
      </Card>

      {/* ---- quick capture ---- */}
      <Card>
        <CardContent>
          <div className="space-y-3">
            <div className="text-sm text-zinc-600">Add a quick note</div>

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
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- sections ---- */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold tracking-tight">What to do next</h2>
          <div className="text-xs text-zinc-500">
            Snoozed items hide until they’re due. Recommended items are based on your current inputs — no forecasting.
          </div>
        </div>

        <div className="grid gap-3">
          <SectionHeader
            title="Recommended"
            count={buckets.recommended.length}
            description="Higher-signal nudges & patterns. Use these first if you’re not sure what to do next."
            tone="sky"
            open={openRecommended}
            onToggle={() => setOpenRecommended((v) => !v)}
            actions={
              <>
                <Button variant="secondary" onClick={() => router.push("/engine")} title="Open Engine and run a fresh pass">
                  Run Engine
                </Button>

                <Button
                  variant="secondary"
                  onClick={dismissAllRecommended}
                  disabled={buckets.recommended.length === 0}
                  title="Clear all recommended items (you can undo)"
                >
                  Clear all
                </Button>
              </>
            }
          />

          {openRecommended ? (
            buckets.recommended.length ? (
              buckets.recommended.map(renderItemCard)
            ) : (
              <Card className="bg-white">
                <CardContent>
                  <div className="text-sm text-zinc-700">No recommendations right now.</div>
                  <div className="text-xs text-zinc-500">You can run Engine if you want a fresh pass.</div>
                </CardContent>
              </Card>
            )
          ) : null}

          <SectionHeader
            title="Maintenance"
            count={buckets.maintenance.length}
            description="These keep your dashboard correct. A few minutes here prevents bigger issues later."
            tone="amber"
            open={openMaintenance}
            onToggle={() => setOpenMaintenance((v) => !v)}
          />

          {openMaintenance ? (
            buckets.maintenance.length ? (
              buckets.maintenance.map(renderItemCard)
            ) : (
              <Card className="bg-white">
                <CardContent>
                  <div className="text-sm text-zinc-700">Nothing to maintain right now.</div>
                  <div className="text-xs text-zinc-500">All up to date.</div>
                </CardContent>
              </Card>
            )
          ) : null}

          <SectionHeader
            title="My notes"
            count={buckets.notes.length}
            description="Things you captured. Decide, snooze, or promote to Decisions."
            tone="zinc"
            open={openNotes}
            onToggle={() => setOpenNotes((v) => !v)}
          />

          {openNotes ? (
            buckets.notes.length ? (
              buckets.notes.map(renderItemCard)
            ) : (
              <Card className="bg-white">
                <CardContent>
                  <div className="text-sm text-zinc-700">No notes yet.</div>
                  <div className="text-xs text-zinc-500">Add something above to capture it.</div>
                </CardContent>
              </Card>
            )
          ) : null}

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
