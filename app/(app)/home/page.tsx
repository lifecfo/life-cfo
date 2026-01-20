// app/(app)/home/page.tsx
"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Badge, Card, CardContent, useToast, Chip } from "@/components/ui";
import { Page } from "@/components/Page";

export const dynamic = "force-dynamic";

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

type Bill = {
  id: string;
  user_id: string;
  merchant_key: string;
  nickname: string | null;
  due_day_or_date: string;
  expected_amount: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
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

  // ✅ section-level collapse (calm defaults)
  const [openRecommended, setOpenRecommended] = useState(false);
  const [openMaintenance, setOpenMaintenance] = useState(false);
  const [openNotes, setOpenNotes] = useState(false);

  // ✅ item-level collapse (collapsed by default)
  const [openItem, setOpenItem] = useState<Record<string, boolean>>({});

  // ✅ Action hierarchy: keep advanced controls tucked away
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({});

  // ✅ Hide “how it’s calculated” unless asked (per-item)
  const [showFormula, setShowFormula] = useState<Record<string, boolean>>({});

  // ✅ Bills snapshot (calm, collapsed)
  const [bills, setBills] = useState<Bill[]>([]);
  const [openComingUp, setOpenComingUp] = useState(false);

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

    setShowFormula((prev) => {
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

    // Neutral brand-ready bar (won't fight status colors)
    const left = "border-l-4 border-l-zinc-300";
    return `${base.border} ${left} bg-white`;
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

  // “All clear” helper for autopay checks (keeps it visible but de-emphasised)
  const isAutopayAllClear = (it: InboxItem) => {
    if (!isEngineV1Reminder(it)) return false;

    const title = (it.title ?? "").toLowerCase();
    const body = (it.body ?? "").toLowerCase();

    const looksLikeAutopay =
      title.includes("autopay") ||
      title.includes("auto pay") ||
      title.includes("auto-pay") ||
      body.includes("autopay") ||
      body.includes("auto pay") ||
      body.includes("auto-pay");

    if (!looksLikeAutopay) return false;

    const allClearSignals = [
      "no near-term",
      "no near term",
      "no immediate",
      "no bills due",
      "nothing due",
      "all bills due",
      "next 7 days",
      "next seven days",
      "no risks",
      "all clear",
      "up to date",
    ];

    return allClearSignals.some((p) => body.includes(p));
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

  const toggleFormula = (id: string) => {
    setShowFormula((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const normalizeActionLabel = (it: InboxItem) => {
    const raw = (it.action_label ?? "Open").trim();
    if (!raw) return "Open";
    if (/review bills/i.test(raw)) return "Review bills";
    if (it.action_href && it.action_href.includes("/decisions")) return "Review decisions";
    if (it.action_href && it.action_href.includes("/income")) return "Open income";
    if (it.action_href && it.action_href.includes("/bills")) return "Review bills";
    return raw;
  };

  const parseDueDay = (s: string) => {
    const n = parseInt(String(s ?? "").trim(), 10);
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 31) return null;
    return n;
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

    // Bills snapshot (top 5, calm)
    const { data: billsData, error: billsError } = await supabase
      .from("bills")
      .select("id,user_id,merchant_key,nickname,due_day_or_date,expected_amount,status,created_at,updated_at")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (billsError) {
      // Don't block Home if this fails; just keep it quiet.
      setBills([]);
    } else {
      setBills((billsData ?? []) as Bill[]);
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

    // Realtime subscription: bills changes for this user (keeps “Coming up” accurate)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`bills-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bills",
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
            // best effort fallback
            loadRef.current({ silent: true });
            return;
          }

          const toBill = (r: any): Bill => ({
            id: r.id,
            user_id: r.user_id,
            merchant_key: r.merchant_key ?? "",
            nickname: r.nickname ?? null,
            due_day_or_date: r.due_day_or_date ?? "",
            expected_amount: r.expected_amount ?? null,
            status: r.status ?? "active",
            created_at: r.created_at ?? null,
            updated_at: r.updated_at ?? null,
          });

          setBills((prev) => {
            if (eventType === "INSERT") {
              if (!newRow) return prev;
              const b = toBill(newRow);
              const exists = prev.some((x) => x.id === b.id);
              return exists ? prev.map((x) => (x.id === b.id ? { ...x, ...b } : x)) : [b, ...prev];
            }

            if (eventType === "UPDATE") {
              if (!newRow) return prev;
              const b = toBill(newRow);
              const exists = prev.some((x) => x.id === b.id);
              return exists ? prev.map((x) => (x.id === b.id ? { ...x, ...b } : x)) : [b, ...prev];
            }

            if (eventType === "DELETE") {
              return prev.filter((x) => x.id !== id);
            }

            return prev;
          });

          setLastLoadedAt(new Date());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
  if (isEngineV2Insight(it)) {
    recommended.push(it);
  } else if (isEngineV1Reminder(it)) {
    // Hide “all clear” autopay checks from Home
    if (!isAutopayAllClear(it)) maintenance.push(it);
  } else {
    notes.push(it);
  }
}

    const createdMs = (x: InboxItem) => (x.created_at ? Date.parse(x.created_at) || 0 : 0);

    // Recommended: highest priority first, then newest
    recommended.sort((a, b) => {
      const sa = a.severity ?? 2;
      const sb = b.severity ?? 2;
      if (sa !== sb) return sa - sb; // 1 first
      return createdMs(b) - createdMs(a);
    });

    // Maintenance: actionable first, then priority, then newest
    maintenance.sort((a, b) => {
      const aa = isAutopayAllClear(a) ? 1 : 0; // 0 first, 1 last
      const bb = isAutopayAllClear(b) ? 1 : 0;
      if (aa !== bb) return aa - bb;

      const sa = a.severity ?? 2;
      const sb = b.severity ?? 2;
      if (sa !== sb) return sa - sb;

      return createdMs(b) - createdMs(a);
    });

    // Notes: newest first
    notes.sort((a, b) => createdMs(b) - createdMs(a));

    return { recommended, maintenance, notes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems]);

  const upcomingBills = useMemo(() => {
    const list = [...(bills ?? [])].filter((b) => (b.status ?? "active") === "active");

    const createdMs = (x: Bill) => (x.created_at ? Date.parse(x.created_at) || 0 : 0);

    // Best-effort sort:
    // - numeric due_day_or_date (1–31) first, ascending
    // - then everything else, newest first
    list.sort((a, b) => {
      const da = parseDueDay(a.due_day_or_date);
      const db = parseDueDay(b.due_day_or_date);

      if (da != null && db != null) return da - db;
      if (da != null && db == null) return -1;
      if (da == null && db != null) return 1;

      return createdMs(b) - createdMs(a);
    });

    return list.slice(0, 5);
  }, [bills]);

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
    setStatusLine("Adding...");

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

  // ✅ strongly typed
  const liveBadge = (): { text: string; variant: "success" | "warning" | "danger" } => {
    if (liveStatus === "live") return { text: "Live", variant: "success" };
    if (liveStatus === "connecting") return { text: "Connecting…", variant: "warning" };
    return { text: "Offline", variant: "danger" };
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
    tone?: "zinc" | "brand";
    open: boolean;
    onToggle: () => void;
    actions?: ReactNode;
  }) => {
    const toneClasses = "border-zinc-200 bg-white";
    const leftBar = "border-l-4 border-l-zinc-300";

    return (
      <Card className={`${toneClasses} ${leftBar}`}>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-[260px] flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
                <Badge variant="muted">{count}</Badge>

                <Chip onClick={onToggle} title={open ? "Hide this section" : "Show this section"}>
                  {open ? "Hide" : "Show"}
                </Chip>
              </div>

              {description && <div className="text-xs text-zinc-700">{description}</div>}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderBodySmart = (it: InboxItem) => {
    const raw = (it.body ?? "").trim();
    if (!raw) return null;

    const lines = raw.split("\n").map((l) => l.trimEnd());
    const truthIdx = lines.findIndex((l) => l.toLowerCase().startsWith("truth reminder"));

    const mainLines = truthIdx >= 0 ? lines.slice(0, truthIdx) : lines;
    const truthLines = truthIdx >= 0 ? lines.slice(truthIdx) : [];

    const show = !!showFormula[it.id];

    const renderLine = (line: string, idx: number) => {
      const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
      if (!m) return <div key={idx}>{line}</div>;
      const label = m[1];
      const value = m[2];
      return (
        <div key={idx}>
          <strong className="text-zinc-900">{label}:</strong> {value}
        </div>
      );
    };

    return (
      <div className="space-y-3">
        {/* Main content */}
        <div className="space-y-1 whitespace-pre-wrap text-sm text-zinc-800">
          {mainLines.map((l, idx) => (l.trim() ? renderLine(l, idx) : <div key={idx} className="h-2" />))}
        </div>

        {/* “How it’s calculated” (power-user) */}
        {truthLines.length > 0 ? (
          <div className="space-y-2">
            <Chip
              onClick={() => toggleFormula(it.id)}
              title={show ? "Hide how it's calculated" : "Show how it's calculated"}
            >
              {show ? "Hide how it’s calculated" : "Show how it’s calculated"}
            </Chip>

            {show ? (
              <Card className="bg-zinc-50">
                <CardContent>
                  <div className="whitespace-pre-wrap text-xs text-zinc-700">{truthLines.join("\n")}</div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderItemCard = (it: InboxItem) => {
    const autopayAllClear = isAutopayAllClear(it);

    // De-emphasise “all clear” items so they never feel like “Top priority”
    const b = autopayAllClear ? { label: "All clear", variant: "success" as const } : severityBadge(it.severity);
    const s = autopayAllClear ? { border: "border-emerald-200", bg: "bg-emerald-50" } : severityStyle(it.severity);

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
  autopayAllClear
    ? "All clear — nothing due soon."
    : activelySnoozed && it.snoozed_until
      ? `Snoozed until ${formatWhen(it.snoozed_until)}`
      : isV2
        ? "Worth a look when you’re ready."
        : isV1
          ? "A quick check to keep things tidy."
          : it.body
            ? snippet(it.body, 120)
            : "Note you captured.";


    const shortcutLabel = it.action_href ? normalizeActionLabel(it) : null;

    return (
      <Card key={it.id} className={engineCardClasses(s, kind)}>
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleItem(it.id)}
                className="flex min-w-[280px] flex-1 flex-col gap-1 text-left"
                aria-expanded={expanded}
                title={expanded ? "Collapse details" : "Expand details"}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-zinc-900">{it.title}</span>

                  <Badge variant={b.variant}>{b.label}</Badge>

                  {isV2 && <Chip>For you</Chip>}
                  {isV1 && <Chip>Check</Chip>}
                  {!isV2 && !isV1 && isEng && <Chip>Check</Chip>}
                  {!isEng && <Chip>Note</Chip>}


                  {activelySnoozed && <Chip>Snoozed</Chip>}

                  {insightsDigest && (
                    <Chip
                      active={false}
                      onClick={(e) => {
                        e.stopPropagation?.();
                        router.push("/decisions?tab=review");
                      }}
                      title="Review decisions"
                    >
                      Review
                    </Chip>
                  )}
                </div>

                <div className="text-xs text-zinc-700">{subtitle}</div>
                <div className="mt-1 text-xs text-zinc-500">{expanded ? "Collapse" : "Expand"}</div>
              </button>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {it.action_href && (
                  <Chip
                    onClick={async (e) => {
                      e.stopPropagation?.();
                      await autoResolveWithUndo(it, "Opened.");
                      router.push(it.action_href!);
                    }}
                    title="Open the right place (this will clear the item)"
                  >
                    {shortcutLabel}
                  </Chip>
                )}

                <Chip
                  onClick={(e) => {
                    e.stopPropagation?.();
                    toggleItem(it.id);
                  }}
                  title={expanded ? "Collapse details" : "Expand details"}
                >
                  {expanded ? "Collapse" : "Expand"}
                </Chip>

                <Chip
                  onClick={(e) => {
                    e.stopPropagation?.();
                    snooze24h(it.id);
                  }}
                  title="Hide until tomorrow"
                >
                  Snooze 24h
                </Chip>
              </div>
            </div>

            {expanded ? (
              <div className="space-y-4">
                <div className="flex items-center justify-end">
                  <Chip onClick={() => setItemOpen(it.id, false)} title="Collapse details">
                    Hide details
                  </Chip>
                </div>

                {renderBodySmart(it)}

                {insightsDigest && (
                  <Card className="bg-white">
                    <CardContent>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-zinc-700">
                        A few decisions are ready to review.
                        </div>


                        <div className="flex flex-wrap gap-2">
                          <Chip
                            onClick={async () => {
                              await autoResolveWithUndo(it, "Done.");
                              router.push("/decisions?tab=review");
                            }}
                          >
                            Review decisions
                          </Chip>

                          <Chip onClick={() => snooze24h(it.id)}>
                            Snooze 24h
                          </Chip>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="bg-white">
                  <CardContent>
                    <div className="space-y-3">
                     <div className="text-sm font-semibold text-zinc-900">Actions</div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Chip onClick={() => decideNowAndCloseInboxItem(it)} title="Save a decision and clear this item">
                          Save decision
                        </Chip>

                        <Chip onClick={() => snooze24h(it.id)} title="Hide this until tomorrow">
                          Snooze
                        </Chip>

                        <Chip
                          onClick={() => toggleAdvanced(it.id)}
                          title={advOpen ? "Hide advanced actions" : "Show advanced actions"}
                        >
                          {advOpen ? "Hide advanced" : "Advanced"}
                        </Chip>

                        {activelySnoozed && (
                          <Chip onClick={() => unsnoozeToOpen(it.id)} title="Bring back now">
                            Unsnooze
                          </Chip>
                        )}
                      </div>

                     <div className="text-xs text-zinc-500">
                      Snooze it if you’re not ready. Mark done if it’s handled.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {advOpen ? (
                  <Card className="bg-zinc-50">
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900">Advanced</div>
                          <Chip onClick={() => setAdvancedOpen(it.id, false)}>
                            Hide
                          </Chip>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Chip onClick={() => promoteInboxItemToDecision(it)}>
                            Promote to Decisions
                          </Chip>

                          <Chip onClick={() => doneItem(it.id)}>
                            Mark done
                          </Chip>

                          <Chip onClick={() => snooze7d(it.id)} title="Hide this for a week">
                            Snooze 7d
                          </Chip>

                          <Chip onClick={() => snoozeItemMinutes(it.id, 10)} title="Short snooze">
                            Snooze 10m
                          </Chip>

                          <Chip
                            onClick={() => updateSeverity(it.id, (it.severity ?? 2) - 1)}
                            title="Raise priority (towards Top)"
                          >
                            Raise priority
                          </Chip>

                          <Chip
                            onClick={() => updateSeverity(it.id, (it.severity ?? 2) + 1)}
                            title="Lower priority (towards Low)"
                          >
                            Lower priority
                          </Chip>
                        </div>

                        <div className="space-y-2">
                          <Chip onClick={() => analyzeItem(it)} disabled={loading}>
                            {loading ? "Analyzing…" : analysis ? "Re-analyze with AI" : "Analyze with AI"}
                          </Chip>

                          {err && <div className="text-xs text-red-700">AI error: {err}</div>}

                          {analysis && (
                            <Card className="border-sky-200 bg-sky-50">
                              <CardContent>
                                <div className="space-y-3">
                                  <div className="text-xs text-zinc-600">AI analysis</div>

                                  <div className="flex flex-wrap gap-2 text-xs text-zinc-700">
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
                          <div className="text-xs text-zinc-600">How confident do you feel about this?</div>

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

                        {process.env.NODE_ENV === "development" && (
                          <div className="text-xs text-zinc-500">
                            type: {it.type} • severity: {it.severity ?? 2} • id: {it.id}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-600">Optional: add a reason before deciding</div>
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

  const minutesAgoText = !lastLoadedAt
    ? ""
    : minutesAgo !== null && minutesAgo < 1
      ? "just now"
      : `${minutesAgo ?? 0}m ago`;

  const updateNow = () => loadRef.current({ silent: false });

  return (
    <Page
      title="Home"
      subtitle={
        <div className="space-y-1">
         {lastLoadedAt && <div className="text-xs text-zinc-500">Updated {minutesAgoText}</div>}
        </div>
      }
      right={
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>● {badge.text}</Badge>

          <Chip onClick={() => router.push("/decisions?tab=review")}>
            Review decisions
          </Chip>

          {process.env.NODE_ENV === "development" && (
            <Chip onClick={forceUnsnoozeAll}>
              Force Unsnooze (dev)
            </Chip>
          )}
        </div>
      }
    >
      {affirmation && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="text-sm text-emerald-900">{affirmation}</CardContent>
        </Card>
      )}

      {/* Quick note */}
      <Card className="border-zinc-200 bg-white">
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-zinc-900">Quick note</div>
                <div className="text-xs text-zinc-700">Add something you don’t want to forget. Saves to Notes.</div>
              </div>
            </div>

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

              <Chip onClick={addManualInboxItem} disabled={adding}>
                {adding ? "Adding…" : "Add"}
              </Chip>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coming up (Bills snapshot) */}
      {upcomingBills.length > 0 ? (
        <Card className="border-zinc-200 bg-white border-l-4 border-l-zinc-300">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-[260px] flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="m-0 text-lg font-semibold tracking-tight text-zinc-900">Coming up</h2>
                  <Badge variant="muted">{upcomingBills.length}</Badge>

                  <Chip
                    onClick={() => setOpenComingUp((v) => !v)}
                    title={openComingUp ? "Hide coming up" : "Show coming up"}
                  >
                    {openComingUp ? "Hide" : "Show"}
                  </Chip>
                </div>

                <div className="text-xs text-zinc-700">Your next bills.</div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Chip onClick={() => router.push("/bills")} title="Open bills">
                  View bills
                </Chip>
              </div>
            </div>

            {openComingUp ? (
              <div className="mt-3 space-y-2">
                {upcomingBills.map((b) => {
                  const title = (b.nickname ?? "").trim() ? (b.nickname as string) : b.merchant_key;
                  const amount =
                    b.expected_amount == null || Number.isNaN(Number(b.expected_amount))
                      ? null
                      : Number(b.expected_amount);

                  return (
                    <Card key={b.id} className="bg-white">
                      <CardContent>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-[220px] flex-1">
                            <div className="text-sm font-semibold text-zinc-900">{title}</div>
                            <div className="text-xs text-zinc-600">Due: {b.due_day_or_date}</div>
                          </div>

                          <div className="text-sm text-zinc-700">
                            {amount != null ? `$${amount.toFixed(2)}` : ""}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2 text-xs text-zinc-500">
                {upcomingBills.length === 1 ? "Listed." : `${upcomingBills.length} Listed.`}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Sections */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
         <h2 className="m-0 text-lg font-semibold tracking-tight text-zinc-900">Items for review</h2>
<div className="text-xs text-zinc-500">Snoozed items return automatically.</div>
        </div>

        <div className="grid gap-3">
          <SectionHeader
            title="Priority items"
            count={buckets.recommended.length}
            description="Look at these first."
            tone="brand"
            open={openRecommended}
            onToggle={() => setOpenRecommended((v) => !v)}
            actions={
              <>
                <Chip
                  onClick={dismissAllRecommended}
                  disabled={buckets.recommended.length === 0}
                  title="Clear all recommended items (you can undo)"
                >
                  Clear all
                </Chip>
              </>
            }
          />

          {openRecommended ? (
            <div className="space-y-3 rounded-xl border border-zinc-100 bg-white/40 p-3">
              {buckets.recommended.length ? (
                buckets.recommended.map(renderItemCard)
              ) : (
                <Card className="bg-white">
                  <CardContent>
                    <div className="text-sm text-zinc-700">You’re up to date.</div>
                    <div className="text-xs text-zinc-500">Updated {minutesAgoText}.</div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}

          <SectionHeader
            title="Housekeeping"
            count={buckets.maintenance.length}
            description="Check when you have time. Keeps things running smoothly and prevents bigger issues later."
            tone="brand"
            open={openMaintenance}
            onToggle={() => setOpenMaintenance((v) => !v)}
          />

          {openMaintenance ? (
            <div className="space-y-3 rounded-xl border border-zinc-100 bg-white/40 p-3">
              {buckets.maintenance.length ? (
                buckets.maintenance.map(renderItemCard)
              ) : (
                <Card className="bg-white">
                  <CardContent>
                    <div className="text-sm text-zinc-700">All clear.</div>
                    <div className="text-xs text-zinc-500">Nothing needs attention.</div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}

          <SectionHeader
            title="Notes"
            count={buckets.notes.length}
            description="Things you've captured that you want to come back to."
            tone="brand"
            open={openNotes}
            onToggle={() => setOpenNotes((v) => !v)}
          />

          {openNotes ? (
            <div className="space-y-3 rounded-xl border border-zinc-100 bg-white/40 p-3">
              {buckets.notes.length ? (
                buckets.notes.map(renderItemCard)
              ) : (
                <Card className="bg-white">
                  <CardContent>
                    <div className="text-sm text-zinc-700">No notes yet.</div>
                    <div className="text-xs text-zinc-500">Use Capture above to add one.</div>
                  </CardContent>
                </Card>
              )}
            </div>
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
