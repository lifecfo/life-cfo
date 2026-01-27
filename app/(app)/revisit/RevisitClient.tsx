// app/(app)/revisit/RevisitClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { createSignedUrl, normalizeAttachments, softKB, type AttachmentMeta } from "@/lib/attachments";

// ✅ Assisted retrieval + tiles
import { AssistedSearch } from "@/components/AssistedSearch";
import { TilesRow } from "@/components/TilesRow";

export const dynamic = "force-dynamic";

type Decision = {
  id: string;
  user_id: string;
  title: string;
  context: string | null;
  status: string;
  created_at: string;
  decided_at: string | null;
  review_at: string | null;

  review_notes: string | null;
  review_history: unknown[] | null;
  reviewed_at?: string | null;

  attachments: AttachmentMeta[] | null; // decisions.attachments (jsonb)
};

type DecisionsRow = {
  id: string;
  user_id: string;
  title: string | null;
  context: string | null;
  status: string | null;
  created_at: string | null;
  decided_at: string | null;
  review_at: string | null;
  review_notes: string | null;
  review_history: unknown[] | null;
  reviewed_at: string | null;
  attachments: unknown;
};

type LastUndo = {
  label: string;
  decisionId: string;
  prev: Partial<Decision>;
};

type DecisionPatch = {
  review_at?: string | null;
  reviewed_at?: string | null;
  review_history?: unknown[] | null;
};

type Domain = {
  id: string;
  name: string;
  sort_order?: number | null;
  emoji?: string | null;
};

type Constellation = {
  id: string;
  name: string;
  sort_order?: number | null;
  emoji?: string | null;
};

