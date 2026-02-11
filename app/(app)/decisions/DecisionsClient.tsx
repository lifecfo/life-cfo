// app/(app)/decisions/DecisionsClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, Card, CardContent, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";
import { TilesRow } from "@/components/TilesRow";
import { DecisionNotes } from "@/components/decision/DecisionNotes";
import { AttachmentsBlock } from "@/components/AttachmentsBlock";
import { ConversationPanel } from "../thinking/ConversationPanel";

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
  reviewed_at?: string | null;
  chaptered_at?: string | null;
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

type Domain = { id: string; name: string; sort_order?: number | null };
type Constellation = { id: string; name: string; sort_order?: number | null };

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

// Same context format as Thinking (safe to reuse)
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

export default function DecisionsClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const openFromQuery = searchParams.get("open");

  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chatForId, setChatForId] = useState<string | null>(null);

  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);

  const [domains, setDomains] = useState<Domain[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);

  const [domainByDecision, setDomainByDecision] = useState<Record<string, string | null>>({});
  const [constellationsByDecision, setConstellationsByDecision] = useState<Record<string, string[]>>({});

  const loadRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});
  const reloadTimerRef = useRef<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [labelsEditForId, setLabelsEditForId] = useState<string | null>(null);

  const [revisitModeById, setRevisitModeById] = useState<Record<string, "7" | "30" | "90" | "custom" | "">>({});
  const [customDateById, setCustomDateById] = useState<Record<string, string>>({});

  const [confirmDeleteForId, setConfirmDeleteForId] = useState<string | null>(null);

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRef.current({ silent: true });
    }, 250);
  };

  const openDecision = useMemo(() => items.find((d) => d.id === openId) ?? null, [items, openId]);

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

  const load = async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    if (!silent) setStatusLine("Loading…");

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth?.user) {
      setUserId(null);
      setItems([]);
      setStatusLine("Not signed in.");
      return;
    }

    const uid = auth.user.id;
    setUserId(uid);

    // Decisions page: show decided only (not draft, not chapter)
    const { data, error } = await supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,reviewed_at,chaptered_at,origin,framed_at,attachments")
      .eq("user_id", uid)
      .eq("status", "decided")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      setItems([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const listRaw = (data ?? []) as any[];
    const list: Decision[] = listRaw.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      title: r.title ?? "",
      context: r.context ?? null,
      status: r.status ?? "decided",
      created_at: r.created_at ?? new Date().toISOString(),
      decided_at: r.decided_at ?? null,
      review_at: r.review_at ?? null,
      reviewed_at: r.reviewed_at ?? null,
      chaptered_at: r.chaptered_at ?? null,
      origin: r.origin ?? null,
      framed_at: r.framed_at ?? null,
      attachments: normalizeAttachments(r.attachments),
    }));

    setItems(list);

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

    setStatusLine(list.length === 0 ? "No decisions yet." : "Loaded.");
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

  // Auto-open from query (?open=...)
  useEffect(() => {
    if (!openFromQuery) return;
    if (items.length === 0) return;

    const match = items.find((d) => d.id === openFromQuery);
    if (!match) return;

    setOpenId(match.id);
    setHighlightId(match.id);

    window.setTimeout(() => {
      const el = cardRefs.current[match.id];
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    router.replace("/decisions");

    const t = window.setTimeout(() => setHighlightId(null), 1600);
    return () => window.clearTimeout(t);
  }, [openFromQuery, items, router]);

  // Keep chat only for open card
  useEffect(() => {
    setChatForId((cur) => {
      if (!cur) return null;
      if (!openId) return null;
      return cur === openId ? cur : null;
    });
  }, [openId]);

  // Close editors when changing open card
  useEffect(() => {
    setLabelsEditForId((cur) => (cur && openId && cur === openId ? cur : null));
    setConfirmDeleteForId((cur) => (cur && openId && cur === openId ? cur : null));
  }, [openId]);

  // Load summaries for open decision
  useEffect(() => {
    if (!userId || !openDecision) {
      setSummaries([]);
      return;
    }
    void reloadSummaries(openDecision.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openDecision?.id]);

  // Realtime (only keep decided items in this list)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`decisions-list-${userId}`)
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

        setItems((current) => {
          // delete
          if (eventType === "DELETE") {
            if (openId === id) setOpenId(null);
            if (chatForId === id) setChatForId(null);
            if (labelsEditForId === id) setLabelsEditForId(null);
            if (confirmDeleteForId === id) setConfirmDeleteForId(null);
            return current.filter((d) => d.id !== id);
          }

          // only keep decided items here
          if (rowStatus !== "decided") {
            if (openId === id) setOpenId(null);
            if (chatForId === id) setChatForId(null);
            if (labelsEditForId === id) setLabelsEditForId(null);
            if (confirmDeleteForId === id) setConfirmDeleteForId(null);
            return current.filter((d) => d.id !== id);
          }

          const patch: Decision = {
            id: String((next ?? prev).id),
            user_id: String((next ?? prev).user_id),
            title: String((next ?? prev).title ?? ""),
            context: (next ?? prev).context ?? null,
            status: "decided",
            created_at: (next ?? prev).created_at ?? new Date().toISOString(),
            decided_at: (next ?? prev).decided_at ?? null,
            review_at: (next ?? prev).review_at ?? null,
            reviewed_at: (next ?? prev).reviewed_at ?? null,
            chaptered_at: (next ?? prev).chaptered_at ?? null,
            origin: (next ?? prev).origin ?? null,
            framed_at: (next ?? prev).framed_at ?? null,
            attachments: normalizeAttachments((next ?? prev).attachments),
          };

          const exists = current.some((d) => d.id === patch.id);
          const merged = exists ? current.map((d) => (d.id === patch.id ? { ...d, ...patch } : d)) : [patch, ...current];

          merged.sort((a, b) => {
            const ta = safeMs(a.decided_at) ?? safeMs(a.created_at) ?? 0;
            const tb = safeMs(b.decided_at) ?? safeMs(b.created_at) ?? 0;
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
      showToast({ message: "Couldn’t update." }, 2200);
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
      showToast({ message: "Couldn’t update." }, 2200);
      loadRef.current({ silent: true });
    }
  };

  const scheduleReviewAt = async (d: Decision, review_at: string) => {
    if (!userId) return;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at, reviewed_at: null } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ review_at, reviewed_at: null })
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "decided");

    if (error) {
      showToast({ message: `Couldn’t schedule: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Review scheduled." }, 2200);
  };

  const scheduleReview = async (d: Decision, days: number) => {
    const review_at = isoNowPlusDays(days);
    await scheduleReviewAt(d, review_at);
  };

  const clearReview = async (d: Decision) => {
    if (!userId) return;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at: null } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ review_at: null })
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "decided");

    if (error) {
      showToast({ message: `Couldn’t clear: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Cleared." }, 1800);
  };

  const reopenToThinking = async (d: Decision) => {
    if (!userId) return;

    // optimistic remove from this list
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);

    const { error } = await supabase
      .from("decisions")
      .update({ status: "draft", decided_at: null })
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "decided");

    if (error) {
      showToast({ message: `Couldn’t reopen: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Moved back to Thinking." }, 2500);
    router.push(`/thinking?open=${encodeURIComponent(d.id)}`);
  };

  const chapterDecision = async (d: Decision) => {
    if (!userId) return;

    // optimistic remove (chapters page owns it)
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);

    const { error } = await supabase
      .from("decisions")
      .update({ status: "chapter", chaptered_at: new Date().toISOString() })
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "decided");

    if (error) {
      showToast({ message: `Couldn’t chapter: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Moved to Chapters." }, 2500);
  };

  const performDelete = async (d: Decision) => {
    if (!userId) return;

    // optimistic remove
    const prev = items;
    setItems((p) => p.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);
    if (labelsEditForId === d.id) setLabelsEditForId(null);
    if (confirmDeleteForId === d.id) setConfirmDeleteForId(null);

    // best-effort cleanup
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
    try {
      await supabase.from("decision_conversations").delete().eq("user_id", userId).eq("decision_id", d.id);
    } catch {}

    const { data, error } = await supabase.from("decisions").delete().eq("id", d.id).eq("user_id", userId).select("id");
    const deletedCount = Array.isArray(data) ? data.length : 0;

    if (error || deletedCount === 0) {
      const msg = error?.message ? `Couldn’t delete: ${error.message}` : "Couldn’t delete right now.";
      showToast({ message: msg }, 3500);
      setItems(prev);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Deleted." }, 2500);
  };

  const useSummaryAsContext = async (d: Decision, summary: DecisionSummary) => {
    if (!userId) return;

    const existing = (d.context ?? "").trim();
    const chunk = summary.summary_text.trim();

    const nextContext = existing
      ? `${existing}\n\n---\nSummary added (${softWhen(summary.created_at)}):\n${chunk}`
      : `Summary added (${softWhen(summary.created_at)}):\n${chunk}`;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, context: nextContext } : x)));

    const { error } = await supabase.from("decisions").update({ context: nextContext }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t update: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Added to context." }, 2200);
  };

  const filtered = useMemo(() => {
    let list = items;

    if (activeDomainId) list = list.filter((d) => (domainByDecision[d.id] ?? null) === activeDomainId);
    if (activeConstellationId) list = list.filter((d) => (constellationsByDecision[d.id] ?? []).includes(activeConstellationId));

    return list;
  }, [items, activeDomainId, activeConstellationId, domainByDecision, constellationsByDecision]);

  const visible = useMemo(() => {
    if (showAll) return filtered;
    return filtered.slice(0, DEFAULT_LIMIT);
  }, [filtered, showAll]);

  const hasMore = filtered.length > DEFAULT_LIMIT;
  const hasAnyLabelOptions = domains.length > 0 || constellations.length > 0;

  return (
    <Page
      title="Decisions"
      subtitle="Your committed decisions live here — calm record, easy recall."
      right={null}
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Chip onClick={() => router.push("/thinking")} title="Back: Thinking">
              <span className="mr-1 opacity-70">‹</span> Back: Thinking
            </Chip>
            <Chip onClick={() => router.push("/revisit")} title="Next: Review">
              Next: Review <span className="ml-1 opacity-70">›</span>
            </Chip>
          </div>
        </div>

        <AssistedSearch scope="decisions" placeholder="Search decisions…" />

        <div className="space-y-4">
          <TilesRow title="Filter by area" items={domains} activeId={activeDomainId} onSelect={(id) => setActiveDomainId(id)} />
          <TilesRow title="Filter by group" items={constellations} activeId={activeConstellationId} onSelect={(id) => setActiveConstellationId(id)} />
        </div>

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {filtered.length > 0 && hasMore ? (
          <div className="flex items-center gap-2">
            <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
            {!showAll ? (
              <div className="text-xs text-zinc-500">
                Showing {DEFAULT_LIMIT} of {filtered.length}
              </div>
            ) : null}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing saved yet.</div>
                <div className="text-sm text-zinc-600">When you press Decide in Thinking, it lands here.</div>
                <div className="pt-2">
                  <Chip onClick={() => router.push("/thinking")}>Go to Thinking</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visible.map((d) => {
              const isOpen = openId === d.id;
              const isChatOpen = chatForId === d.id;

              const domainId = domainByDecision[d.id] ?? null;
              const domainName = domainId ? domains.find((x) => x.id === domainId)?.name ?? null : null;

              const memberIds = constellationsByDecision[d.id] ?? [];
              const memberNames = memberIds
                .map((cid) => constellations.find((c) => c.id === cid)?.name)
                .filter(Boolean) as string[];

              const filedUnder = [domainName, ...memberNames].filter(Boolean) as string[];
              const isEditingLabels = labelsEditForId === d.id;

              const revisitMode = revisitModeById[d.id] ?? "";
              const customDate = customDateById[d.id] ?? "";

              const parts = splitThinkingContext(d.context);
              const allAtt = normalizeAttachments(d.attachments);
              const attachmentsTitle = allAtt.length > 0 ? `Attachments (${allAtt.length})` : "Attachments";

              const isConfirmingDelete = confirmDeleteForId === d.id;

              const originLabel = d.origin === "capture" ? "Started in Capture." : "";

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
                        }}
                        className="w-full text-left"
                        aria-expanded={isOpen}
                        title={isOpen ? "Collapse" : "Open"}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[240px] flex-1">
                            <div className="text-base font-semibold text-zinc-900">{d.title}</div>

                            <div className="mt-1 text-xs text-zinc-500">
                              Saved {softWhen(d.decided_at || d.created_at)}
                              {d.review_at ? ` • Review ${softWhen(d.review_at)}` : ""}
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

                          {(parts.captured || "").trim() ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
                              <div className="text-sm font-semibold text-zinc-900">Original capture</div>
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                                {parts.captured.trim()}
                              </div>
                            </div>
                          ) : null}

                          {(parts.draft || "").trim() ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
                              <div className="text-sm font-semibold text-zinc-900">Final draft</div>
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                                {parts.draft.trim()}
                              </div>
                            </div>
                          ) : null}

                          <DecisionNotes decisionId={d.id} kind="decisions" />

                          {hasAnyLabelOptions ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-zinc-700">Filed under</div>
                                <Chip onClick={() => setLabelsEditForId((cur) => (cur === d.id ? null : d.id))}>
                                  {isEditingLabels ? "Done" : "Edit"}
                                </Chip>
                              </div>

                              {!isEditingLabels ? (
                                <div className="text-sm text-zinc-700">
                                  {filedUnder.length > 0 ? filedUnder.join(", ") : <span className="text-zinc-600">Not set.</span>}
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <div className="text-xs text-zinc-500">Optional. Helps filtering later.</div>

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
                          ) : null}

                          <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                            {userId ? (
                              <AttachmentsBlock
                                userId={userId}
                                decisionId={d.id}
                                title={attachmentsTitle}
                                bucket="captures"
                                initial={allAtt}
                              />
                            ) : (
                              <div className="text-sm text-zinc-600">Attachments unavailable.</div>
                            )}
                          </div>

                          {summaries.length > 0 ? (
                            <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-zinc-700">Saved summaries</div>
                                <div className="text-xs text-zinc-500">Only appears after you choose to save a chat summary.</div>
                              </div>

                              {summaries.map((s) => (
                                <div key={s.id} className="space-y-2">
                                  <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{s.summary_text}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Chip onClick={() => useSummaryAsContext(d, s)} title="Append into decision context">
                                      Use as context
                                    </Chip>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <div className="text-xs text-zinc-500">
                              You can revisit, chapter, or reopen it to Thinking.
                            </div>

                            {isConfirmingDelete ? (
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
                                  title="Optional: talk it through again"
                                >
                                  {isChatOpen ? "Hide chat" : "Talk this through"}
                                </PrimaryActionButton>

                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-xs text-zinc-500">Review</div>

                                  <select
                                    className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
                                    value={revisitMode}
                                    onChange={(e) => {
                                      const v = e.target.value as "7" | "30" | "90" | "custom" | "";
                                      setRevisitModeById((prev) => ({ ...prev, [d.id]: v }));

                                      if (v === "7") void scheduleReview(d, 7);
                                      if (v === "30") void scheduleReview(d, 30);
                                      if (v === "90") void scheduleReview(d, 90);
                                    }}
                                    aria-label="Review schedule"
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
                                        aria-label="Custom review date"
                                      />
                                      <Chip
                                        onClick={() => {
                                          const iso = isoFromDateInput(customDate);
                                          if (!iso) {
                                            showToast({ message: "Pick a valid date." }, 2000);
                                            return;
                                          }
                                          void scheduleReviewAt(d, iso);
                                        }}
                                        title="Set review date"
                                      >
                                        Set date
                                      </Chip>
                                    </div>
                                  ) : null}

                                  {d.review_at ? (
                                    <Chip onClick={() => void clearReview(d)} title="Clear review date">
                                      Clear
                                    </Chip>
                                  ) : null}
                                </div>

                                <Chip onClick={() => router.push("/revisit")} title="Open Review">
                                  Go to Review
                                </Chip>

                                <Chip onClick={() => router.push("/chapters")} title="Open Chapters">
                                  Chapters
                                </Chip>

                                <Chip onClick={() => void chapterDecision(d)} title="Move this to Chapters">
                                  Chapter
                                </Chip>

                                <Chip onClick={() => void reopenToThinking(d)} title="Move back to Thinking">
                                  Re-open
                                </Chip>

                                <Chip onClick={() => setConfirmDeleteForId(d.id)} title="Delete this decision">
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
                                onSummarySaved={() => void reloadSummaries(d.id)}
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

        {process.env.NODE_ENV === "development" && openDecision ? (
          <div className="text-xs text-zinc-400">openId: {openDecision.id}</div>
        ) : null}
      </div>
    </Page>
  );
}
