"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { createSignedUrl, normalizeAttachments, softKB, type AttachmentMeta } from "@/lib/attachments";

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

function nextReviewFromPreset(preset: "1w" | "1m" | "3m" | "6m") {
  const d = new Date();
  if (preset === "1w") d.setDate(d.getDate() + 7);
  if (preset === "1m") d.setMonth(d.getMonth() + 1);
  if (preset === "3m") d.setMonth(d.getMonth() + 3);
  if (preset === "6m") d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}

function toDateInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function RevisitClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const [lastUndo, setLastUndo] = useState<LastUndo | null>(null);

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

  const dueItems = useMemo(() => {
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
      .select(
        "id,user_id,title,context,status,created_at,decided_at,review_at,review_notes,review_history,reviewed_at,attachments"
      )
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
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` }, () => {
        void load(userId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
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

  const markReviewed = async (d: Decision, preset?: "1w" | "1m" | "3m" | "6m" | "clear") => {
    if (!userId) return;

    const nowIso = new Date().toISOString();
    const nextReview = preset === "clear" ? null : preset ? nextReviewFromPreset(preset) : d.review_at;

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

  const setCustomReviewAt = async (d: Decision, iso: string | null) => {
    if (!userId) return;

    pushUndo(d.id, "Undo", { review_at: d.review_at ?? null });
    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at: iso } : x)));

    const { error } = await supabase.from("decisions").update({ review_at: iso }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      await undoLast();
      return;
    }

    setStatusLine("Updated.");
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

  const DecisionCard = ({ d }: { d: Decision }) => {
    const isOpen = openId === d.id;

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

              <AttachmentsStrip decision={d} />

              <div className="flex flex-wrap items-center gap-2">
                <Chip onClick={() => void markReviewed(d)} title="Mark reviewed (keep the same cadence)">
                  Reviewed
                </Chip>

                <Chip onClick={() => void markReviewed(d, "1w")} title="Review again in a week">
                  1w
                </Chip>
                <Chip onClick={() => void markReviewed(d, "1m")} title="Review again in a month">
                  1m
                </Chip>
                <Chip onClick={() => void markReviewed(d, "3m")} title="Review again in 3 months">
                  3m
                </Chip>
                <Chip onClick={() => void markReviewed(d, "6m")} title="Review again in 6 months">
                  6m
                </Chip>

                <Chip onClick={() => void markReviewed(d, "clear")} title="Stop resurfacing this decision">
                  Clear review
                </Chip>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Or set a custom date:</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    value={toDateInputValue(d.review_at)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return void setCustomReviewAt(d, null);
                      const iso = new Date(`${v}T09:00:00`).toISOString();
                      void setCustomReviewAt(d, iso);
                    }}
                  />
                  <Chip onClick={() => setOpenId(null)}>Done</Chip>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  return (
    <Page
      title="Revisit"
      subtitle="Only what’s due, or due soon."
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
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {dueItems.due.length === 0 && dueItems.soon.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing needs to come back right now.</div>
                <div className="text-sm text-zinc-600">When something is scheduled, it will show up here quietly.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {dueItems.due.length > 0 ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold text-zinc-900">Due</div>
                {dueItems.due.map((d) => (
                  <DecisionCard key={d.id} d={d} />
                ))}
              </div>
            ) : null}

            {dueItems.soon.length > 0 ? (
              <div className="space-y-3 pt-2">
                <div className="text-sm font-semibold text-zinc-900">Due soon</div>

                {dueItems.soon.map((d) => {
                  const isOpen = openId === d.id;

                  return (
                    <Card key={d.id} className="border-zinc-200 bg-white">
                      <CardContent>
                        <button
                          type="button"
                          onClick={() => setOpenId(isOpen ? null : d.id)}
                          className="w-full text-left"
                          aria-expanded={isOpen}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-[240px] flex-1">
                              <div className="text-base font-semibold text-zinc-900">{d.title}</div>
                              <div className="mt-1 text-xs text-zinc-500">Review date: {softDate(d.review_at)}</div>
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

                            <AttachmentsStrip decision={d} />

                            <div className="flex flex-wrap items-center gap-2">
                              <Chip onClick={() => void markReviewed(d)} title="Reviewed (keep cadence)">
                                Reviewed
                              </Chip>
                              <Chip onClick={() => void markReviewed(d, "1m")} title="Review again in a month">
                                1m
                              </Chip>
                              <Chip onClick={() => void markReviewed(d, "3m")} title="Review again in 3 months">
                                3m
                              </Chip>
                              <Chip onClick={() => void markReviewed(d, "clear")} title="Stop resurfacing this decision">
                                Clear review
                              </Chip>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Or set a custom date:</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="date"
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                                  value={toDateInputValue(d.review_at)}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    if (!v) return void setCustomReviewAt(d, null);
                                    const iso = new Date(`${v}T09:00:00`).toISOString();
                                    void setCustomReviewAt(d, iso);
                                  }}
                                />
                                <Chip onClick={() => setOpenId(null)}>Done</Chip>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Page>
  );
}
