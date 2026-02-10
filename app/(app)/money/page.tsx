"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button } from "@/components/ui";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

/* ---------------- types ---------------- */

type MoneySnapshot = {
  available_cash: number | null;
  upcoming_obligations: number | null;
  buffer: number | null;
  goals_pressure: number | null;
  confidence: "high" | "medium" | "low";
};

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string }
  | { status: "error"; question: string; message: string };

/* ---------------- helpers ---------------- */

function fmt(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

function confidenceCopy(c: MoneySnapshot["confidence"]) {
  if (c === "high") return "Based on linked accounts.";
  if (c === "medium") return "Some figures are estimated.";
  return "Limited data so far.";
}

/* ---------------- page ---------------- */

export default function MoneyPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MoneySnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const [ask, setAsk] = useState<AskState>({ status: "idle" });
  const [text, setText] = useState("");

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);

  /* ---------------- auth ---------------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data?.user?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- load snapshot ---------------- */

  useEffect(() => {
    if (!userId) return;

    let alive = true;
    (async () => {
      setLoading(true);

      /**
       * This is intentionally simple.
       * Server-side aggregation can evolve without changing this page.
       */
      const { data } = await supabase
        .from("money_snapshot_latest")
        .select("available_cash,upcoming_obligations,buffer,goals_pressure,confidence")
        .eq("user_id", userId)
        .maybeSingle();

      if (!alive) return;

      setSnapshot(
        data ?? {
          available_cash: null,
          upcoming_obligations: null,
          buffer: null,
          goals_pressure: null,
          confidence: "low",
        }
      );
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  /* ---------------- ask (scoped to money) ---------------- */

  async function submitAsk() {
    const q = text.trim();
    if (!q || !userId) return;

    setText("");
    setAsk({ status: "loading", question: q });

    const intercept = maybeCrisisIntercept(q);
    if (intercept) {
      setAsk({ status: "done", question: q, answer: intercept.content });
      return;
    }

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          question: q,
          scope: "money", // <<< IMPORTANT: scoped ask
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
        return;
      }

      setAsk({
        status: "done",
        question: q,
        answer: typeof json?.answer === "string" ? json.answer : "",
      });

      window.setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    } catch {
      setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
    }
  }

  /* ---------------- render ---------------- */

  return (
    <Page title="Money" subtitle="A clear picture, without the noise.">
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* Snapshot */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            {loading ? (
              <div className="text-sm text-zinc-600">Loading your snapshot…</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-zinc-900">Your current position</div>
                  <div className="text-xs text-zinc-500">{confidenceCopy(snapshot!.confidence)}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-zinc-500">Available cash</div>
                    <div className="text-lg font-medium text-zinc-900">{fmt(snapshot!.available_cash)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Upcoming obligations</div>
                    <div className="text-lg font-medium text-zinc-900">
                      {fmt(snapshot!.upcoming_obligations)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Goals pressure</div>
                    <div className="text-lg font-medium text-zinc-900">{fmt(snapshot!.goals_pressure)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Buffer</div>
                    <div className="text-lg font-medium text-zinc-900">{fmt(snapshot!.buffer)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Chip className="text-xs" onClick={() => router.push("/money/accounts")}>
                    Accounts
                  </Chip>
                  <Chip className="text-xs" onClick={() => router.push("/money/bills")}>
                    Bills
                  </Chip>
                  <Chip className="text-xs" onClick={() => router.push("/money/goals")}>
                    Goals
                  </Chip>
                  <Chip className="text-xs" onClick={() => router.push("/money/buffer")}>
                    Buffer
                  </Chip>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ask (scoped) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about your money…"
              className="w-full min-h-[110px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitAsk();
                }
              }}
            />

            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>Questions stay scoped to your money.</span>
              {ask.status === "loading" ? <span>Thinking…</span> : null}
            </div>

            <div className="mt-3 flex gap-2">
              <Button onClick={() => void submitAsk()} disabled={!text.trim() || ask.status === "loading"}>
                Get answer
              </Button>
              <Chip className="text-xs" onClick={() => setText("")} disabled={!text.trim()}>
                Clear
              </Chip>
            </div>
          </CardContent>
        </Card>

        {/* Answer */}
        {ask.status !== "idle" ? (
          <div ref={answerRef}>
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                {ask.status === "loading" ? (
                  <div className="text-sm text-zinc-700">Thinking…</div>
                ) : ask.status === "error" ? (
                  <div className="text-sm text-zinc-700">{ask.message}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500">Question</div>
                    <div className="text-sm text-zinc-900">{ask.question}</div>

                    <div className="pt-2 text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap">
                      {ask.answer}
                    </div>

                    <div className="pt-3 flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                      <Chip className="text-xs" onClick={() => inputRef.current?.focus()}>
                        Ask another
                      </Chip>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