const SOON_DAYS = 7;

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function addDaysMs(days: number) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function softDate(iso: string | null) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function dayDiffFromNow(iso: string) {
  const ms = safeMs(iso);
  if (!ms) return null;
  const diff = ms - Date.now();
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

function isoFromDateInput(dateStr: string) {
  // dateStr is YYYY-MM-DD. Use midday local time to avoid DST edge weirdness.
  if (!dateStr) return null;
  const ms = Date.parse(`${dateStr}T12:00:00`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sortByName<T extends { name: string; sort_order?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 9999;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 9999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

export default function RevisitClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const [lastUndo, setLastUndo] = useState<LastUndo | null>(null);

  // ✅ V1: top-5 default per section
  const DEFAULT_LIMIT = 5;
  const [showAllDue, setShowAllDue] = useState(false);
  const [showAllSoon, setShowAllSoon] = useState(false);

  // ✅ Labels (tiles + assignment) — internal tables remain domains/constellations
  const [domains, setDomains] = useState<Domain[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);

  const [domainByDecision, setDomainByDecision] = useState<Record<string, string | null>>({});
  const [constellationsByDecision, setConstellationsByDecision] = useState<Record<string, string[]>>({});

  // ✅ Collapsed label editor + revisit UI state
  const [labelsEditForId, setLabelsEditForId] = useState<string | null>(null);
  const [revisitModeById, setRevisitModeById] = useState<Record<string, "7" | "30" | "90" | "custom" | "">>({});
  const [customDateById, setCustomDateById] = useState<Record<string, string>>({});

  // signed url cache (path -> signedUrl)
  const [signed, setSigned] = useState<Record<string, string>>({});
  const signingRef = useRef<Record<string, boolean>>({});

  // throttle / reload protection
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const queuedRefetchRef = useRef(false);

  const ensureSignedUrl = async (path: string) => {
    if (!path) return null;
    if (signed[path]) return signed[path];
    if (signingRef.current[path]) return null;

    signingRef.current[path] = true;
    try {
      const url = await createSignedUrl(supabase, path, { bucket: "captures", expiresInSec: 60 * 10 });
      if (!url) return null;

      setSigned((prev) => ({ ...prev, [path]: url }));
      return url;
    } finally {
      signingRef.current[path] = false;
    }
  };

  const openAttachment = async (att: AttachmentMeta) => {
    const url = await ensureSignedUrl(att.path);
    if (!url) {
      setStatusLine("Couldn’t open attachment.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const loadTiles = async (uid: string) => {
    const [domRes, conRes] = await Promise.all([
      supabase.from("domains").select("id,name,sort_order,emoji").eq("user_id", uid).order("sort_order", { ascending: true }),
      supabase
        .from("constellations")
        .select("id,name,sort_order,emoji")
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
          emoji: typeof r.emoji === "string" ? r.emoji : null,
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
          emoji: typeof r.emoji === "string" ? r.emoji : null,
        }));
      setConstellations(sortByName(next));
    }
  };

  const loadMeaningMaps = async (uid: string, decisionIds: string[]) => {
    if (decisionIds.length === 0) {
      setDomainByDecision({});
      setConstellationsByDecision({});
      return;
    }

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
  };

  const dueItemsRaw = useMemo(() => {
    const now = Date.now();
    const soonCutoff = addDaysMs(SOON_DAYS);

    const due: Decision[] = [];
    const soon: Decision[] = [];

    for (const d of items) {
      const ms = safeMs(d.review_at);
      if (!ms) continue;

      if (ms <= now) due.push(d);
      else if (ms <= soonCutoff) soon.push(d);
    }

    const sortByReview = (a: Decision, b: Decision) => {
      const am = safeMs(a.review_at) ?? 0;
      const bm = safeMs(b.review_at) ?? 0;
      return am - bm;
    };

    due.sort(sortByReview);
    soon.sort(sortByReview);

    return { due, soon };
  }, [items]);

  const load = async (uid: string) => {
    const now = Date.now();
    const elapsed = now - lastFetchAtRef.current;

    if (inFlightRef.current) {
      queuedRefetchRef.current = true;
      return;
    }
    if (elapsed < 700) {
      queuedRefetchRef.current = true;
      window.setTimeout(() => {
        if (!isMountedRef.current) return;
        if (!queuedRefetchRef.current) return;
        queuedRefetchRef.current = false;
        void load(uid);
      }, 750 - elapsed);
      return;
    }

    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    const { data, error } = await supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,review_notes,review_history,reviewed_at,attachments")
      .eq("user_id", uid)
      .neq("status", "draft")
      .not("review_at", "is", null)
      .order("review_at", { ascending: true });

    inFlightRef.current = false;

    if (!isMountedRef.current) return;

    if (error) {
      setStatusLine(`Error: ${error.message}`);
      setItems([]);
      return;
    }

    const rows = (data ?? []) as DecisionsRow[];
    const normalized: Decision[] = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      title: r.title ?? "",
      context: r.context ?? null,
      status: r.status ?? "",
      created_at: r.created_at ?? new Date().toISOString(),
      decided_at: r.decided_at ?? null,
      review_at: r.review_at ?? null,
      review_notes: r.review_notes ?? null,
      review_history: r.review_history ?? null,
      reviewed_at: r.reviewed_at ?? null,
      attachments: normalizeAttachments(r.attachments),
    }));

    setItems(normalized);
    setStatusLine(normalized.length === 0 ? "Nothing scheduled." : `Loaded ${normalized.length}.`);

    void loadMeaningMaps(uid, normalized.map((x) => x.id));
  };

  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!isMountedRef.current) return;

      if (authError || !auth?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);

      await loadTiles(uid);
      await load(uid);
    })();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`revisit_decisions_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, () => void load(userId))
      .subscribe();

    const channel2 = supabase
      .channel(`revisit_meaning_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decision_domains", filter: `user_id=eq.${userId}` }, () => void load(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "constellation_items", filter: `user_id=eq.${userId}` }, () => void load(userId))
      .subscribe();

    const channel3 = supabase
      .channel(`revisit_tiles_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "domains", filter: `user_id=eq.${userId}` }, () => void loadTiles(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "constellations", filter: `user_id=eq.${userId}` }, () => void loadTiles(userId))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(channel2);
      void supabase.removeChannel(channel3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const pushUndo = (decisionId: string, label: string, prev: Partial<Decision>) => {
    setLastUndo({ decisionId, label, prev });
    window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setLastUndo((cur) => (cur?.decisionId === decisionId ? null : cur));
    }, 8000);
  };

  const undoLast = async () => {
    if (!userId || !lastUndo) return;

    const { decisionId, prev } = lastUndo;

    const patch: DecisionPatch = {};
    if (prev.review_at !== undefined) patch.review_at = prev.review_at ?? null;
    if (prev.reviewed_at !== undefined) patch.reviewed_at = prev.reviewed_at ?? null;
    if (prev.review_history !== undefined) patch.review_history = prev.review_history ?? null;

    const { error } = await supabase.from("decisions").update(patch).eq("id", decisionId).eq("user_id", userId);

    if (error) {
      setStatusLine(`Undo failed: ${error.message}`);
      return;
    }

    setItems((prevItems) => prevItems.map((x) => (x.id === decisionId ? { ...x, ...(prev as Partial<Decision>) } : x)));
    setLastUndo(null);
    setStatusLine("Undone.");
  };

  const markReviewed = async (d: Decision, preset?: "keep" | "7" | "30" | "90" | "custom" | "clear", customIso?: string | null) => {
    if (!userId) return;

    const nowIso = new Date().toISOString();

    let nextReview: string | null = d.review_at;
    if (preset === "clear") nextReview = null;
    if (preset === "7") nextReview = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    if (preset === "30") nextReview = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    if (preset === "90") nextReview = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    if (preset === "custom") nextReview = customIso ?? null;

    const prevHistory = Array.isArray(d.review_history) ? d.review_history : [];
    const entry: Record<string, unknown> = { at: nowIso, kind: "reviewed", next_review_at: nextReview };

    const patch: DecisionPatch = {
      reviewed_at: nowIso,
      review_history: [...prevHistory, entry],
      review_at: nextReview,
    };

    pushUndo(d.id, "Undo", {
      reviewed_at: d.reviewed_at ?? null,
      review_at: d.review_at ?? null,
      review_history: prevHistory,
    });

    setItems((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, reviewed_at: nowIso, review_at: nextReview, review_history: [...prevHistory, entry] } : x))
    );

    const { error } = await supabase.from("decisions").update(patch).eq("id", d.id).eq("user_id", userId);

    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      await undoLast();
      return;
    }

    setOpenId((cur) => (cur === d.id ? null : cur));
    setStatusLine("Reviewed.");
  };

  const dueLabel = (d: Decision) => {
    const iso = d.review_at;
    if (!iso) return "";
    const diff = dayDiffFromNow(iso);
    if (diff == null) return "";
    if (diff <= -2) return "Overdue";
    if (diff === -1) return "Due yesterday";
    if (diff === 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    return `Due in ${diff}d`;
  };

  // ✅ Area assignment (single domain per decision)
  const setDecisionDomain = async (decisionId: string, domainId: string | null) => {
    if (!userId) return;

    setDomainByDecision((prev) => ({ ...prev, [decisionId]: domainId }));

    try {
      if (!domainId) {
        const { error } = await supabase.from("decision_domains").delete().eq("user_id", userId).eq("decision_id", decisionId);
        if (error) throw error;
        setStatusLine("Saved.");
        return;
      }

      const { error } = await supabase
        .from("decision_domains")
        .upsert({ user_id: userId, decision_id: decisionId, domain_id: domainId }, { onConflict: "user_id,decision_id" });

      if (error) throw error;
      setStatusLine("Saved.");
    } catch {
      setStatusLine("Couldn’t update.");
      void load(userId);
    }
  };

  // ✅ Group toggle (multi)
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
        setStatusLine("Removed.");
        return;
      }

      const { error } = await supabase.from("constellation_items").insert({
        user_id: userId,
        decision_id: decisionId,
        constellation_id: constellationId,
      });

      if (error) throw error;
      setStatusLine("Saved.");
    } catch {
      setStatusLine("Couldn’t update.");
      void load(userId);
    }
  };

  // ✅ Apply calm filters
  const filteredDueItems = useMemo(() => {
    const apply = (list: Decision[]) => {
      let out = list;

      if (activeDomainId) out = out.filter((d) => (domainByDecision[d.id] ?? null) === activeDomainId);
      if (activeConstellationId) out = out.filter((d) => (constellationsByDecision[d.id] ?? []).includes(activeConstellationId));

      return out;
    };

    return {
      due: apply(dueItemsRaw.due),
      soon: apply(dueItemsRaw.soon),
    };
  }, [dueItemsRaw, activeDomainId, activeConstellationId, domainByDecision, constellationsByDecision]);

  const dueVisible = useMemo(
    () => (showAllDue ? filteredDueItems.due : filteredDueItems.due.slice(0, DEFAULT_LIMIT)),
    [filteredDueItems.due, showAllDue]
  );
  const soonVisible = useMemo(
    () => (showAllSoon ? filteredDueItems.soon : filteredDueItems.soon.slice(0, DEFAULT_LIMIT)),
    [filteredDueItems.soon, showAllSoon]
  );

  const AttachmentsStrip = ({ decision }: { decision: Decision }) => {
    const atts = normalizeAttachments(decision.attachments);

    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
        <div className="text-xs font-semibold text-zinc-700">Attachments</div>

        {atts.length === 0 ? (
          <div className="text-sm text-zinc-600">No attachments.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {atts.map((a) => (
              <Chip key={a.path} onClick={() => void openAttachment(a)} title={`${a.type}${a.size ? ` • ${softKB(a.size)}` : ""}`}>
                {a.name}
              </Chip>
            ))}
          </div>
        )}
      </div>
    );
  };

  const FiledUnderBox = ({ decision }: { decision: Decision }) => {
    const d = decision;

    const domainId = domainByDecision[d.id] ?? null;
    const domainObj = domainId ? domains.find((x) => x.id === domainId) ?? null : null;

    const memberIds = constellationsByDecision[d.id] ?? [];
    const memberObjs = memberIds
      .map((cid) => constellations.find((c) => c.id === cid) ?? null)
      .filter(Boolean) as Constellation[];

    const filedUnder = [
      domainObj ? `${domainObj.emoji ? `${domainObj.emoji} ` : ""}${domainObj.name}` : null,
      ...memberObjs.map((c) => `${c.emoji ? `${c.emoji} ` : ""}${c.name}`),
    ].filter(Boolean) as string[];

    const isEditing = labelsEditForId === d.id;

    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-zinc-700">Filed under</div>
          <Chip onClick={() => setLabelsEditForId((cur) => (cur === d.id ? null : d.id))}>{isEditing ? "Done" : "Edit"}</Chip>
        </div>

        {!isEditing ? (
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
                    {dom.emoji ? `${dom.emoji} ` : ""}
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
                        {c.emoji ? `${c.emoji} ` : ""}
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
    );
  };

  const ReviewControls = ({ decision }: { decision: Decision }) => {
    const d = decision;

    const mode = revisitModeById[d.id] ?? "";
    const customDate = customDateById[d.id] ?? "";

    return (
      <div className="space-y-2">
        <div className="text-xs text-zinc-500">Reviewed</div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip onClick={() => void markReviewed(d, "keep")} title="Mark as reviewed (keep the same date)">
            Reviewed
          </Chip>

          <select
            className="h-9 rounded-full border border-zinc-200 bg-white px-3 text-sm text-zinc-700"
            value={mode}
            onChange={(e) => {
              const v = e.target.value as "7" | "30" | "90" | "custom" | "";
              setRevisitModeById((prev) => ({ ...prev, [d.id]: v }));

              if (v === "7") void markReviewed(d, "7");
              if (v === "30") void markReviewed(d, "30");
              if (v === "90") void markReviewed(d, "90");
            }}
            aria-label="Choose next revisit"
            title="Choose when to bring this back"
          >
            <option value="">Next time…</option>
            <option value="7">In 7 days</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="custom">Pick a date…</option>
          </select>

          {mode === "custom" ? (
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
                    setStatusLine("Pick a valid date.");
                    return;
                  }
                  void markReviewed(d, "custom", iso);
                }}
                title="Set next revisit date"
              >
                Set date
              </Chip>
            </div>
          ) : null}

          <Chip onClick={() => void markReviewed(d, "clear")} title="Stop resurfacing this decision">
            Clear revisit
          </Chip>

          <Chip onClick={() => setOpenId(null)} title="Close this card">
            Done
          </Chip>
        </div>

        <div className="text-xs text-zinc-500">Current review date: {softDate(d.review_at)}</div>
      </div>
    );
  };

  const DecisionCard = ({ d }: { d: Decision }) => {
    const isOpen = openId === d.id;

    const domainId = domainByDecision[d.id] ?? null;
    const domainObj = domainId ? domains.find((x) => x.id === domainId) ?? null : null;

    const memberIds = constellationsByDecision[d.id] ?? [];
    const memberObjs = memberIds
      .map((cid) => constellations.find((c) => c.id === cid) ?? null)
      .filter(Boolean) as Constellation[];

    return (
      <Card key={d.id} className="border-zinc-200 bg-white">
        <CardContent>
          <button type="button" onClick={() => setOpenId(isOpen ? null : d.id)} className="w-full text-left" aria-expanded={isOpen}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[240px] flex-1">
                <div className="text-base font-semibold text-zinc-900">{d.title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {dueLabel(d)} • Review date: {softDate(d.review_at)}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {domainObj ? (
                    <Chip title="Filed under">
                      {domainObj.emoji ? `${domainObj.emoji} ` : ""}
                      {domainObj.name}
                    </Chip>
                  ) : null}

                  {memberObjs.slice(0, 2).map((c) => (
                    <Chip key={c.id} title="Filed under">
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </Chip>
                  ))}

                  {memberObjs.length > 2 ? <Chip title="More">+{memberObjs.length - 2}</Chip> : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Chip>{isOpen ? "Hide" : "Open"}</Chip>
              </div>
            </div>
          </button>

          {isOpen ? (
            <div className="mt-4 space-y-4">
              {d.context ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{d.context}</div>
              ) : (
                <div className="text-sm text-zinc-600">No extra context saved.</div>
              )}

              <FiledUnderBox decision={d} />

              <AttachmentsStrip decision={d} />

              <ReviewControls decision={d} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  const onSelectDomainTile = (id: string | null) => {
    setActiveDomainId((cur) => (cur === id ? null : id));
    setShowAllDue(false);
    setShowAllSoon(false);
  };
  const onSelectConstellationTile = (id: string | null) => {
    setActiveConstellationId((cur) => (cur === id ? null : id));
    setShowAllDue(false);
    setShowAllSoon(false);
  };

  return (
    <Page
      title="Revisit"
      subtitle="Only what’s due, or due soon. Nothing else."
      right={
        <div className="flex items-center gap-2">
          {lastUndo ? (
            <Chip onClick={() => void undoLast()} title="Undo the last change">
              {lastUndo.label}
            </Chip>
          ) : null}
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <AssistedSearch scope="revisit" placeholder="Search decisions…" />

        <div className="space-y-4">
          {/* User-facing: no “Domains/Constellations” wording */}
          <TilesRow title="Filter by area" items={domains} activeId={activeDomainId} onSelect={onSelectDomainTile} />
          <TilesRow title="Filter by group" items={constellations} activeId={activeConstellationId} onSelect={onSelectConstellationTile} />
        </div>

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {filteredDueItems.due.length === 0 && filteredDueItems.soon.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing needs to come back right now.</div>
                <div className="text-sm text-zinc-600">When you schedule a revisit, it will show up here quietly.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredDueItems.due.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">Due</div>
                  {filteredDueItems.due.length > DEFAULT_LIMIT ? (
                    <div className="flex items-center gap-2">
                      <Chip onClick={() => setShowAllDue((v) => !v)}>{showAllDue ? "Show less" : "Show all"}</Chip>
                      {!showAllDue ? <div className="text-xs text-zinc-500">Showing {DEFAULT_LIMIT} of {filteredDueItems.due.length}</div> : null}
                    </div>
                  ) : null}
                </div>

                {dueVisible.map((d) => (
                  <DecisionCard key={d.id} d={d} />
                ))}
              </div>
            ) : null}

            {filteredDueItems.soon.length > 0 ? (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">Due soon</div>
                  {filteredDueItems.soon.length > DEFAULT_LIMIT ? (
                    <div className="flex items-center gap-2">
                      <Chip onClick={() => setShowAllSoon((v) => !v)}>{showAllSoon ? "Show less" : "Show all"}</Chip>
                      {!showAllSoon ? <div className="text-xs text-zinc-500">Showing {DEFAULT_LIMIT} of {filteredDueItems.soon.length}</div> : null}
                    </div>
                  ) : null}
                </div>

                {soonVisible.map((d) => (
                  <DecisionCard key={d.id} d={d} />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Page>
  );
}
