// app/(app)/thinking/ThinkingClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, Card, CardContent, useToast } from "@/components/ui";
import { ConversationPanel } from "./ConversationPanel";
import { AttachmentsBlock } from "@/components/AttachmentsBlock";

// ✅ Assisted retrieval + tiles
import { AssistedSearch } from "@/components/AssistedSearch";
import { TilesRow } from "@/components/TilesRow";

// ✅ Notes (quiet)
import { DecisionNotes } from "@/components/decision/DecisionNotes";

export const dynamic = "force-dynamic";

type AttachmentMeta = {
  name: string;
  path: string; // storage path inside bucket
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

  attachments: AttachmentMeta[] | null; // decisions.attachments (jsonb)
};

type DecisionSummary = {
  id: string;
  user_id: string;
  decision_id: string;
  summary_text: string;
  created_at: string;
};

type Domain = {
  id: string;
  name: string;
  sort_order?: number | null;
};

type Constellation = {
  id: string;
  name: string;
  sort_order?: number | null;
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

function isoNowPlusDays(days: number) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
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

/**
 * Thinking context format (V1):
 * Stored in decisions.context as:
 *   Captured:
 *   <original capture text>
 *
 *   ---
 *   Draft:
 *   <editable draft body>
 */
function splitThinkingContext(context: string | null) {
  const raw = (context ?? "").trim();
  if (!raw) return { captured: "", draft: "" };

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
    return { captured, draft: draftPart };
  }

  const captured = raw.replace(/^Captured:\s*/i, "").trim();
  return { captured, draft: "" };
}

