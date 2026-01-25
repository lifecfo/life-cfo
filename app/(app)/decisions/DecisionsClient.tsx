// app/(app)/decisions/DecisionsClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { normalizeAttachments, softKB, type AttachmentMeta } from "@/lib/attachments";

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
  reviewed_at: string | null;

  review_notes: string | null;
  review_history: unknown[] | null;

  attachments: AttachmentMeta[] | null; // decisions.attachments (jsonb)
  chaptered_at?: string | null;
};

type Domain = {
  id: string;
  name: string;
  emoji?: string | null;
  sort_order?: number | null;
};

type Constellation = {
  id: string;
  name: string;
  emoji?: string | null;
  sort_order?: number | null;
};

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softDate(iso: string | null) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function nextReviewFromPreset(preset: "1w" | "1m" | "3m" | "6m") {
  const d = new Date();
  if (preset === "1w") d.setDate(d.getDate() + 7);
  if (preset === "1m") d.setMonth(d.getMonth() + 1);
  if (preset === "3m") d.setMonth(d.getMonth() + 3);
  if (preset === "6m") d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

function sortByName<T extends { name: string; sort_order?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = typeof a.sort_order === "number" ? a.sort_order : 9999;
    const bo = typeof b.sort_order === "number" ? b.sort_order : 9999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
}

export default function DecisionsClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // ✅ Top-5 default (V1 pattern)
  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  // ✅ Domains + Constellations (tiles + meaning)
  const [domains, setDomains] = useState<Domain[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [activeConstellationId, setActiveConstellationId] = useState<string | null>(null);

  const [domainByDecision, setDomainByDecision] = useState<Record<string, string | null>>({});
  const [constellationsByDecision, setConstellationsByDecision] = useState<Record<string, string[]>>({});

  // signed url cache (path -> signedUrl)
  const [signed, setSigned] = useState<Record<string, string>>({});
  const signingRef = useRef<Record<string, boolean>>({});

  // throttle / reload protection
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const queuedRefetchRef = useRef(false);

  const openItem = useMemo(() => items.find((x) => x.id === openId) ?? null, [items, openId]);

  const ensureSignedUrl = async (path: string) => {
    if (!path) return null;
    if (signed[path]) return signed[path];
    if (signingRef.current[path]) return null;

    signingRef.current[path] = true;
    try {
      const { data, error } = await supabase.storage.from("captures").createSignedUrl(path, 60 * 10);
      if (error || !data?.signedUrl) return null;

      setSigned((prev) => ({ ...prev, [path]: data.signedUrl }));
      return data.signedUrl;
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

  const loadTiles = async (uid: string) => {
    const [domRes, conRes] = await Promise.all([
      supabase.from("domains").select("id,name,emoji,sort_order").eq("user_id", uid).order("sort_order", { ascending: true }),
      supabase
        .from("constellations")
        .select("id,name,emoji,sort_order")
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
          emoji: typeof r.emoji === "string" ? r.emoji : null,
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
          emoji: typeof r.emoji === "string" ? r.emoji : null,
          sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
        }));
      setConstellations(sortByName(next));
    }
  };

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
      .select(
        "id,user_id,title,context,status,created_at,decided_at,review_at,reviewed_at,review_notes,review_history,attachments,chaptered_at"
      )
      .eq("user_id", uid)
      .neq("status", "draft")
      .neq("status", "chapter") // ✅ hide chaptered decisions from this list
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    inFlightRef.current = false;

    if (!isMountedRef.current) return;

    if (error) {
      setStatusLine(`Error: ${error.message}`);
      setItems([]);
      return;
    }

    const rows = (data ?? []) as any[];
    const normalized: Decision[] = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      title: r.title ?? "",
      context: r.context ?? null,
      status: r.status ?? "",
      created_at: r.created_at ?? new Date().toISOString(),
      decided_at: r.decided_at ?? null,
      review_at: r.review_at ?? null,
      reviewed_at: r.reviewed_at ?? null,
      review_notes: r.review_notes ?? null,
      review_history: r.review_history ?? null,
      attachments: normalizeAttachments(r.attachments),
      chaptered_at: r.chaptered_at ?? null,
    }));

    setItems(normalized);
    setStatusLine(normalized.length === 0 ? "Nothing committed yet." : `Loaded ${normalized.length}.`);

    // ✅ refresh meaning maps for this set (cheap + trustworthy)
    void loadMeaningMaps(uid, normalized.map((x) => x.id));
  };

  // ----- boot -----
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

      // Tiles load once at boot (realtime keeps them fresh)
      await loadTiles(uid);
      await load(uid);
    })();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- realtime -----
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`decisions_ledger_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, () => void load(userId))
      .subscribe();

    // membership changes need to reflect too
    const channel2 = supabase
      .channel(`decisions_meaning_${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decision_domains", filter: `user_id=eq.${userId}` }, () => void load(userId))
      .on("postgres_changes", { event: "*", schema: "public", table: "constellation_items", filter: `user_id=eq.${userId}` }, () => void load(userId))
      .subscribe();

    // tiles changes
    const channel3 = supabase
      .channel(`decisions_tiles_${userId}`)
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

  // ----- actions -----
  const setReviewAt = async (d: Decision, preset: "1w" | "1m" | "3m" | "6m" | "clear") => {
    if (!userId) return;

    const next = preset === "clear" ? null : nextReviewFromPreset(preset);

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at: next } : x)));

    const { error } = await supabase.from("decisions").update({ review_at: next }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      void load(userId);
      return;
    }

    setStatusLine(preset === "clear" ? "Revisit cleared." : "Revisit scheduled.");
  };

  const moveToChapters = async (d: Decision) => {
    if (!userId) return;

    const nowIso = new Date().toISOString();

    // optimistic: remove from list & close card
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    setOpenId((cur) => (cur === d.id ? null : cur));

    const { error } = await supabase
      .from("decisions")
      .update({
        status: "chapter",
        chaptered_at: nowIso,
        review_at: null, // once it’s honoured/closed, it shouldn’t resurface
        reviewed_at: null,
      })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      void load(userId);
      return;
    }

    setStatusLine("Moved to Chapters.");
  };

  // ✅ Reopen: move a decided decision back to Thinking as a draft (safe valve)
  const reopenToThinking = async (d: Decision) => {
    if (!userId) return;

    // optimistic: remove from list & close card
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    setOpenId((cur) => (cur === d.id ? null : cur));
    setStatusLine("Reopened in Thinking.");

    const { error } = await supabase
      .from("decisions")
      .update({
        status: "draft",
        decided_at: null,
        review_at: null,
        reviewed_at: null,
      })
      .eq("id", d.id)
      .eq("user_id", userId)
      .eq("status", "decided");

    if (error) {
      setStatusLine(`Couldn’t reopen: ${error.message}`);
      void load(userId);
      return;
    }

    router.push(`/thinking?open=${d.id}`);
  };

  // ✅ Domain assignment (single domain per decision in V1)
  const setDecisionDomain = async (decisionId: string, domainId: string | null) => {
    if (!userId) return;

    // optimistic
    setDomainByDecision((prev) => ({ ...prev, [decisionId]: domainId }));

    try {
      if (!domainId) {
        const { error } = await supabase.from("decision_domains").delete().eq("user_id", userId).eq("decision_id", decisionId);
        if (error) throw error;
        setStatusLine("Domain cleared.");
        return;
      }

      // IMPORTANT: conflict target should match unique(user_id, decision_id)
      const { error } = await supabase
        .from("decision_domains")
        .upsert({ user_id: userId, decision_id: decisionId, domain_id: domainId }, { onConflict: "user_id,decision_id" });

      if (error) throw error;
      setStatusLine("Domain set.");
    } catch {
      setStatusLine("Couldn’t update domain.");
      void load(userId);
    }
  };

  // ✅ Constellation toggle (multi)
  const toggleConstellation = async (decisionId: string, constellationId: string) => {
    if (!userId) return;

    const current = constellationsByDecision[decisionId] ?? [];
    const has = current.includes(constellationId);
    const next = has ? current.filter((x) => x !== constellationId) : [...current, constellationId];

    // optimistic
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
      setStatusLine("Added.");
    } catch {
      setStatusLine("Couldn’t update constellation.");
      void load(userId);
    }
  };

  // ✅ Apply calm filters from tiles
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

  // ✅ V1: show top 5 by default (after filters)
  const visibleItems = useMemo(() => {
    if (showAll) return filteredItems;
    return filteredItems.slice(0, DEFAULT_LIMIT);
  }, [filteredItems, showAll]);

  const hasMore = filteredItems.length > DEFAULT_LIMIT;

  return (
    <Page
      title="Decisions"
      subtitle="A calm ledger of what you’ve already chosen."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* ✅ Assisted retrieval */}
        <AssistedSearch scope="decisions" placeholder="Search decisions…" />

        {/* ✅ Calm tiles */}
        <div className="space-y-4">
          <TilesRow
            title="Domains"
            items={domains}
            activeId={activeDomainId}
            onSelect={(id) => {
              setActiveDomainId((cur) => (cur === id ? null : id));
              setShowAll(false);
            }}
          />
          <TilesRow
            title="Constellations"
            items={constellations}
            activeId={activeConstellationId}
            onSelect={(id) => {
              setActiveConstellationId((cur) => (cur === id ? null : id));
              setShowAll(false);
            }}
          />
        </div>

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {filteredItems.length > 0 && hasMore ? (
          <div className="flex items-center gap-2">
            <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
            {!showAll ? <div className="text-xs text-zinc-500">Showing {DEFAULT_LIMIT} of {filteredItems.length}</div> : null}
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing committed yet.</div>
                <div className="text-sm text-zinc-600">Drafts live in Thinking. When you decide, they land here.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visibleItems.map((d) => {
              const isOpen = openId === d.id;
              const atts = isOpen ? normalizeAttachments(d.attachments) : [];

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
                            {d.decided_at ? `Decided: ${softDate(d.decided_at)}` : `Created: ${softDate(d.created_at)}`}
                            {d.review_at ? ` • Revisit: ${softDate(d.review_at)}` : ""}
                          </div>

                          {/* Quiet meaning hints */}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {domainObj ? (
                              <Chip title="Domain">
                                {domainObj.emoji ? `${domainObj.emoji} ` : ""}
                                {domainObj.name}
                              </Chip>
                            ) : null}

                            {memberObjs.slice(0, 2).map((c) => (
                              <Chip key={c.id} title="Constellation">
                                {c.emoji ? `${c.emoji} ` : ""}
                                {c.name}
                              </Chip>
                            ))}

                            {memberObjs.length > 2 ? <Chip title="More constellations">+{memberObjs.length - 2}</Chip> : null}
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

                        {/* ✅ Meaning assignment (quiet, optional) */}
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-3">
                          <div className="text-xs font-semibold text-zinc-700">Meaning</div>

                          <div className="space-y-2">
                            <div className="text-xs text-zinc-500">Domain</div>
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
                            <div className="text-xs text-zinc-500">Constellations</div>
                            {constellations.length === 0 ? (
                              <div className="text-sm text-zinc-600">No constellations yet.</div>
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

                        <div className="space-y-2">
                          <div className="text-xs text-zinc-500">Optional: schedule a revisit</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip onClick={() => void setReviewAt(d, "1w")} title="Bring back in 1 week">
                              1w
                            </Chip>
                            <Chip onClick={() => void setReviewAt(d, "1m")} title="Bring back in 1 month">
                              1m
                            </Chip>
                            <Chip onClick={() => void setReviewAt(d, "3m")} title="Bring back in 3 months">
                              3m
                            </Chip>
                            <Chip onClick={() => void setReviewAt(d, "6m")} title="Bring back in 6 months">
                              6m
                            </Chip>
                            <Chip onClick={() => void setReviewAt(d, "clear")} title="Stop resurfacing this decision">
                              Clear revisit
                            </Chip>
                            <Chip onClick={() => setOpenId(null)}>Done</Chip>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <div className="text-xs text-zinc-500">Optional: honour and close</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip onClick={() => void moveToChapters(d)} title="Move this decision into Chapters">
                              Put this down
                            </Chip>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <div className="text-xs text-zinc-500">Optional: reopen</div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip onClick={() => void reopenToThinking(d)} title="Move back to Thinking (draft)">
                              Reopen
                            </Chip>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
