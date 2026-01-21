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
  reviewed_at: string | null;

  review_notes: string | null;
  review_history: any[] | null;
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

export default function DecisionsClient() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<Decision[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // throttle / reload protection
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const queuedRefetchRef = useRef(false);

  const openItem = useMemo(() => items.find((x) => x.id === openId) ?? null, [items, openId]);

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
        "id,user_id,title,context,status,created_at,decided_at,review_at,reviewed_at,review_notes,review_history"
      )
      .eq("user_id", uid)
      .neq("status", "draft")
      .order("decided_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    inFlightRef.current = false;

    if (!isMountedRef.current) return;

    if (error) {
      setStatusLine(`Error: ${error.message}`);
      setItems([]);
      return;
    }

    const rows = (data ?? []) as Decision[];
    setItems(rows);
    setStatusLine(rows.length === 0 ? "Nothing committed yet." : `Loaded ${rows.length}.`);
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
      .channel(`decisions_ledger_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` },
        () => {
          void load(userId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ----- actions (quiet, optional) -----
  const setReviewAt = async (d: Decision, preset: "1w" | "1m" | "3m" | "6m" | "clear") => {
    if (!userId) return;

    const next = preset === "clear" ? null : nextReviewFromPreset(preset);

    // optimistic
    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, review_at: next } : x)));

    const { error } = await supabase
      .from("decisions")
      .update({ review_at: next })
      .eq("id", d.id)
      .eq("user_id", userId);

    if (error) {
      setStatusLine(`Update failed: ${error.message}`);
      // revert by reloading (quiet + throttled)
      void load(userId);
      return;
    }

    setStatusLine(preset === "clear" ? "Revisit cleared." : "Revisit scheduled.");
  };

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
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {items.length === 0 ? (
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
            {items.map((d) => {
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
                            {d.decided_at ? `Decided: ${softDate(d.decided_at)}` : `Created: ${softDate(d.created_at)}`}
                            {d.review_at ? ` • Revisit: ${softDate(d.review_at)}` : ""}
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
