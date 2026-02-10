"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button } from "@/components/ui";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

/* ---------------- types ---------------- */

type DecisionRow = {
  id: string;
  title: string | null;
  status?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string }
  | { status: "error"; question: string; message: string };

/* ---------------- helpers ---------------- */

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function prettyWhen(iso?: string | null) {
  const s = safeStr(iso);
  const ms = Date.parse(s);
  if (!s || Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function decisionLabel(d: DecisionRow) {
  const t = (d.title || "").trim();
  return t || "Untitled decision";
}

function statusPill(status?: string | null) {
  const s = (status || "").toLowerCase();
  if (!s) return { label: "Active", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
  if (/(done|closed|resolved|complete)/i.test(s)) return { label: "Closed", className: "bg-zinc-100 text-zinc-700 border border-zinc-200" };
  if (/(review|revisit|waiting|blocked)/i.test(s)) return { label: "In review", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
  return { label: "Active", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
}

/* ---------------- page ---------------- */

export default function DecisionsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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

  /* ---------------- load decisions ---------------- */

  async function loadActive(u: string) {
    setLoading(true);
    setLoadErr(null);

    /**
     * Assumption: you already have a `decisions` table.
     * We keep this query minimal so it’s resilient to schema changes.
     * You can later swap to a view like `decisions_active_latest`.
     */
    const { data, error } = await supabase
      .from("decisions")
      .select("id,title,status,updated_at,created_at")
      .eq("user_id", u)
      .order("updated_at", { ascending: false })
      .limit(7);

    if (error) {
      setLoadErr("I couldn’t load your decisions.");
      setDecisions([]);
      setLoading(false);
      return;
    }

    setDecisions((data as any as DecisionRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) return;
    void loadActive(userId);
  }, [userId]);

  /* ---------------- ask (scoped to decisions) ---------------- */

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
          scope: "decisions", // <<< IMPORTANT
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
        return;
      }

      setAsk({
        status: "done",
        question: q,
        answer: typeof (json as any)?.answer === "string" ? (json as any).answer : "",
      });

      window.setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    } catch {
      setAsk({ status: "error", question: q, message: "I couldn’t answer that right now." });
    }
  }

  return (
    <Page title="Decisions" subtitle="A safe place to think — without carrying it all.">
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* Decisions list (top few only) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-900">Active decisions</div>
                <div className="text-xs text-zinc-500">A small surface. The rest stays searchable.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip className="text-xs" onClick={() => router.push("/revisit")}>
                  Review
                </Chip>
                <Chip className="text-xs" onClick={() => router.push("/chapters")}>
                  Chapters
                </Chip>
                <Button onClick={() => router.push("/framing")} className="rounded-2xl">
                  New decision
                </Button>
              </div>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="text-sm text-zinc-600">Loading…</div>
              ) : loadErr ? (
                <div className="space-y-2">
                  <div className="text-sm text-zinc-700">{loadErr}</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip className="text-xs" onClick={() => userId && loadActive(userId)}>
                      Try again
                    </Chip>
                  </div>
                </div>
              ) : decisions.length === 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-zinc-700">No decisions yet.</div>
                  <div className="text-xs text-zinc-500">
                    If something is looping in your head, we can hold it here and make it lighter.
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <Chip className="text-xs" onClick={() => router.push("/framing")}>
                      Start a decision
                    </Chip>
                    <Chip className="text-xs" onClick={() => router.push("/capture")}>
                      Save a note instead
                    </Chip>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {decisions.slice(0, 5).map((d) => {
                    const pill = statusPill(d.status);
                    return (
                      <button
                        key={d.id}
                        onClick={() => router.push(`/decisions/${d.id}`)}
                        className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left hover:bg-zinc-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[15px] font-medium text-zinc-900">{decisionLabel(d)}</div>
                            {d.updated_at ? (
                              <div className="mt-1 text-xs text-zinc-500">Updated {prettyWhen(d.updated_at)}</div>
                            ) : null}
                          </div>
                          <div className={"shrink-0 rounded-full px-3 py-1 text-xs font-medium " + pill.className}>{pill.label}</div>
                        </div>
                      </button>
                    );
                  })}

                  {decisions.length > 5 ? (
                    <div className="pt-2 flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => router.push("/search")}>
                        Search all decisions
                      </Chip>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Ask (scoped) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask about your decisions…"
              className="w-full min-h-[110px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitAsk();
                }
              }}
            />

            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>Questions stay scoped to decisions.</span>
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

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                "What decisions are still open?",
                "What should I revisit next?",
                "Summarise the most important decision I’m carrying.",
                "What’s the smallest next step for ___?",
              ].map((ex) => (
                <Chip key={ex} className="text-xs" onClick={() => setText(ex)} disabled={ask.status === "loading"}>
                  {ex}
                </Chip>
              ))}
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
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{ask.message}</div>
                    <div className="flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => void submitAsk()}>
                        Try again
                      </Chip>
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-500">Question</div>
                    <div className="text-sm text-zinc-900">{ask.question}</div>

                    <div className="pt-2 text-[15px] leading-relaxed text-zinc-800 whitespace-pre-wrap">{ask.answer}</div>

                    <div className="pt-3 flex flex-wrap gap-2">
                      <Chip className="text-xs" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                      <Chip className="text-xs" onClick={() => inputRef.current?.focus()}>
                        Ask another
                      </Chip>
                      <Chip className="text-xs" onClick={() => router.push("/framing")}>
                        Save as a decision
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
