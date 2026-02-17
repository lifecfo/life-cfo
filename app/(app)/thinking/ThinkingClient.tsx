"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, useToast } from "@/components/ui";
import { ConversationPanel } from "./ConversationPanel";

// ✅ Assisted retrieval + tiles
import { AssistedSearch } from "@/components/AssistedSearch";
import { TilesRow } from "@/components/TilesRow";

// ✅ Notes (quiet)
import { DecisionNotes } from "@/components/decision/DecisionNotes";

// ✅ Attachments
import { AttachmentsBlock } from "@/components/AttachmentsBlock";

export const dynamic = "force-dynamic";

/**
 * ✅ Decisions model (locked):
 * - Decisions page shows ALL ACTIVE items (status !== "chapter")
 * - Review is purely a view/filter (review_at), NOT a separate status
 * - Chapters is closed decisions (status === "chapter")
 * - No draft/decided distinction for the Decisions surface
 */

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
 * Context format (V1-compatible):
 * Stored in decisions.context as:
 *   Captured:
 *   <original capture text>
 *
 *   ---
 *   Draft:
 *   <editable body>
 *
 * We keep this structure, but we DO NOT treat the decision as a “draft status”.
 * It’s just the editable body + a stable original snapshot.
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

function titleFromStatement(statement: string) {
  const s = (statement || "").trim().replace(/\s+/g, " ");
  if (!s) return "Untitled";
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
}