function composeThinkingContext(captured: string, draft: string) {
  const cap = (captured ?? "").trim();
  const dr = (draft ?? "").trim();

  if (!cap && !dr) return null;
  if (cap && !dr) return `Captured:\n${cap}`;
  if (!cap && dr) return dr;

  return `Captured:\n${cap}\n\n---\nDraft:\n${dr}`;
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

export default function ThinkingClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const openFromQuery = searchParams.get("open");

  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [drafts, setDrafts] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chatForId, setChatForId] = useState<string | null>(null);

  // ✅ Top-5 default (V1 pattern)
  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  // Summaries for the currently open draft (small, capped) — hidden unless present
  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);

  // ✅ Labels (tiles + assignment) — internal tables remain domains/constellations
  const [domains, setDomains] = useState<Domain[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);

  // decision_id -> domain_id
  const [domainByDecision, setDomainByDecision] = useState<Record<string, string | null>>({});
  // decision_id -> constellation_ids[]
  const [constellationsByDecision, setConstellationsByDecision] = useState<Record<string, string[]>>({});

  const loadRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});
  const reloadTimerRef = useRef<number | null>(null);

  // ✅ Card refs for scroll-to-open
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ✅ Inline label editor + revisit control state (per decision)
  const [labelsEditForId, setLabelsEditForId] = useState<string | null>(null);
  const [revisitModeById, setRevisitModeById] = useState<Record<string, "7" | "30" | "90" | "custom" | "">>({});
  const [customDateById, setCustomDateById] = useState<Record<string, string>>({});

  // ✅ Draft editor (single editable body — overwrite on save)
  const [isEditingDraftById, setIsEditingDraftById] = useState<Record<string, boolean>>({});
  const [draftTitleById, setDraftTitleById] = useState<Record<string, string>>({});
  const [draftBodyById, setDraftBodyById] = useState<Record<string, string>>({});

  // ✅ Keep a stable “Original capture” snapshot (read-only) per decision
  const [originalCaptureById, setOriginalCaptureById] = useState<Record<string, { title: string; captured: string }>>({});

  // ✅ Capture-style delete confirm (inline, stronger)
  const [confirmDeleteForId, setConfirmDeleteForId] = useState<string | null>(null);

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRef.current({ silent: true });
    }, 250);
  };

  const openDraft = useMemo(() => drafts.find((d) => d.id === openId) ?? null, [drafts, openId]);

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setStatusLine("Loading…");

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      setUserId(null);
      setDrafts([]);
      setStatusLine("Not signed in.");
      return;
    }

    const uid = auth.user.id;
    setUserId(uid);

    const { data, error } = await supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments")
      .eq("user_id", uid)
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    if (error) {
      setDrafts([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const listRaw = (data ?? []) as any[];
    const list: Decision[] = listRaw.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      title: r.title ?? "",
      context: r.context ?? null,
      status: r.status ?? "draft",
      created_at: r.created_at ?? new Date().toISOString(),
      decided_at: r.decided_at ?? null,
      review_at: r.review_at ?? null,
      origin: r.origin ?? null,
      framed_at: r.framed_at ?? null,
      attachments: normalizeAttachments(r.attachments),
    }));

    setDrafts(list);

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
        for (const row of ddRes.data ?? []) {
          next[String((row as any).decision_id)] = String((row as any).domain_id);
        }
        setDomainByDecision(next);
      } else {
        setDomainByDecision({});
      }

      if (!ciRes.error) {
        const next: Record<string, string[]> = {};
        for (const row of ciRes.data ?? []) {
          const did = String((row as any).decision_id);
          const cid = String((row as any).constellation_id);
          next[did] = next[did] ? [...next[did], cid] : [cid];
        }
        setConstellationsByDecision(next);
      } else {
        setConstellationsByDecision({});
      }
    } else {
      setDomainByDecision({});
      setConstellationsByDecision({});
    }

    setStatusLine(list.length === 0 ? "No drafts right now." : "Loaded.");
  };

  useEffect(() => {
    loadRef.current = (opts?: { silent?: boolean }) => void load(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();

    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Auto-open draft from query (?open=...) + scroll into view + clear param
  useEffect(() => {
    if (!openFromQuery) return;
    if (drafts.length === 0) return;

    const match = drafts.find((d) => d.id === openFromQuery);
    if (!match) return;

    setOpenId(match.id);
    setHighlightId(match.id);

    window.setTimeout(() => {
      const el = cardRefs.current[match.id];
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    router.replace("/thinking");

    const t = window.setTimeout(() => setHighlightId(null), 1600);
    return () => window.clearTimeout(t);
  }, [openFromQuery, drafts, router]);

  // Keep chat only for the open card
  useEffect(() => {
    setChatForId((cur) => {
      if (!cur) return null;
      if (!openId) return null;
      return cur === openId ? cur : null;
    });
  }, [openId]);

  // Close inline editors when changing open card
  useEffect(() => {
    setLabelsEditForId((cur) => (cur && openId && cur === openId ? cur : null));
    setConfirmDeleteForId((cur) => (cur && openId && cur === openId ? cur : null));
  }, [openId]);

  // Load summaries for the open draft (capped) — stays hidden unless any exist
  useEffect(() => {
    let mounted = true;

    (async () => {
      setSummaries([]);
      if (!userId || !openDraft) return;

      const { data, error } = await supabase
        .from("decision_summaries")
        .select("id,decision_id,summary_text,created_at")
        .eq("user_id", userId)
        .eq("decision_id", openDraft.id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (!mounted) return;

      if (error) {
        setSummaries([]);
        return;
      }

      setSummaries((data ?? []) as DecisionSummary[]);
    })();

    return () => {
      mounted = false;
    };
  }, [userId, openDraft?.id]);

  // Realtime: draft decisions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`thinking-drafts-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, (payload: any) => {
        const eventType: string | undefined = payload?.eventType;
        const next = payload?.new as any | undefined;
        const prev = payload?.old as any | undefined;

        const id = (next?.id ?? prev?.id) as string | undefined;
        if (!eventType || !id) {
          scheduleReload();
          return;
        }

        const rowStatus = String(next?.status ?? prev?.status ?? "");
        const isDraft = rowStatus === "draft";

        setDrafts((current) => {
          if (eventType === "DELETE") {
            if (openId === id) setOpenId(null);
            if (chatForId === id) setChatForId(null);
            if (labelsEditForId === id) setLabelsEditForId(null);
            if (confirmDeleteForId === id) setConfirmDeleteForId(null);
            return current.filter((d) => d.id !== id);
          }

          if (!isDraft) {
            if (openId === id) setOpenId(null);
            if (chatForId === id) setChatForId(null);
            if (labelsEditForId === id) setLabelsEditForId(null);
            if (confirmDeleteForId === id) setConfirmDeleteForId(null);
            return current.filter((d) => d.id !== id);
          }

          const toDecision = (r: any): Decision => ({
            id: r.id,
            user_id: r.user_id,
            title: r.title ?? "",
            context: r.context ?? null,
            status: r.status ?? "draft",
            created_at: r.created_at ?? new Date().toISOString(),
            decided_at: r.decided_at ?? null,
            review_at: r.review_at ?? null,
            origin: r.origin ?? null,
            framed_at: r.framed_at ?? null,
            attachments: normalizeAttachments(r.attachments),
          });

          const patch = toDecision(next ?? prev);

          const exists = current.some((d) => d.id === patch.id);
          const merged = exists ? current.map((d) => (d.id === patch.id ? { ...d, ...patch } : d)) : [patch, ...current];

          merged.sort((a, b) => {
            const ta = safeMs(a.created_at) ?? 0;
            const tb = safeMs(b.created_at) ?? 0;
            return tb - ta;
          });

          return merged;
        });

        scheduleReload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openId, chatForId, labelsEditForId, confirmDeleteForId]);

  const decideNow = async (d: Decision) => {
    if (!userId) return;

    setDrafts((prev) => prev.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);
    if (labelsEditForId === d.id) setLabelsEditForId(null);
    if (confirmDeleteForId === d.id) setConfirmDeleteForId(null);

    const { error } = await supabase
      .from("decisions")
      .update({ status: "decided", decided_at: new Date().toISOString() })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t mark decided: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast(
      {
        message: "Saved to Decisions.",
        undoLabel: "Undo",
        onUndo: async () => {
          const { error: undoErr } = await supabase
            .from("decisions")
            .update({ status: "draft", decided_at: null })
            .eq("id", d.id)
            .eq("user_id", userId);

          if (undoErr) {
            showToast({ message: `Undo failed: ${undoErr.message}` }, 3500);
            return;
          }
          loadRef.current({ silent: true });
        },
      },
      7000
    );
  };

  const scheduleRevisitAt = async (d: Decision, review_at: string) => {
    if (!userId) return;

    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at } : x)));

    const { error } = await supabase.from("decisions").update({ review_at }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t schedule: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Revisit scheduled." }, 2200);
  };

  const scheduleRevisit = async (d: Decision, days: number) => {
    const review_at = isoNowPlusDays(days);
    await scheduleRevisitAt(d, review_at);
  };

  const performDeleteDraft = async (d: Decision) => {
    if (!userId) return;

    // Optimistic remove
    const prev = drafts;
    setDrafts((p) => p.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);
    if (labelsEditForId === d.id) setLabelsEditForId(null);
    if (confirmDeleteForId === d.id) setConfirmDeleteForId(null);

    // ✅ Verify deletion actually happened (RLS can fail silently with 0 rows)
    const { data, error } = await supabase
      .from("decisions")
      .delete()
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "draft")
      .select("id");

    const deletedCount = Array.isArray(data) ? data.length : 0;

    if (error || deletedCount === 0) {
      showToast({ message: "Couldn’t delete right now." }, 3000);
      setDrafts(prev);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Draft deleted." }, 3000);
  };

  const useSummaryAsContext = async (d: Decision, summary: DecisionSummary) => {
    if (!userId) return;

    const existing = (d.context ?? "").trim();
    const chunk = summary.summary_text.trim();

    const nextContext = existing
      ? `${existing}\n\n---\nSummary added (${softWhen(summary.created_at)}):\n${chunk}`
      : `Summary added (${softWhen(summary.created_at)}):\n${chunk}`;

    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, context: nextContext } : x)));

    const { error } = await supabase.from("decisions").update({ context: nextContext }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t update context: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Added to context." }, 2500);
  };

  const setDecisionDomain = async (decisionId: string, domainId: string | null) => {
    if (!userId) return;

    setDomainByDecision((prev) => ({ ...prev, [decisionId]: domainId }));

    try {
      if (!domainId) {
        const { error } = await supabase.from("decision_domains").delete().eq("user_id", userId).eq("decision_id", decisionId);
        if (error) throw error;
        showToast({ message: "Cleared." }, 1800);
        return;
      }

      const { error } = await supabase
        .from("decision_domains")
        .upsert({ user_id: userId, decision_id: decisionId, domain_id: domainId }, { onConflict: "user_id,decision_id" });

      if (error) throw error;
      showToast({ message: "Saved." }, 1800);
    } catch {
      showToast({ message: `Couldn’t update.` }, 2200);
      loadRef.current({ silent: true });
    }
  };

  const toggleConstellation = async (decisionId: string, constellationId: string) => {
    if (!userId) return;

    const current = constellationsByDecision[decisionId] ?? [];
    const has = current.includes(constellationId);
    const next = has ? current.filter((x) => x !== constellationId) : [...current, constellationId];

    setConstellationsByDecision((prev) => ({ ...prev, [decisionId]: next }));

    try {
      if (has) {
        const { error } = await supabase
          .from("constellation_items")
          .delete()
          .eq("user_id", userId)
          .eq("decision_id", decisionId)
          .eq("constellation_id", constellationId);

        if (error) throw error;
        showToast({ message: "Removed." }, 1800);
        return;
      }

      const { error } = await supabase.from("constellation_items").insert({
        user_id: userId,
        decision_id: decisionId,
        constellation_id: constellationId,
      });

      if (error) throw error;
      showToast({ message: "Saved." }, 1800);
    } catch {
      showToast({ message: `Couldn’t update.` }, 2200);
      loadRef.current({ silent: true });
    }
  };

  const filteredDrafts = useMemo(() => {
    let list = drafts;

    if (activeDomainId) {
      list = list.filter((d) => (domainByDecision[d.id] ?? null) === activeDomainId);
    }

    if (activeConstellationId) {
      list = list.filter((d) => (constellationsByDecision[d.id] ?? []).includes(activeConstellationId));
    }

    return list;
  }, [drafts, activeDomainId, activeConstellationId, domainByDecision, constellationsByDecision]);

  const visibleDrafts = useMemo(() => {
    if (showAll) return filteredDrafts;
    return filteredDrafts.slice(0, DEFAULT_LIMIT);
  }, [filteredDrafts, showAll]);

  const hasMore = filteredDrafts.length > DEFAULT_LIMIT;
  const hasAnyLabelOptions = domains.length > 0 || constellations.length > 0;

  const beginEditDraft = (d: Decision) => {
    const parts = splitThinkingContext(d.context);
    setIsEditingDraftById((prev) => ({ ...prev, [d.id]: true }));
    setDraftTitleById((prev) => ({ ...prev, [d.id]: d.title ?? "" }));
    setDraftBodyById((prev) => ({ ...prev, [d.id]: parts.draft ?? "" }));

    setOriginalCaptureById((prev) => {
      if (prev[d.id]) return prev;
      return { ...prev, [d.id]: { title: d.title ?? "", captured: parts.captured ?? "" } };
    });
  };

  const cancelEditDraft = (d: Decision) => {
    setIsEditingDraftById((prev) => ({ ...prev, [d.id]: false }));
  };

  const saveDraftOverwrite = async (d: Decision) => {
    if (!userId) return;

    const snapshot =
      originalCaptureById[d.id] ?? { title: d.title ?? "", captured: splitThinkingContext(d.context).captured ?? "" };

    const nextTitle = (draftTitleById[d.id] ?? "").trim() || d.title || "Untitled";
    const nextDraftBody = (draftBodyById[d.id] ?? "").trim();

    const nextContext = composeThinkingContext(snapshot.captured, nextDraftBody);

    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, title: nextTitle, context: nextContext } : x)));
    setIsEditingDraftById((prev) => ({ ...prev, [d.id]: false }));

    const { error } = await supabase
      .from("decisions")
      .update({ title: nextTitle, context: nextContext })
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "draft");

    if (error) {
      showToast({ message: `Couldn’t save: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Saved." }, 1800);
  };

  return (
    <Page title="Thinking" subtitle="Work on drafts here. When you’re ready to commit, save it into Decisions." right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Chip onClick={() => router.push("/capture")} title="Back: Capture">
              <span className="mr-1 opacity-70">‹</span> Back: Capture
            </Chip>

            <Chip onClick={() => router.push("/decisions")} title="Next: Decisions">
              Next: Decisions <span className="ml-1 opacity-70">›</span>
            </Chip>
          </div>
        </div>

        <AssistedSearch scope="thinking" placeholder="Search drafts and decisions…" />

        <div className="space-y-4">
          <TilesRow title="Filter by area" items={domains} activeId={activeDomainId} onSelect={(id) => setActiveDomainId(id)} />
          <TilesRow title="Filter by group" items={constellations} activeId={activeConstellationId} onSelect={(id) => setActiveConstellationId(id)} />
        </div>

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {filteredDrafts.length > 0 && hasMore ? (
          <div className="flex items-center gap-2">
            <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
            {!showAll ? <div className="text-xs text-zinc-500">Showing {DEFAULT_LIMIT} of {filteredDrafts.length}</div> : null}
          </div>
        ) : null}

        {filteredDrafts.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                <div className="text-sm text-zinc-600">When something needs thinking time, it can live here quietly.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visibleDrafts.map((d) => {
              const isOpen = openId === d.id;
              const isChatOpen = chatForId === d.id;

              const domainId = domainByDecision[d.id] ?? null;
              const domainName = domainId ? domains.find((x) => x.id === domainId)?.name ?? null : null;

              const memberIds = constellationsByDecision[d.id] ?? [];
              const memberNames = memberIds.map((cid) => constellations.find((c) => c.id === cid)?.name).filter(Boolean) as string[];

              const filedUnder = [domainName, ...memberNames].filter(Boolean) as string[];
              const isEditingLabels = labelsEditForId === d.id;

              const showFiledUnderCard = (hasAnyLabelOptions && isEditingLabels) || (hasAnyLabelOptions && filedUnder.length > 0);

              const revisitMode = revisitModeById[d.id] ?? "";
              const customDate = customDateById[d.id] ?? "";

              const originLabel = d.origin === "capture" ? "Sent from Capture." : d.origin === "framing" ? "Prepared in Framing." : "";

              const parts = splitThinkingContext(d.context);
              const originalSnapshot = originalCaptureById[d.id] ?? { title: d.title ?? "", captured: parts.captured ?? "" };
              const isEditingDraft = !!isEditingDraftById[d.id];
              const isConfirmingDelete = confirmDeleteForId === d.id;

              return (
                <div
                  key={d.id}
                  ref={(el) => {
                    cardRefs.current[d.id] = el;
                  }}
                >
                  <Card className={`border-zinc-200 bg-white transition ${highlightId === d.id ? "ring-2 ring-zinc-300" : ""}`}>
                    <CardContent>
                      <button
                        type="button"
                        onClick={() => {
                          const nextOpen = isOpen ? null : d.id;
                          setOpenId(nextOpen);

                          if (nextOpen !== d.id) {
                            setChatForId(null);
                            setLabelsEditForId(null);
                            setConfirmDeleteForId(null);
                          }

                          if (nextOpen === d.id) {
                            setOriginalCaptureById((prev) => {
                              if (prev[d.id]) return prev;
                              return { ...prev, [d.id]: { title: d.title ?? "", captured: parts.captured ?? "" } };
                            });
                          }
                        }}
                        className="w-full text-left"
                        aria-expanded={isOpen}
                        title={isOpen ? "Collapse" : "Open"}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[240px] flex-1">
                            <div className="text-base font-semibold text-zinc-900">{d.title}</div>

                            <div className="mt-1 text-xs text-zinc-500">
                              Started {softWhen(d.created_at)}
                              {d.review_at ? ` • Revisit ${softWhen(d.review_at)}` : ""}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {domainName ? <Chip title="Filed under">{domainName}</Chip> : null}
                              {memberNames.slice(0, 2).map((n) => (
                                <Chip key={n} title="Filed under">
                                  {n}
                                </Chip>
                              ))}
                              {memberNames.length > 2 ? <Chip title="More">+{memberNames.length - 2}</Chip> : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                          </div>
                        </div>
                      </button>

                      {isOpen ? (
                        <div className="mt-4 space-y-4">
                          {originLabel ? <div className="mt-1 text-xs text-zinc-500">{originLabel}</div> : null}

                          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
                            <div className="text-sm font-semibold text-zinc-900">Original capture</div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                              {(originalSnapshot.captured || originalSnapshot.title || "").trim() || "—"}
                            </div>
                          </div>

                          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-zinc-900">Draft</div>

                              {!isEditingDraft ? (
                                <Chip onClick={() => beginEditDraft(d)} title="Edit">
                                  Edit
                                </Chip>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Chip onClick={() => cancelEditDraft(d)} title="Cancel">
                                    Cancel
                                  </Chip>
                                  <Chip onClick={() => void saveDraftOverwrite(d)} title="Save">
                                    Save
                                  </Chip>
                                </div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Title</div>
                              <input
                                value={isEditingDraft ? (draftTitleById[d.id] ?? d.title) : d.title}
                                disabled={!isEditingDraft}
                                onChange={(e) => setDraftTitleById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                className={`h-11 w-full rounded-2xl border px-4 text-[15px] text-zinc-900 outline-none ${
                                  isEditingDraft
                                    ? "border-zinc-200 bg-white focus:ring-2 focus:ring-zinc-200"
                                    : "border-zinc-100 bg-zinc-50 text-zinc-900"
                                }`}
                                aria-label="Draft title"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Body</div>

                              {!isEditingDraft ? (
                                <div className="whitespace-pre-wrap rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-800">
                                  {parts.draft?.trim() ? parts.draft : <span className="text-zinc-500">This is what I’m deciding… (optional)</span>}
                                </div>
                              ) : (
                                <textarea
                                  value={draftBodyById[d.id] ?? parts.draft ?? ""}
                                  onChange={(e) => setDraftBodyById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                  placeholder="This is what I’m deciding… (optional)"
                                  className="w-full min-h-[160px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                                  aria-label="Draft body"
                                />
                              )}
                            </div>
                          </div>

                          <DecisionNotes decisionId={d.id} kind="thinking" />

                          {showFiledUnderCard ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-zinc-700">Filed under</div>
                                <Chip
                                  onClick={() => {
                                    if (!hasAnyLabelOptions) {
                                      showToast({ message: "No areas or groups yet." }, 2000);
                                      return;
                                    }
                                    setLabelsEditForId((cur) => (cur === d.id ? null : d.id));
                                  }}
                                >
                                  {isEditingLabels ? "Done" : "Edit"}
                                </Chip>
                              </div>

                              {!isEditingLabels ? (
                                <div className="text-sm text-zinc-700">
                                  {filedUnder.length > 0 ? <span>{filedUnder.join(", ")}</span> : <span className="text-zinc-600">Not set.</span>}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="text-xs text-zinc-500">Optional. Helps you group and filter later.</div>

                                  <div className="space-y-2">
                                    <div className="text-xs text-zinc-500">Area</div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Chip active={!domainId} onClick={() => void setDecisionDomain(d.id, null)}>
                                        None
                                      </Chip>
                                      {domains.map((dom) => (
                                        <Chip key={dom.id} active={domainId === dom.id} onClick={() => void setDecisionDomain(d.id, dom.id)}>
                                          {dom.name}
                                        </Chip>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <div className="text-xs text-zinc-500">Groups</div>
                                    {constellations.length === 0 ? (
                                      <div className="text-sm text-zinc-600">No groups yet.</div>
                                    ) : (
                                      <div className="flex flex-wrap items-center gap-2">
                                        {constellations.map((c) => {
                                          const active = memberIds.includes(c.id);
                                          return (
                                            <Chip key={c.id} active={active} onClick={() => void toggleConstellation(d.id, c.id)}>
                                              {c.name}
                                            </Chip>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : hasAnyLabelOptions ? (
                            <div className="flex items-center gap-2">
                              <Chip onClick={() => setLabelsEditForId(d.id)} title="Optional: file under an area or group">
                                File under
                              </Chip>
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                            {userId ? (
                              <AttachmentsBlock userId={userId} decisionId={d.id} title="Attachments" bucket="captures" />
                            ) : (
                              <div className="text-sm text-zinc-600">Attachments unavailable.</div>
                            )}
                          </div>

                          {summaries.length > 0 ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-zinc-700">Saved summaries</div>
                                <div className="text-xs text-zinc-500">These appear after you choose to save a chat summary.</div>
                              </div>

                              {summaries.map((s) => (
                                <div key={s.id} className="space-y-2">
                                  <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{s.summary_text}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Chip onClick={() => useSummaryAsContext(d, s)} title="Append this into the draft context">
                                      Use as context
                                    </Chip>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <div className="text-xs text-zinc-500">
                              Talk it through if you’re unsure. Decide saves it into <span className="font-medium">Decisions</span>.
                            </div>

                            {/* ✅ Delete confirm (capture-style) */}
                            {isConfirmingDelete ? (
                              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C94A4A] bg-[#FCECEC] px-4 py-3">
                                <div className="text-sm text-[#7A1E1E]">
                                  Delete this draft? <span className="opacity-80">This can’t be undone.</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Chip onClick={() => setConfirmDeleteForId(null)} title="Cancel">
                                    Cancel
                                  </Chip>
                                  <button
                                    type="button"
                                    onClick={() => void performDeleteDraft(d)}
                                    className="inline-flex select-none items-center justify-center rounded-full border border-[#C94A4A] bg-[#C94A4A] px-4 py-2 text-sm text-white transition hover:bg-[#b94141]"
                                    title="Delete"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <PrimaryActionButton
                                  onClick={() => setChatForId((cur) => (cur === d.id ? null : d.id))}
                                  title="Talk it through with Keystone"
                                >
                                  {isChatOpen ? "Hide chat" : "Talk this through"}
                                </PrimaryActionButton>

                                <PrimaryActionButton onClick={() => decideNow(d)} title="Confirm and save into Decisions">
                                  Decide
                                </PrimaryActionButton>

                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-xs text-zinc-500">Revisit</div>

                                  <select
                                    className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                                    value={revisitMode}
                                    onChange={(e) => {
                                      const v = e.target.value as "7" | "30" | "90" | "custom" | "";
                                      setRevisitModeById((prev) => ({ ...prev, [d.id]: v }));

                                      if (v === "7") void scheduleRevisit(d, 7);
                                      if (v === "30") void scheduleRevisit(d, 30);
                                      if (v === "90") void scheduleRevisit(d, 90);
                                    }}
                                    aria-label="Revisit schedule"
                                    title="Choose when to bring this back"
                                  >
                                    <option value="">Choose…</option>
                                    <option value="7">In 7 days</option>
                                    <option value="30">In 30 days</option>
                                    <option value="90">In 90 days</option>
                                    <option value="custom">Pick a date…</option>
                                  </select>

                                  {revisitMode === "custom" ? (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <input
                                        type="date"
                                        className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                                        value={customDate}
                                        onChange={(e) => setCustomDateById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                        aria-label="Custom revisit date"
                                        title="Pick a date"
                                      />
                                      <Chip
                                        onClick={() => {
                                          const iso = isoFromDateInput(customDate);
                                          if (!iso) {
                                            showToast({ message: "Pick a valid date." }, 2000);
                                            return;
                                          }
                                          void scheduleRevisitAt(d, iso);
                                        }}
                                        title="Set revisit date"
                                      >
                                        Set date
                                      </Chip>
                                    </div>
                                  ) : null}
                                </div>

                                <Chip onClick={() => router.push("/revisit")} title="Open Revisit to see scheduled items">
                                  Go to Revisit
                                </Chip>

                                <Chip onClick={() => setConfirmDeleteForId(d.id)} title="Delete this draft">
                                  Delete
                                </Chip>
                              </div>
                            )}
                          </div>

                          {isChatOpen ? (
                            <div className="pt-2">
                              <ConversationPanel
                                decisionId={d.id}
                                decisionTitle={d.title}
                                frame={{ decision_statement: d.title }}
                                onClose={() => setChatForId(null)}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        {process.env.NODE_ENV === "development" && openDraft ? <div className="text-xs text-zinc-400">openId: {openDraft.id}</div> : null}
      </div>
    </Page>
  );
}
