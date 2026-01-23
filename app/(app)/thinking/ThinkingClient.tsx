// app/(app)/thinking/ThinkingClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Chip, Card, CardContent, useToast } from "@/components/ui";
import { ConversationPanel } from "./ConversationPanel";

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
  attachments: AttachmentMeta[] | null; // ✅ new (from decisions.attachments jsonb)
};

type DecisionSummary = {
  id: string;
  user_id: string;
  decision_id: string;
  summary_text: string;
  created_at: string;
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

function softKB(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function normalizeAttachments(raw: any): AttachmentMeta[] {
  if (!raw) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a.path === "string")
    .map((a) => ({
      name: typeof a.name === "string" ? a.name : "Attachment",
      path: String(a.path),
      type: typeof a.type === "string" ? a.type : "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
    }));
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

  // Summaries for the currently open draft (small, capped)
  const [summaryStatus, setSummaryStatus] = useState<string>("");
  const [summaries, setSummaries] = useState<DecisionSummary[]>([]);

  // Signed url cache for attachments (path -> signedUrl)
  const [signed, setSigned] = useState<Record<string, string>>({});
  const signingRef = useRef<Record<string, boolean>>({});

  const loadRef = useRef<(opts?: { silent?: boolean }) => void>(() => {});
  const reloadTimerRef = useRef<number | null>(null);

  const scheduleReload = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRef.current({ silent: true });
    }, 250);
  };

  const openDraft = useMemo(() => drafts.find((d) => d.id === openId) ?? null, [drafts, openId]);

  const openAttachments = useMemo(() => {
    if (!openDraft) return [];
    return normalizeAttachments(openDraft.attachments);
  }, [openDraft?.id, openDraft?.attachments]);

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
      showToast({ message: "Couldn’t open attachment." }, 2500);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

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

    setUserId(auth.user.id);

    const { data, error } = await supabase
      .from("decisions")
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,origin,framed_at,attachments")
      .eq("user_id", auth.user.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    if (error) {
      setDrafts([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const list = (data ?? []) as any[];
    const normalized: Decision[] = list.map((r) => ({
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

    setDrafts(normalized);
    setStatusLine(normalized.length === 0 ? "No drafts right now." : "Loaded.");
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

  // Auto-open draft from query (?open=...)
  useEffect(() => {
    if (!openFromQuery) return;
    if (drafts.length === 0) return;

    const match = drafts.find((d) => d.id === openFromQuery);
    if (!match) return;

    setOpenId(match.id);
    setHighlightId(match.id);

    const t = window.setTimeout(() => setHighlightId(null), 1600);
    return () => window.clearTimeout(t);
  }, [openFromQuery, drafts]);

  // Keep chat only for the open card
  useEffect(() => {
    setChatForId((cur) => {
      if (!cur) return null;
      if (!openId) return null;
      return cur === openId ? cur : null;
    });
  }, [openId]);

  // Load summaries for the open draft (capped; no lists)
  useEffect(() => {
    let mounted = true;

    (async () => {
      setSummaries([]);
      setSummaryStatus("");

      if (!userId || !openDraft) return;

      setSummaryStatus("Loading memory…");

      const { data, error } = await supabase
        .from("decision_summaries")
        .select("id,decision_id,summary_text,created_at")
        .eq("user_id", userId)
        .eq("decision_id", openDraft.id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (!mounted) return;

      if (error) {
        setSummaryStatus("");
        setSummaries([]);
        return;
      }

      setSummaries((data ?? []) as DecisionSummary[]);
      setSummaryStatus("");
    })();

    return () => {
      mounted = false;
    };
  }, [userId, openDraft?.id]);

  // Realtime: draft decisions (includes attachments updates too)
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`thinking-drafts-${userId}`)
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
          const isDraft = rowStatus === "draft";

          setDrafts((current) => {
            if (eventType === "DELETE") {
              if (openId === id) setOpenId(null);
              if (chatForId === id) setChatForId(null);
              return current.filter((d) => d.id !== id);
            }

            if (!isDraft) {
              if (openId === id) setOpenId(null);
              if (chatForId === id) setChatForId(null);
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
            const merged = exists
              ? current.map((d) => (d.id === patch.id ? { ...d, ...patch } : d))
              : [patch, ...current];

            merged.sort((a, b) => {
              const ta = safeMs(a.created_at) ?? 0;
              const tb = safeMs(b.created_at) ?? 0;
              return tb - ta;
            });

            return merged;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, openId, chatForId]);

  const decideNow = async (d: Decision) => {
    if (!userId) return;

    setDrafts((prev) => prev.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);

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
        message: "Moved to Decisions.",
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

  const scheduleRevisit = async (d: Decision, days: number) => {
    if (!userId) return;

    const review_at = isoNowPlusDays(days);

    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at } : x)));

    const { error } = await supabase.from("decisions").update({ review_at }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t schedule: ${error.message}` }, 3500);
      loadRef.current({ silent: true });
      return;
    }

    showToast({ message: `Scheduled revisit in ${days}d.` }, 2500);
  };

  const deleteDraft = async (d: Decision) => {
    if (!userId) return;

    const prev = drafts;
    setDrafts((p) => p.filter((x) => x.id !== d.id));
    if (openId === d.id) setOpenId(null);
    if (chatForId === d.id) setChatForId(null);

    const { error } = await supabase.from("decisions").delete().eq("id", d.id).eq("user_id", userId).eq("status", "draft");

    if (error) {
      showToast({ message: `Couldn’t delete: ${error.message}` }, 3500);
      setDrafts(prev);
      return;
    }

    showToast({ message: "Draft deleted." }, 4000);
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

  return (
    <Page
      title="Thinking"
      subtitle="A safe space for drafts. Nothing needs to be decided yet."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          <Chip onClick={() => loadRef.current({ silent: false })}>Refresh</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {drafts.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">All clear.</div>
                <div className="text-sm text-zinc-600">When something needs thinking time, it can live here without pressure.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {drafts.map((d) => {
              const isOpen = openId === d.id;
              const isChatOpen = chatForId === d.id;

              return (
                <Card
                  key={d.id}
                  className={`border-zinc-200 bg-white transition ${highlightId === d.id ? "ring-2 ring-zinc-300" : ""}`}
                >
                  <CardContent>
                    <button
                      type="button"
                      onClick={() => {
                        const nextOpen = isOpen ? null : d.id;
                        setOpenId(nextOpen);
                        if (nextOpen !== d.id) setChatForId(null);
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
                        </div>

                        <div className="flex items-center gap-2">
                          <Chip>{isOpen ? "Hide" : "Open"}</Chip>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-4 space-y-4">
                        {d.origin === "framing" ? <div className="mt-1 text-xs text-zinc-500">Prepared in Framing.</div> : null}

                        {d.context ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{d.context}</div>
                        ) : (
                          <div className="text-sm text-zinc-600">No extra context yet.</div>
                        )}

                        {/* Attachments strip (calm) */}
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                          <div className="text-xs font-semibold text-zinc-700">Attachments</div>

                          {openAttachments.length === 0 ? (
                            <div className="text-sm text-zinc-600">No attachments.</div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              {openAttachments.map((a) => (
                                <Chip
                                  key={a.path}
                                  onClick={() => void openAttachment(a)}
                                  title={`${a.type}${a.size ? ` • ${softKB(a.size)}` : ""}`}
                                >
                                  {a.name}
                                </Chip>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Memory strip (capped, calm) */}
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
                          <div className="text-xs font-semibold text-zinc-700">Memory</div>
                          {summaryStatus ? <div className="text-xs text-zinc-500">{summaryStatus}</div> : null}

                          {!summaryStatus && summaries.length === 0 ? <div className="text-sm text-zinc-600">No saved summaries yet.</div> : null}

                          {summaries.map((s) => (
                            <div key={s.id} className="space-y-2">
                              <div className="text-xs text-zinc-500">Saved {softWhen(s.created_at)}</div>
                              <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{s.summary_text}</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Chip onClick={() => useSummaryAsContext(d, s)} title="Append this summary into the draft context">
                                  Use as context
                                </Chip>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Chip onClick={() => decideNow(d)} title="Move to Decisions (decided)">
                            Decide
                          </Chip>

                          <Chip onClick={() => scheduleRevisit(d, 7)} title="Schedule a revisit in 7 days">
                            Revisit 7d
                          </Chip>

                          <Chip onClick={() => scheduleRevisit(d, 30)} title="Schedule a revisit in 30 days">
                            Revisit 30d
                          </Chip>

                          <Chip onClick={() => router.push("/revisit")} title="Open the revisit page">
                            Go to Revisit
                          </Chip>

                          <Chip onClick={() => deleteDraft(d)} title="Delete this draft">
                            Delete
                          </Chip>

                          <Chip
                            onClick={() => setChatForId((cur) => (cur === d.id ? null : d.id))}
                            title="Have a conversation with Keystone about this decision"
                          >
                            {isChatOpen ? "Hide chat" : "Talk this through"}
                          </Chip>

                          <Chip onClick={() => router.push("/home")} title="Return to Home">
                            Put this down
                          </Chip>
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
              );
            })}
          </div>
        )}

        {process.env.NODE_ENV === "development" && openDraft ? (
          <div className="text-xs text-zinc-400">openId: {openDraft.id}</div>
        ) : null}
      </div>
    </Page>
  );
}