export default function ThinkingClient({ surface = "thinking" }: { surface?: "thinking" | "decisions" }) {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const openFromQuery = searchParams.get("open");

  const pageTitle = surface === "decisions" ? "Decisions" : "Thinking";
  const pageSubtitle =
    surface === "decisions"
      ? "Bring any money decision here. Talk it through, capture what matters, and save the conclusion — without turning it into a project."
      : "Work on drafts here. When you’re ready to commit, save it into Decisions.";

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [animateCardId, setAnimateCardId] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // ✅ Top-5 default (V1 pattern)
  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  // Summaries for the currently open decision (small, capped)
  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);

  // ✅ Labels (tiles + assignment)
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

  // ✅ Inline label editor + revisit control state
  const [labelsEditForId, setLabelsEditForId] = useState<string | null>(null);
  const [revisitModeById, setRevisitModeById] = useState<Record<string, "7" | "30" | "90" | "custom" | "">>({});
  const [customDateById, setCustomDateById] = useState<Record<string, string>>({});

  // ✅ Draft/body editor (content, not status)
  const [isEditingDraftById, setIsEditingDraftById] = useState<Record<string, boolean>>({});
  const [draftTitleById, setDraftTitleById] = useState<Record<string, string>>({});
  const [draftBodyById, setDraftBodyById] = useState<Record<string, string>>({});

  // ✅ Stable “Original decision” snapshot (read-only)
  const [originalCaptureById, setOriginalCaptureById] = useState<Record<string, { title: string; captured: string }>>(
    {}
  );

  // ✅ Delete confirm
  const [confirmDeleteForId, setConfirmDeleteForId] = useState<string | null>(null);

  // ✅ Details collapse (keeps functionality but keeps UI calm)
  const [showDetailsById, setShowDetailsById] = useState<Record<string, boolean>>({});

  // ✅ Composer state (Decisions surface)
  const composerRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [newText, setNewText] = useState<string>("");
  const [newDecisionId, setNewDecisionId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState<boolean>(false);

  // chat focus/boot tokens (decisionId -> number)
  const [chatFocusTokenById, setChatFocusTokenById] = useState<Record<string, number>>({});
  const [chatForId, setChatForId] = useState<string | null>(null);
  const [composerChatForId, setComposerChatForId] = useState<string | null>(null);

  // Composer: show Files only when requested OR there are files
  const [composerShowFiles, setComposerShowFiles] = useState<boolean>(false);

  // Pass first message into ConversationPanel (chat-first)
  const [pendingFirstMsgById, setPendingFirstMsgById] = useState<Record<string, string>>({});
  const [pendingFirstMsgTokenById, setPendingFirstMsgTokenById] = useState<Record<string, number>>({});

  // Auto-create on typing (debounced)
  const autoCreateTimerRef = useRef<number | null>(null);

  const composerDecision = useMemo(() => {
    if (!newDecisionId) return null;
    return items.find((x) => x.id === newDecisionId) ?? null;
  }, [newDecisionId, items]);

  const composerHasFiles = (composerDecision?.attachments?.length ?? 0) > 0;

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

    // ✅ Surface behavior:
    // - Decisions: ACTIVE only (status !== "chapter")
    // - Thinking: keep legacy “draft-only” behavior (if you still use the page)
    const q = supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    const { data, error } =
      surface === "decisions"
        ? await q.neq("status", "chapter")
        : // legacy behavior: Thinking still only shows drafts (safe, non-breaking)
          await q.eq("status", "draft");

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
      status: r.status ?? "",
      created_at: r.created_at ?? new Date().toISOString(),
      decided_at: r.decided_at ?? null,
      review_at: r.review_at ?? null,
      origin: r.origin ?? null,
      framed_at: r.framed_at ?? null,
      attachments: normalizeAttachments(r.attachments),
    }));

    setItems(list);

    const [domRes, conRes] = await Promise.all([
      supabase.from("domains").select("id,name,sort_order").eq("user_id", uid).order("sort_order", { ascending: true }),
      supabase
        .from("constellations")
        .select("id,name,sort_order")
        .eq("user_id", uid)
        .order("sort_order", { ascending: true }),
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
        supabase
          .from("constellation_items")
          .select("decision_id,constellation_id")
          .eq("user_id", uid)
          .in("decision_id", decisionIds),
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

    setStatusLine(list.length === 0 ? "All clear." : "Loaded.");
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
  }, [surface]);

  // ✅ Auto-open from query (?open=...) + scroll + clear param
  useEffect(() => {
    if (!openFromQuery) return;
    if (items.length === 0) return;

    const match = items.find((d) => d.id === openFromQuery);
    if (!match) return;

    setOpenId(match.id);
    setHighlightId(match.id);

    // open conversation by default on open
    setChatForId(match.id);
    setChatFocusTokenById((p) => ({ ...p, [match.id]: (p[match.id] ?? 0) + 1 }));

    window.setTimeout(() => {
      const el = cardRefs.current[match.id];
      if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);

    router.replace(surface === "decisions" ? "/decisions" : "/thinking");

    const t = window.setTimeout(() => setHighlightId(null), 1600);
    return () => window.clearTimeout(t);
  }, [openFromQuery, items, router, surface]);

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

  // Load summaries for the open decision (capped)
  useEffect(() => {
    if (!userId || !openDecision) {
      setSummaries([]);
      return;
    }
    void reloadSummaries(openDecision.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openDecision?.id]);

  // Realtime: decisions
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`decisions-${surface}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const eventType: string | undefined = payload?.eventType;
          const next = payload?.new as any | undefined;
          const prev = payload?.old as any | undefined;

          const id = (next?.id ?? prev?.id) as string | undefined;
          if (!eventType || !id) {
            scheduleReload();
            return;
          }

          const rowStatus = String(next?.status ?? prev?.status ?? "");

          const shouldBeVisible =
            surface === "decisions"
              ? rowStatus !== "chapter"
              : // legacy: thinking shows only drafts
                rowStatus === "draft";

          setItems((current) => {
            if (eventType === "DELETE") {
              if (openId === id) setOpenId(null);
              if (chatForId === id) setChatForId(null);
              if (labelsEditForId === id) setLabelsEditForId(null);
              if (confirmDeleteForId === id) setConfirmDeleteForId(null);
              if (composerChatForId === id) setComposerChatForId(null);
              if (newDecisionId === id) setNewDecisionId(null);
              return current.filter((d) => d.id !== id);
            }

            if (!shouldBeVisible) {
              if (openId === id) setOpenId(null);
              if (chatForId === id) setChatForId(null);
              if (labelsEditForId === id) setLabelsEditForId(null);
              if (confirmDeleteForId === id) setConfirmDeleteForId(null);
              if (composerChatForId === id) setComposerChatForId(null);
              if (newDecisionId === id) setNewDecisionId(null);
              return current.filter((d) => d.id !== id);
            }

            const toDecision = (r: any): Decision => ({
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, surface, openId, chatForId, labelsEditForId, confirmDeleteForId, composerChatForId, newDecisionId]);

  /**
   * ✅ “Save conclusion” (Decisions surface)
   * - DOES NOT change status
   * - Simply stamps decided_at (and can optionally clear review if you want)
   */
  const saveConclusionNow = async (d: Decision) => {
    if (!userId) return;

    const prevDecidedAt = d.decided_at;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, decided_at: new Date().toISOString() } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ decided_at: new Date().toISOString() })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t save: ${error.message}` }, 3500);
      setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, decided_at: prevDecidedAt ?? null } : x)));
      loadRef.current({ silent: true });
      return;
    }

    showToast(
      {
        message: "Conclusion saved.",
        undoLabel: "Undo",
        onUndo: async () => {
          const { error: undoErr } = await supabase
            .from("decisions")
            .update({ decided_at: prevDecidedAt ?? null })
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

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at } : x)));

    const { error } = await supabase.from("decisions").update({ review_at, reviewed_at: null }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t schedule: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Review scheduled." }, 2200);
  };

  const scheduleRevisit = async (d: Decision, days: number) => {
    const review_at = isoNowPlusDays(days);
    await scheduleRevisitAt(d, review_at);
  };

  const clearRevisit = async (d: Decision) => {
    if (!userId) return;

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at: null } : x)));

    const { error } = await supabase.from("decisions").update({ review_at: null }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t clear: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Review cleared." }, 2000);
  };

  const performDelete = async (d: Decision) => {
    if (!userId) return;

    const prev = items;
    setItems((p) => p.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);
    if (labelsEditForId === d.id) setLabelsEditForId(null);
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

    showToast({ message: "Added to context." }, 2000);
  };

  const setDecisionDomain = async (decisionId: string, domainId: string | null) => {
    if (!userId) return;

    setDomainByDecision((prev) => ({ ...prev, [decisionId]: domainId }));

    try {
      if (!domainId) {
        const { error } = await supabase.from("decision_domains").delete().eq("user_id", userId).eq("decision_id", decisionId);
        if (error) throw error;
        showToast({ message: "Cleared." }, 1600);
        return;
      }

      const { error } = await supabase
        .from("decision_domains")
        .upsert({ user_id: userId, decision_id: decisionId, domain_id: domainId }, { onConflict: "user_id,decision_id" });

      if (error) throw error;
      showToast({ message: "Saved." }, 1600);
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
        showToast({ message: "Removed." }, 1600);
        return;
      }

      const { error } = await supabase.from("constellation_items").insert({
        user_id: userId,
        decision_id: decisionId,
        constellation_id: constellationId,
      });

      if (error) throw error;
      showToast({ message: "Saved." }, 1600);
    } catch {
      showToast({ message: `Couldn’t update.` }, 2200);
      loadRef.current({ silent: true });
    }
  };

  const filteredItems = useMemo(() => {
    let list = items;

    if (activeDomainId) {
      list = list.filter((d) => (domainByDecision[d.id] ?? null) === activeDomainId);
    }

    if (activeConstellationId) {
      list = list.filter((d) => (constellationsByDecision[d.id] ?? []).includes(activeConstellationId));
    }

    return list;
  }, [items, activeDomainId, activeConstellationId, domainByDecision, constellationsByDecision]);

  const visibleItems = useMemo(() => {
    if (showAll) return filteredItems;
    return filteredItems.slice(0, DEFAULT_LIMIT);
  }, [filteredItems, showAll]);

  const hasMore = filteredItems.length > DEFAULT_LIMIT;
  const hasAnyLabelOptions = domains.length > 0 || constellations.length > 0;

  const beginEditBody = (d: Decision) => {
    const parts = splitThinkingContext(d.context);
    setIsEditingDraftById((prev) => ({ ...prev, [d.id]: true }));
    setDraftTitleById((prev) => ({ ...prev, [d.id]: d.title ?? "" }));
    setDraftBodyById((prev) => ({ ...prev, [d.id]: parts.draft ?? "" }));

    setOriginalCaptureById((prev) => {
      if (prev[d.id]) return prev;
      return { ...prev, [d.id]: { title: d.title ?? "", captured: parts.captured ?? "" } };
    });
  };

  const cancelEditBody = (d: Decision) => {
    setIsEditingDraftById((prev) => ({ ...prev, [d.id]: false }));
  };

  const saveBodyOverwrite = async (d: Decision) => {
    if (!userId) return;

    const snapshot = originalCaptureById[d.id] ?? { title: d.title ?? "", captured: splitThinkingContext(d.context).captured ?? "" };

    const nextTitle = (draftTitleById[d.id] ?? "").trim() || d.title || "Untitled";
    const nextDraftBody = (draftBodyById[d.id] ?? "").trim();
    const nextContext = composeThinkingContext(snapshot.captured, nextDraftBody);

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, title: nextTitle, context: nextContext } : x)));
    setIsEditingDraftById((prev) => ({ ...prev, [d.id]: false }));

    const { error } = await supabase.from("decisions").update({ title: nextTitle, context: nextContext }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t save: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: "Saved." }, 1600);
  };

  // ✅ Create a new ACTIVE decision for the composer (chat-first)
  const createNewDecisionIfNeeded = async (statementOverride?: string, opts?: { silent?: boolean }) => {
    if (!userId) {
      if (!opts?.silent) showToast({ message: "Not signed in." }, 2500);
      return null;
    }

    if (newDecisionId) return newDecisionId;

    const statement = (statementOverride ?? newText ?? "").trim();
    if (!statement) {
      if (!opts?.silent) {
        showToast({ message: "Type your decision first." }, 2200);
        try {
          composerInputRef.current?.focus?.();
        } catch {}
      }
      return null;
    }

    if (creatingNew) return null;
    setCreatingNew(true);

    try {
      const title = titleFromStatement(statement);
      const context = composeThinkingContext(statement, "");

      // ✅ IMPORTANT:
      // We intentionally do NOT use "draft" here.
      // We set status to "open" (active). Ensure your DB accepts this value.
      const { data, error } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          title,
          context,
          status: "open",
          origin: "decisions",
          decided_at: null,
        })
        .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments")
        .single();

      if (error || !data?.id) {
        if (!opts?.silent) showToast({ message: `Couldn’t create: ${error?.message ?? "Unknown error"}` }, 3500);
        return null;
      }

      const row: any = data;
      const created: Decision = {
        id: row.id,
        user_id: row.user_id,
        title: row.title ?? title,
        context: row.context ?? context,
        status: row.status ?? "open",
        created_at: row.created_at ?? new Date().toISOString(),
        decided_at: row.decided_at ?? null,
        review_at: row.review_at ?? null,
        origin: row.origin ?? "decisions",
        framed_at: row.framed_at ?? null,
        attachments: normalizeAttachments(row.attachments),
      };

      setItems((prev) => [created, ...prev]);

      setOriginalCaptureById((prev) => ({
        ...prev,
        [created.id]: { title: created.title ?? "", captured: statement },
      }));

      setNewDecisionId(created.id);

      // default: hide Files until user asks (or there are files)
      setComposerShowFiles(false);

      setAnimateCardId(created.id);
      window.setTimeout(() => setAnimateCardId(null), 700);

      return created.id;
    } catch (e: any) {
      if (!opts?.silent) showToast({ message: e?.message ?? "Couldn’t create." }, 3500);
      return null;
    } finally {
      setCreatingNew(false);
    }
  };

  const openCardAtTop = (id: string) => {
    setOpenId(id);
    setHighlightId(id);

    // open conversation by default
    setChatForId(id);
    setChatFocusTokenById((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));

    window.setTimeout(() => {
      const el = cardRefs.current[id];
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 80);

    window.setTimeout(() => setHighlightId(null), 1600);
  };

  const resetComposer = () => {
    setNewText("");
    setNewDecisionId(null);
    setCreatingNew(false);
    setComposerChatForId(null);
    setComposerShowFiles(false);
    try {
      composerInputRef.current?.focus?.({ preventScroll: true } as any);
    } catch {
      try {
        composerInputRef.current?.focus?.();
      } catch {}
    }
  };

  const assistedScope = surface === "decisions" ? "decisions" : "thinking";

  const sendFromComposer = async () => {
    const text = (newText ?? "").trim();
    if (!text) {
      showToast({ message: "Type your decision first." }, 2000);
      return;
    }

    const id = await createNewDecisionIfNeeded(text);
    if (!id) return;

    setComposerChatForId(id);

    // hand first message into ConversationPanel
    setPendingFirstMsgById((p) => ({ ...p, [id]: text }));
    setPendingFirstMsgTokenById((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));

    // focus + boot
    setChatFocusTokenById((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));

    // clear input
    setNewText("");

    window.setTimeout(() => {
      const el = document.getElementById("composer-chat");
      el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 60);
  };

  // ✅ Auto-create when typing starts (Decisions surface only)
  useEffect(() => {
    if (surface !== "decisions") return;
    if (!userId) return;
    if (composerChatForId) return;
    if (newDecisionId) return;

    const t = (newText ?? "").trim();
    if (t.length < 3) {
      if (autoCreateTimerRef.current) window.clearTimeout(autoCreateTimerRef.current);
      autoCreateTimerRef.current = null;
      return;
    }

    if (autoCreateTimerRef.current) window.clearTimeout(autoCreateTimerRef.current);
    autoCreateTimerRef.current = window.setTimeout(() => {
      void createNewDecisionIfNeeded(t, { silent: true });
    }, 550);

    return () => {
      if (autoCreateTimerRef.current) window.clearTimeout(autoCreateTimerRef.current);
      autoCreateTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newText, userId, surface, composerChatForId, newDecisionId]);

  return (
    <Page title={pageTitle} subtitle={pageSubtitle} right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {surface === "decisions" ? (
          <div className="flex justify-center">
            <div className="flex flex-wrap items-center gap-2">
              <Chip active title="Active (this page)">
                Active
              </Chip>
              <Chip onClick={() => router.push("/revisit")} title="Review (filter view)">
                Review
              </Chip>
              <Chip onClick={() => router.push("/chapters")} title="Chapters">
                Chapters
              </Chip>
            </div>
          </div>
        ) : (
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
        )}

        {/* ✅ Chat-first composer (Decisions only) — calmer, not “chat app” */}
        {surface === "decisions" ? (
          <div ref={composerRef} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Talk it through</div>
                <div className="text-sm text-zinc-600">Start typing. We’ll create the decision quietly in the background.</div>
              </div>

              {composerChatForId ? (
                <div id="composer-chat" className="pt-1">
                  <ConversationPanel
                    decisionId={composerChatForId}
                    decisionTitle={items.find((x) => x.id === composerChatForId)?.title ?? "New decision"}
                    askedText={items.find((x) => x.id === composerChatForId)?.title ?? ""}
                    frame={{ decision_statement: items.find((x) => x.id === composerChatForId)?.title ?? "" }}
                    onClose={() => setComposerChatForId(null)}
                    onSummarySaved={() => void reloadSummaries(composerChatForId)}
                    autoFocusToken={chatFocusTokenById[composerChatForId] ?? 0}
                    autoStartToken={chatFocusTokenById[composerChatForId] ?? 0}
                    initialUserMessage={pendingFirstMsgById[composerChatForId] ?? ""}
                    initialUserMessageToken={pendingFirstMsgTokenById[composerChatForId] ?? 0}
                    onInitialUserMessageConsumed={() => {
                      const id = composerChatForId;
                      if (!id) return;
                      setPendingFirstMsgById((p) => ({ ...p, [id]: "" }));
                    }}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {newDecisionId ? (
                      <Chip
                        onClick={() => {
                          const id = newDecisionId;
                          if (!id) return;
                          openCardAtTop(id);
                          setComposerChatForId(null);
                        }}
                        title="Open below"
                      >
                        Go to it
                      </Chip>
                    ) : null}

                    <Chip onClick={resetComposer} title="Start a fresh new decision">
                      New decision
                    </Chip>
                  </div>

                  {userId && newDecisionId && (composerShowFiles || composerHasFiles) ? (
                    <div className="mt-3 rounded-2xl bg-white">
                      <AttachmentsBlock userId={userId} decisionId={newDecisionId} title="Files" bucket="captures" initial={[]} />
                      <div className="mt-2 text-xs text-zinc-500">These files are attached to this decision.</div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <textarea
                    ref={composerInputRef}
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    rows={3}
                    placeholder="What decision are you holding right now?"
                    className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    onKeyDown={(e) => {
                      // Enter sends (Shift+Enter newline)
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendFromComposer();
                      }
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <PrimaryActionButton disabled={creatingNew} onClick={() => void sendFromComposer()} title="Start the conversation">
                      {creatingNew ? "Starting…" : "Talk"}
                    </PrimaryActionButton>

                    <Chip
                      onClick={async () => {
                        const id = await createNewDecisionIfNeeded(undefined, { silent: false });
                        if (!id) return;
                        setComposerShowFiles(true);
                        setComposerChatForId(id);
                      }}
                      title="Attach files"
                    >
                      Add files
                    </Chip>

                    {newDecisionId ? (
                      <Chip
                        onClick={() => {
                          const id = newDecisionId;
                          if (!id) return;
                          openCardAtTop(id);
                          setComposerChatForId(null);
                        }}
                        title="Open below"
                      >
                        Go to it
                      </Chip>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        <AssistedSearch scope={assistedScope as any} placeholder="Search decisions…" />

        <div className="space-y-4">
          <TilesRow title="Filter by area" items={domains} activeId={activeDomainId} onSelect={(id) => setActiveDomainId(id)} />
          <TilesRow
            title="Filter by group"
            items={constellations}
            activeId={activeConstellationId}
            onSelect={(id) => setActiveConstellationId(id)}
          />
        </div>

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {filteredItems.length > 0 && hasMore ? (
          <div className="flex items-center gap-2">
            <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
            {!showAll ? (
              <div className="text-xs text-zinc-500">
                Showing {DEFAULT_LIMIT} of {filteredItems.length}
              </div>
            ) : null}
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">All clear.</div>
              <div className="text-sm text-zinc-600">When something needs attention, it can live here quietly.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleItems.map((d, idx) => {
              const isOpen = openId === d.id;
              const isChatOpen = chatForId === d.id;
              const showDetails = !!showDetailsById[d.id];

              const domainId = domainByDecision[d.id] ?? null;
              const domainName = domainId ? domains.find((x) => x.id === domainId)?.name ?? null : null;

              const memberIds = constellationsByDecision[d.id] ?? [];
              const memberNames = memberIds
                .map((cid) => constellations.find((c) => c.id === cid)?.name)
                .filter(Boolean) as string[];

              const filedUnder = [domainName, ...memberNames].filter(Boolean) as string[];
              const isEditingLabels = labelsEditForId === d.id;

              const showFiledUnderCard =
                (hasAnyLabelOptions && isEditingLabels) || (hasAnyLabelOptions && filedUnder.length > 0);

              const revisitMode = revisitModeById[d.id] ?? "";
              const customDate = customDateById[d.id] ?? "";

              const parts = splitThinkingContext(d.context);
              const originalSnapshot = originalCaptureById[d.id] ?? { title: d.title ?? "", captured: parts.captured ?? "" };
              const isEditingDraft = !!isEditingDraftById[d.id];

              const allAtt = normalizeAttachments(d.attachments) as AttachmentMeta[];
              const attachmentsTitle = allAtt.length > 0 ? `Files (${allAtt.length})` : "Files";

              return (
                <div
                  key={d.id}
                  ref={(el) => {
                    cardRefs.current[d.id] = el;
                  }}
                  className={[
                    "bg-white",
                    "rounded-2xl border border-zinc-200",
                    "px-4 py-4",
                    highlightId === d.id ? "ring-2 ring-zinc-200" : "",
                    animateCardId === d.id ? "animate-pulse" : "",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpen = isOpen ? null : d.id;
                      setOpenId(nextOpen);

                      if (!nextOpen) {
                        setChatForId(null);
                        setLabelsEditForId(null);
                        setConfirmDeleteForId(null);
                        return;
                      }

                      // when opening: ensure snapshot + open conversation by default
                      setOriginalCaptureById((prev) => {
                        if (prev[d.id]) return prev;
                        return { ...prev, [d.id]: { title: d.title ?? "", captured: parts.captured ?? "" } };
                      });

                      setChatForId(d.id);
                      setChatFocusTokenById((p) => ({ ...p, [d.id]: (p[d.id] ?? 0) + 1 }));
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
                          {d.decided_at ? ` • Conclusion saved ${softWhen(d.decided_at)}` : ""}
                          {d.review_at ? ` • Review ${softWhen(d.review_at)}` : ""}
                        </div>

                        {filedUnder.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {domainName ? <Chip title="Filed under">{domainName}</Chip> : null}
                            {memberNames.slice(0, 2).map((n) => (
                              <Chip key={n} title="Filed under">
                                {n}
                              </Chip>
                            ))}
                            {memberNames.length > 2 ? <Chip title="More">+{memberNames.length - 2}</Chip> : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                      </div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="mt-4 space-y-4">
                      {/* Conversation first (primary experience) */}
                      {isChatOpen ? (
                        <ConversationPanel
                          decisionId={d.id}
                          decisionTitle={d.title}
                          askedText={d.title}
                          frame={{ decision_statement: d.title }}
                          autoFocusToken={chatFocusTokenById[d.id] ?? 0}
                          autoStartToken={chatFocusTokenById[d.id] ?? 0}
                          onClose={() => setChatForId(null)}
                          onSummarySaved={() => void reloadSummaries(d.id)}
                        />
                      ) : (
                        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-zinc-900">Conversation</div>
                              <div className="mt-0.5 text-xs text-zinc-500 truncate">Anchored to: {d.title}</div>
                            </div>
                            <Chip
                              onClick={() => {
                                setChatForId(d.id);
                                setChatFocusTokenById((p) => ({ ...p, [d.id]: (p[d.id] ?? 0) + 1 }));
                              }}
                            >
                              Open
                            </Chip>
                          </div>
                        </div>
                      )}

                      {/* Primary actions */}
                      <div className="space-y-2">
                        {confirmDeleteForId === d.id ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C94A4A] bg-[#FCECEC] px-4 py-3">
                            <div className="text-sm text-[#7A1E1E]">
                              Delete this decision? <span className="opacity-80">This can’t be undone.</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Chip onClick={() => setConfirmDeleteForId(null)} title="Cancel">
                                Cancel
                              </Chip>
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
                            {/* ✅ No status change */}
                            <PrimaryActionButton onClick={() => void saveConclusionNow(d)} title="Stamp the conclusion as saved">
                              Save conclusion
                            </PrimaryActionButton>

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-xs text-zinc-500">Review</div>

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
                                    title="Set review date"
                                  >
                                    Set
                                  </Chip>
                                </div>
                              ) : null}

                              {d.review_at ? (
                                <Chip onClick={() => void clearRevisit(d)} title="Clear review">
                                  Clear
                                </Chip>
                              ) : null}
                            </div>

                            <Chip onClick={() => router.push("/revisit")} title="Open Review view">
                              Review view
                            </Chip>

                            <Chip
                              onClick={() => setShowDetailsById((p) => ({ ...p, [d.id]: !p[d.id] }))}
                              title="Show/hide notes, files, labels"
                            >
                              {showDetails ? "Hide details" : "Details"}
                            </Chip>

                            <Chip onClick={() => setConfirmDeleteForId(d.id)} title="Delete">
                              Delete
                            </Chip>
                          </div>
                        )}
                      </div>

                      {/* Details (collapsed by default) */}
                      {showDetails ? (
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-2">
                            <div className="text-sm font-semibold text-zinc-900">Original</div>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                              {(originalSnapshot.captured || originalSnapshot.title || "").trim() || "—"}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-zinc-900">Working notes</div>

                              {!isEditingDraft ? (
                                <Chip onClick={() => beginEditBody(d)} title="Edit">
                                  Edit
                                </Chip>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Chip onClick={() => cancelEditBody(d)} title="Cancel">
                                    Cancel
                                  </Chip>
                                  <Chip onClick={() => void saveBodyOverwrite(d)} title="Save">
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
                                aria-label="Decision title"
                              />
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Body</div>

                              {!isEditingDraft ? (
                                <div className="whitespace-pre-wrap rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-800">
                                  {parts.draft?.trim() ? parts.draft : <span className="text-zinc-500">Notes (optional)…</span>}
                                </div>
                              ) : (
                                <textarea
                                  value={draftBodyById[d.id] ?? parts.draft ?? ""}
                                  onChange={(e) => setDraftBodyById((prev) => ({ ...prev, [d.id]: e.target.value }))}
                                  placeholder="Notes (optional)…"
                                  className="w-full min-h-[160px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                                  aria-label="Decision notes"
                                />
                              )}
                            </div>
                          </div>

                          <DecisionNotes decisionId={d.id} kind="thinking" />

                          {showFiledUnderCard ? (
                            <div className="rounded-2xl border border-zinc-200 bg-white p-3 space-y-2">
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
                          ) : null}

                          <div className="rounded-2xl border border-zinc-200 bg-white p-3 space-y-2">
                            {userId ? (
                              <AttachmentsBlock userId={userId} decisionId={d.id} title={attachmentsTitle} bucket="captures" initial={allAtt} />
                            ) : (
                              <div className="text-sm text-zinc-600">Files unavailable.</div>
                            )}
                          </div>

                          {summaries.length > 0 ? (
                            <div className="rounded-2xl border border-zinc-200 bg-white p-3 space-y-2">
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-zinc-700">Saved chat summaries</div>
                                <div className="text-xs text-zinc-500">Tap to append one into context if useful.</div>
                              </div>

                              {summaries.map((s) => (
                                <div key={s.id} className="space-y-2">
                                  <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{s.summary_text}</div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Chip onClick={() => useSummaryAsContext(d, s)} title="Append into context">
                                      Use as context
                                    </Chip>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {/* subtle divider for rhythm */}
                      {idx !== visibleItems.length - 1 ? <div className="pt-1" /> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
