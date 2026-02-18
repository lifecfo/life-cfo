"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, useToast } from "@/components/ui";
import { ConversationPanel } from "./ConversationPanel";

import { TilesRow } from "@/components/TilesRow";
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

function PrimaryActionButton(props: {
  children: ReactNode;
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

function buildUrl(tab: Tab, open?: string | null, work?: boolean) {
  const sp = new URLSearchParams();
  sp.set("tab", tab);
  if (open) sp.set("open", open);
  if (work) sp.set("work", "1");
  const s = sp.toString();
  return s ? `/decisions?${s}` : "/decisions";
}

function isReviewDue(review_at: string | null) {
  const ms = safeMs(review_at);
  if (!ms) return false;
  return ms <= Date.now();
}

export default function DecisionsClient() {
  const router = useRouter();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const tabParam = (searchParams.get("tab") as Tab | null) ?? "new";
  const tab: Tab = tabParam === "active" || tabParam === "closed" || tabParam === "new" ? tabParam : "new";

  const openFromQuery = searchParams.get("open");
  const workFromQuery = searchParams.get("work") === "1";

  // Ensure /decisions defaults to tab=new
  useEffect(() => {
    const hasTab = searchParams.get("tab");
    if (!hasTab) router.replace(buildUrl("new"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageTitle = "Decisions";
  const pageSubtitle =
    tab === "new"
      ? "What needs deciding? Start messy — we’ll clarify it as we go."
      : tab === "active"
      ? "Active decisions you’re working through."
      : "Closed decisions live here quietly — still searchable whenever you need them.";

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);

  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);

  const [domainByDecision, setDomainByDecision] = useState<Record<string, string | null>>({});
  const [constellationsByDecision, setConstellationsByDecision] = useState<Record<string, string[]>>({});

  const [openId, setOpenId] = useState<string | null>(null);
  const [workForId, setWorkForId] = useState<string | null>(null);

  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);

  const reloadTimerRef = useRef<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [notesEditingById, setNotesEditingById] = useState<Record<string, boolean>>({});
  const [notesDraftById, setNotesDraftById] = useState<Record<string, string>>({});

  const [confirmDeleteForId, setConfirmDeleteForId] = useState<string | null>(null);

  // Page 2 search + review filter
  const [searchText, setSearchText] = useState<string>("");
  const [reviewOnly, setReviewOnly] = useState<boolean>(false);

  // Page 1 new decision input
  const newRef = useRef<HTMLTextAreaElement | null>(null);
  const [newText, setNewText] = useState<string>("");
  const [creatingNew, setCreatingNew] = useState<boolean>(false);

  // ✅ Page 1 framing step (PATCH)
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

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => void load({ silent: true }), 250);
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

    // Load decisions for this tab
    const q = supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    const { data, error } = tab === "active" || tab === "new" ? await q.neq("status", "chapter") : await q.eq("status", "chapter");

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
        .map((r) => ({ id: String(r.id), name: String(r.name), sort_order: typeof r.sort_order === "number" ? r.sort_order : null }));
      setDomains(sortByName(next));
    }

    if (!conRes.error) {
      const rows = (conRes.data ?? []) as any[];
      const next: Constellation[] = rows
        .filter((r) => r && r.id && r.name)
        .map((r) => ({ id: String(r.id), name: String(r.name), sort_order: typeof r.sort_order === "number" ? r.sort_order : null }));
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

  useEffect(() => {
    void load();
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
        const el = cardRefs.current[openFromQuery];
        el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, 60);
    } else {
      setOpenId(null);
    }

    if (workFromQuery && openFromQuery) {
      setWorkForId(openFromQuery);
      window.setTimeout(() => {
        const el = document.getElementById("work-through-panel");
        el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, 80);
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

  const openDecision = useMemo(() => items.find((d) => d.id === openId) ?? null, [items, openId]);

  useEffect(() => {
    if (!userId || !openDecision) {
      setSummaries([]);
      return;
    }
    void reloadSummaries(openDecision.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openDecision?.id]);

  const filteredItems = useMemo(() => {
    let list = items;

    // tab filter already handled in load; still safe here
    if (tab === "closed") list = list.filter((d) => d.status === "chapter");
    if (tab === "active" || tab === "new") list = list.filter((d) => d.status !== "chapter");

    // Page 2 filters
    if (tab === "active") {
      if (reviewOnly) list = list.filter((d) => isReviewDue(d.review_at));
      const t = (searchText ?? "").trim().toLowerCase();
      if (t) {
        list = list.filter((d) => {
          const ctx = (d.context ?? "").toLowerCase();
          return d.title.toLowerCase().includes(t) || ctx.includes(t);
        });
      }
    }

    // label filters (only meaningful on list surfaces)
    if (tab === "active") {
      if (activeDomainId) list = list.filter((d) => (domainByDecision[d.id] ?? null) === activeDomainId);
      if (activeConstellationId) list = list.filter((d) => (constellationsByDecision[d.id] ?? []).includes(activeConstellationId));
    }

    return list;
  }, [items, tab, reviewOnly, searchText, activeDomainId, activeConstellationId, domainByDecision, constellationsByDecision]);

  const openItem = tab === "active" && openId ? filteredItems.find((d) => d.id === openId) ?? null : null;
  const others = useMemo(() => filteredItems.filter((d) => d.id !== openId), [filteredItems, openId]);

  const visibleOthers = useMemo(() => {
    if (showAll) return others;
    return others.slice(0, DEFAULT_LIMIT);
  }, [others, showAll]);

  const hasMore = others.length > DEFAULT_LIMIT;

  // (kept) simple createNewDecision - no longer used by Page 1 UI after patch, but harmless to keep
  const createNewDecision = async () => {
    if (!userId) {
      showToast({ message: "Not signed in." }, 2500);
      return;
    }

    const statement = (newText ?? "").trim();
    if (!statement) {
      showToast({ message: "Type your decision first." }, 2000);
      newRef.current?.focus?.();
      return;
    }

    if (creatingNew) return;
    setCreatingNew(true);

    try {
      const title = titleFromStatement(statement);
      const context = composeContext(statement, "");

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
        .select("id")
        .single();

      if (error || !data?.id) {
        showToast({ message: `Couldn’t save: ${error?.message ?? "Unknown error"}` }, 3500);
        return;
      }

      const id = String(data.id);
      setNewText("");
      showToast({ message: "Saved to Active Decisions." }, 1800);

      router.push(buildUrl("active", id, false));
    } finally {
      setCreatingNew(false);
    }
  };

  // ✅ PATCH: Page 1 requestFrame + saveFramedDecision
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

      const next: FrameDraft = {
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
      // captured = original (messy); title = framed
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

      // reset page 1 state
      setNewText("");
      setFrameDraft(null);
      setNewStep("input");

      showToast({ message: "Saved to Active Decisions." }, 1500);
      router.push(buildUrl("active", id, false));
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

  const saveNotes = async (d: Decision, captured: string, draftNotes: string) => {
    if (!userId) return;

    const nextContext = composeContext(captured, draftNotes);

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, context: nextContext } : x)));
    setNotesEditingById((p) => ({ ...p, [d.id]: false }));

    const { error } = await supabase.from("decisions").update({ context: nextContext }).eq("id", d.id).eq("user_id", userId);
    if (error) {
      showToast({ message: `Couldn’t save: ${error.message}` }, 3500);
      scheduleReload();
      return;
    }
    showToast({ message: "Saved." }, 1600);
  };

  const closeDecision = async (d: Decision) => {
    if (!userId) return;
    const prev = d.status;

    setItems((p) => p.map((x) => (x.id === d.id ? { ...x, status: "chapter" } : x)));

    const { error } = await supabase.from("decisions").update({ status: "chapter" }).eq("id", d.id).eq("user_id", userId);
    if (error) {
      showToast({ message: `Couldn’t close: ${error.message}` }, 3500);
      setItems((p) => p.map((x) => (x.id === d.id ? { ...x, status: prev } : x)));
      return;
    }

    showToast({ message: "Closed." }, 1800);
    router.push(buildUrl("active")); // remain on Active
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

  const TopTabs = () => (
    <div className="flex justify-center">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={tab === "new"} onClick={() => router.push(buildUrl("new"))} title="New decision">
          New Decision
        </Chip>
        <Chip active={tab === "active"} onClick={() => router.push(buildUrl("active"))} title="Active decisions">
          Active Decisions
        </Chip>
        <Chip active={tab === "closed"} onClick={() => router.push(buildUrl("closed"))} title="Closed decisions">
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
              router.push(buildUrl("active", d.id, false));
              window.setTimeout(() => {
                const el = cardRefs.current[d.id];
                el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
              }, 60);
            }}
          >
            Open
          </Chip>
        </div>
      </div>
    </div>
  );

  const renderOpenDecision = (d: Decision) => {
    const parts = splitContext(d.context);
    const editing = !!notesEditingById[d.id];
    const draftNotes = notesDraftById[d.id] ?? parts.notes ?? "";

    const allAtt = normalizeAttachments(d.attachments) as AttachmentMeta[];

    const isWorking = workForId === d.id;

    return (
      <div
        ref={(el) => {
          cardRefs.current[d.id] = el;
        }}
        className="rounded-2xl border border-zinc-200 bg-white p-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-semibold text-zinc-900">{d.title}</div>
            <div className="mt-1 text-xs text-zinc-500">
              Started {softWhen(d.created_at)}
              {d.review_at ? ` • Review ${softWhen(d.review_at)}` : ""}
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <Chip
              onClick={() => {
                setOpenId(null);
                setWorkForId(null);
                setConfirmDeleteForId(null);
                router.push(buildUrl("active"));
              }}
            >
              Hide
            </Chip>
          </div>
        </div>

        {/* ✅ Green button (2b trigger) */}
        {!isWorking ? (
          <div className="mt-4">
            <PrimaryActionButton
              onClick={() => {
                setWorkForId(d.id);
                router.push(buildUrl("active", d.id, true));
                window.setTimeout(() => {
                  const el = document.getElementById("work-through-panel");
                  el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                }, 60);
              }}
              title="Open the conversation"
            >
              Let’s work this through
            </PrimaryActionButton>
          </div>
        ) : null}

        {/* ✅ Conversation appears, everything else stays below and scrollable */}
        {isWorking ? (
          <div id="work-through-panel" className="mt-4">
            <ConversationPanel
              decisionId={d.id}
              decisionTitle={d.title}
              askedText={d.title}
              frame={{ decision_statement: d.title }}
              autoFocusToken={1}
              autoStartToken={1}
              onClose={() => {
                setWorkForId(null);
                router.push(buildUrl("active", d.id, false));
              }}
              onSummarySaved={() => void reloadSummaries(d.id)}
            />
          </div>
        ) : null}

        {/* Workspace */}
        <div className="mt-5 space-y-4">
          {/* Notes (single section) */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-zinc-900">Notes</div>

              {!editing ? (
                <Chip
                  onClick={() => {
                    setNotesEditingById((p) => ({ ...p, [d.id]: true }));
                    setNotesDraftById((p) => ({ ...p, [d.id]: parts.notes ?? "" }));
                  }}
                >
                  Edit
                </Chip>
              ) : (
                <div className="flex items-center gap-2">
                  <Chip onClick={() => setNotesEditingById((p) => ({ ...p, [d.id]: false }))}>Cancel</Chip>
                  <Chip onClick={() => void saveNotes(d, parts.captured, draftNotes)}>Save</Chip>
                </div>
              )}
            </div>

            {!editing ? (
              <div className="whitespace-pre-wrap rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-800">
                {parts.notes?.trim() ? parts.notes : <span className="text-zinc-500">Add a note…</span>}
              </div>
            ) : (
              <textarea
                value={draftNotes}
                onChange={(e) => setNotesDraftById((p) => ({ ...p, [d.id]: e.target.value }))}
                placeholder="Add a note…"
                className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              />
            )}
          </div>

          {/* Files */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            {userId ? (
              <AttachmentsBlock userId={userId} decisionId={d.id} title={allAtt.length ? `Files (${allAtt.length})` : "Files"} bucket="captures" initial={allAtt} />
            ) : (
              <div className="text-sm text-zinc-600">Files unavailable.</div>
            )}
          </div>

          {/* Review (optional) */}
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

              {summaries.map((s) => (
                <div key={s.id} className="space-y-2">
                  <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{s.summary_text}</div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Actions */}
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
              <Chip onClick={() => setConfirmDeleteForId(d.id)} title="Delete decision">
                Delete
              </Chip>
              <Chip onClick={() => void closeDecision(d)} title="Close decision">
                Close decision
              </Chip>
            </div>
          )}
        </div>
      </div>
    );
  };

  const reviewCount = useMemo(() => {
    if (tab !== "active") return 0;
    return items.filter((d) => d.status !== "chapter" && isReviewDue(d.review_at)).length;
  }, [tab, items]);

  return (
    <Page title={pageTitle} subtitle={pageSubtitle} right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <TopTabs />

        {/* ✅ Page 1: New Decision (AI clarify flow) */}
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

                <Chip onClick={() => router.push(buildUrl("active"))} title="Go to Active Decisions">
                  Active Decisions
                </Chip>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Page 2: Active Decisions */}
        {tab === "active" ? (
          <div className="space-y-4">
            {/* Search bar + review filter (your sketch) */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="flex items-center gap-2">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search decisions…"
                  className="h-10 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                />

                <Chip active={reviewOnly} onClick={() => setReviewOnly((v) => !v)} title="Filter to decisions needing review">
                  Review{reviewCount ? ` (${reviewCount})` : ""}
                </Chip>
              </div>

              {activeDomainId || activeConstellationId ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip onClick={() => setActiveDomainId(null)} title="Clear area filter">
                    Clear area
                  </Chip>
                  <Chip onClick={() => setActiveConstellationId(null)} title="Clear group filter">
                    Clear group
                  </Chip>
                </div>
              ) : null}
            </div>

            {/* Optional label tiles */}
            <div className="space-y-4">
              <TilesRow title="Filter by area" items={domains} activeId={activeDomainId} onSelect={(id) => setActiveDomainId(id)} />
              <TilesRow title="Filter by group" items={constellations} activeId={activeConstellationId} onSelect={(id) => setActiveConstellationId(id)} />
            </div>

            <div className="text-xs text-zinc-500">{statusLine}</div>

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                  <div className="text-sm text-zinc-600">When something needs attention, it can live here quietly.</div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Open decision (separate from list) */}
                {openItem ? (
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-zinc-500">Open decision</div>
                    {renderOpenDecision(openItem)}
                  </div>
                ) : null}

                {/* List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-zinc-500">{openItem ? "Other decisions" : "Decisions"}</div>

                    {hasMore ? (
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

                  <div className="rounded-2xl border border-zinc-200 bg-white">{visibleOthers.map((d) => <DecisionRow key={d.id} d={d} />)}</div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Page 3: Closed Decisions */}
        {tab === "closed" ? (
          <div className="space-y-3">
            <div className="text-xs text-zinc-500">{statusLine}</div>

            {filteredItems.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="text-sm text-zinc-600">No closed decisions yet.</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200 bg-white">
                {filteredItems.map((d) => (
                  <div key={d.id} className="px-4 py-4 border-b border-zinc-200 last:border-b-0">
                    <div className="text-base font-semibold text-zinc-900">{d.title}</div>
                    <div className="mt-1 text-xs text-zinc-500">Started {softWhen(d.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Page>
  );
}
