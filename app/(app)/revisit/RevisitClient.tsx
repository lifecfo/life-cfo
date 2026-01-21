// app/(app)/revisit/RevisitClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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

type DueBucket = "due" | "soon";

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

export default function RevisitClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

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

  // ----- load -----
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authError || !auth?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        return;
      }

      setUserId(auth.user.id);

      const { data, error } = await supabase
        .from("decisions")
        .select("id,user_id,title,context,status,created_at,decided_at,review_at,review_notes,review_history,reviewed_at")
        .eq("user_id", auth.user.id)
        .neq("status", "draft")
        .not("review_at", "is", null)
        .order("review_at", { ascending: true });

      if (!mounted) return;

      if (error) {
        setStatusLine(`Error: ${error.message}`);
        setItems([]);
        return;
      }

      setItems((data ?? []) as Decision[]);
      setStatusLine((data?.length ?? 0) === 0 ? "Nothing scheduled." : `Loaded ${data?.length ?? 0}.`);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ----- actions -----
  const markReviewed = async (d: Decision, preset?: "1w" | "1m" | "3m" | "6m" | "clear") => {
    if (!userId) return;

    const nowIso = new Date().toISOString();
    const nextReview =
      preset === "clear" ? null : preset ? nextReviewFromPreset(preset) : d.review_at; // default: keep cadence

    // Append a lightweight history entry (safe even if column is jsonb[] / any)
    const prevHistory = Array.isArray(d.review_history) ? d.review_history : [];
    const entry = {
      at: nowIso,
      kind: "reviewed",
      next_review_at: nextReview,
    };

    const patch: any = {
      reviewed_at: nowIso,
      review_history: [...prevHistory, entry],
      review_at: nextReview,
    };

    const { error } = await supabase.from("decisions").update(patch).eq("id", d.id).eq("user_id", userId);
    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      return;
    }

    setItems((prev) =>
      prev.map((x) =>
        x.id === d.id
          ? {
              ...x,
              reviewed_at: nowIso,
              review_at: nextReview,
              review_history: [...prevHistory, entry],
            }
          : x
      )
    );

    // If cleared or moved out of due/soon, close the panel quietly
    setOpenId((cur) => (cur === d.id ? null : cur));
    setStatusLine("Reviewed.");
  };

  const setCustomReviewAt = async (d: Decision, iso: string | null) => {
    if (!userId) return;

    const { error } = await supabase.from("decisions").update({ review_at: iso }).eq("id", d.id).eq("user_id", userId);

    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      return;
    }

    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at: iso } : x)));
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
                              <Chip onClick={() => markReviewed(d)} title="Mark reviewed (keep the same cadence)">
                                Reviewed
                              </Chip>

                              <Chip onClick={() => markReviewed(d, "1w")} title="Review again in a week">
                                1w
                              </Chip>
                              <Chip onClick={() => markReviewed(d, "1m")} title="Review again in a month">
                                1m
                              </Chip>
                              <Chip onClick={() => markReviewed(d, "3m")} title="Review again in 3 months">
                                3m
                              </Chip>
                              <Chip onClick={() => markReviewed(d, "6m")} title="Review again in 6 months">
                                6m
                              </Chip>

                              <Chip onClick={() => markReviewed(d, "clear")} title="Stop resurfacing this decision">
                                Clear review
                              </Chip>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs text-zinc-500">Or set a custom date:</div>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="date"
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                                  value={d.review_at ? new Date(d.review_at).toISOString().slice(0, 10) : ""}
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
                              <div className="mt-1 text-xs text-zinc-500">
                                Review date: {softDate(d.review_at)}
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
                              <Chip onClick={() => markReviewed(d)} title="Reviewed (keep cadence)">
                                Reviewed
                              </Chip>
                              <Chip onClick={() => markReviewed(d, "1m")} title="Review again in a month">
                                1m
                              </Chip>
                              <Chip onClick={() => markReviewed(d, "3m")} title="Review again in 3 months">
                                3m
                              </Chip>
                              <Chip onClick={() => markReviewed(d, "clear")} title="Stop resurfacing this decision">
                                Clear review
                              </Chip>
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
