"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

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
  review_history: any[] | null;
  reviewed_at?: string | null;
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

type LastUndo = {
  label: string;
  decisionId: string;
  prev: Partial<Decision>;
};

export default function RevisitClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const [lastUndo, setLastUndo] = useState<LastUndo | null>(null);

  // throttle / reload protection
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const queuedRefetchRef = useRef(false);

  const openItem = useMemo(() => items.find((x) => x.id === openId) ?? null, [items, openId]);

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
      return am - bm; // earliest first
    };

    due.sort(sortByReview);
    soon.sort(sortByReview);

    return { due, soon };
  }, [items]);

  const load = async (uid: string) => {
    // safe reload throttle: at most ~1 fetch per 700ms, and coalesce bursts
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
      .select("id,user_id,title,context,status,created_at,decided_at,review_at,review_notes,review_history,reviewed_at")
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

    const rows = (data ?? []) as Decision[];
    setItems(rows);
    setStatusLine(rows.length === 0 ? "Nothing scheduled." : `Loaded ${rows.length}.`);
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
      .channel(`revisit_decisions_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` },
        () => {
          // Keep this page calm: just re-load quietly (throttled)
          void load(userId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ----- actions -----
  const pushUndo = (decisionId: string, label: string, prev: Partial<Decision>) => {
    setLastUndo({ decisionId, label, prev });
    // auto-clear after a short, calm window
    window.setTimeout(() => {
      if (!isMountedRef.current) return;
      setLastUndo((cur) => (cur?.decisionId === decisionId ? null : cur));
    }, 8000);
  };

  const undoLast = async () => {
    if (!userId || !lastUndo) return;

    const { decisionId, prev } = lastUndo;

    const patch: any = {};
    if ("review_at" in prev) patch.review_at = prev.review_at ?? null;
    if ("reviewed_at" in prev) patch.reviewed_at = prev.reviewed_at ?? null;
    if ("review_history" in prev) patch.review_history = prev.review_history ?? null;

    const { error } = await supabase.from("decisions").update(patch).eq("id", decisionId).eq("user_id", userId);

    if (error) {
      setStatusLine(`Undo failed: ${error.message}`);
      return;
    }

    setItems((prevItems) =>
      prevItems.map((x) => (x.id === decisionId ? { ...x, ...(prev as any) } : x))
    );

    setLastUndo(null);
    setStatusLine("Undone.");
  };

  const markReviewed = async (d: Decision, preset?: "1w" | "1m" | "3m" | "6m" | "clear") => {
    if (!userId) return;

    const nowIso = new Date().toISOString();
    const nextReview =
      preset === "clear" ? null : preset ? nextReviewFromPreset(preset) : d.review_at; // default: keep cadence

    const prevHistory = Array.isArray(d.review_history) ? d.review_history : [];
    const entry = { at: nowIso, kind: "reviewed", next_review_at: nextReview };

    const patch: any = {
      reviewed_at: nowIso,
      review_history: [...prevHistory, entry],
      review_at: nextReview,
    };

    // optimistic
    pushUndo(d.id, "Undo", {
      reviewed_at: d.reviewed_at ?? null,
      review_at: d.review_at ?? null,
      review_history: prevHistory,
    });

    setItems((prev) =>
      prev.map((x) =>
        x.id === d.id ? { ...x, reviewed_at: nowIso, review_at: nextReview, review_history: [...prevHistory, entry] } : x
      )
    );

    const { error } = await supabase.from("decisions").update(patch).eq("id", d.id).eq("user_id", userId);

    if (error) {
      // revert quietly if it fails
      setStatusLine(`Update failed: ${error.message}`);
      await undoLast();
      return;
    }

    setOpenId((cur) => (cur === d.id ? null : cur));
    setStatusLine("Reviewed.");
  };

  const setCustomReviewAt = async (d: Decision, iso: string | null) => {
    if (!userId) return;

    // optimistic + undo
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

  // UI helpers
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

                {dueItems.due.map((d) => {
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

                                    // Local morning (keeps “calm day” semantics; avoids UTC day shift bugs)
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
