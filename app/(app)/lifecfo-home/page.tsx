// app/(app)/lifecfo-home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";
import { useRouter } from "next/navigation";
import { maybeCrisisIntercept } from "@/lib/safety/guard";

export const dynamic = "force-dynamic";

/* ---------- helpers ---------- */

function firstNameOf(full: string) {
  const s = (full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] || "";
}

function isYesish(s: string) {
  const t = s.trim().toLowerCase();
  return ["y", "yes", "yep", "yeah", "sure", "ok", "okay"].includes(t);
}

type CaptureSeed = {
  title: string;
  prompt: string;
  notes: string[];
};

type ApiAction = "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
type SuggestedNext = "none" | "create_capture" | "open_thinking";

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | {
      status: "done";
      question: string;
      answer: string;
      actionHref?: string | null;
      suggestedNext?: SuggestedNext;
      captureSeed?: CaptureSeed | null;
    }
  | { status: "error"; question: string; message: string };

function actionToHref(action: ApiAction | undefined): string | null {
  if (action === "open_money") return "/money";
  if (action === "open_bills") return "/bills";
  if (action === "open_decisions") return "/decisions";
  if (action === "open_review") return "/revisit";
  if (action === "open_chapters") return "/chapters";
  return null;
}

/**
 * Make answers look calm even if the model returns light markdown.
 * We keep this minimal + safe: don't "render markdown", just clean it.
 */
function cleanAnswer(raw: string) {
  let t = (raw || "").trim();
  if (!t) return "";

  // normalize line endings
  t = t.replace(/\r\n/g, "\n");

  // **bold** -> plain
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");

  // leading "- " -> "• "
  t = t.replace(/^\s*-\s+/gm, "• ");

  // collapse excessive blank lines
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

export default function LifeCFOHomePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState("");

  const [text, setText] = useState("");
  const [ask, setAsk] = useState<AskState>({ status: "idle" });

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const answerRef = useRef<HTMLDivElement | null>(null);

  const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);
  const scrollToAnswer = () =>
    window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);

  /* ---------- auth ---------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    let alive = true;
    (async () => {
      const { data } = await supabase.from("profiles").select("fine_print_signed_name").eq("user_id", userId).maybeSingle();
      if (!alive) return;

      const full = typeof data?.fine_print_signed_name === "string" ? data.fine_print_signed_name : "";
      setPreferredName(firstNameOf(full));
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  /* ---------- ask ---------- */

  const askHome = async (question: string) => {
    if (!userId) return;

    setAsk({ status: "loading", question });

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question }),
      });

      const json = (await res.json().catch(() => ({}))) as any;

      if (!res.ok) {
        setAsk({ status: "error", question, message: "I couldn’t answer that right now." });
        scrollToAnswer();
        return;
      }

      const answer = cleanAnswer(typeof json?.answer === "string" ? json.answer : "");
      const actionHref = actionToHref(json?.action as ApiAction);

      setAsk({
        status: "done",
        question,
        answer,
        actionHref,
        suggestedNext: (typeof json?.suggested_next === "string" ? (json.suggested_next as SuggestedNext) : "none") as SuggestedNext,
        captureSeed: (json?.capture_seed && typeof json.capture_seed === "object" ? (json.capture_seed as CaptureSeed) : null) as
          | CaptureSeed
          | null,
      });

      scrollToAnswer();
    } catch {
      setAsk({ status: "error", question, message: "I couldn’t answer that right now." });
      scrollToAnswer();
    }
  };

  /* ---------- submit (ANSWER-FIRST, always) ---------- */

  const submit = async () => {
    const msg = text.trim();
    if (!msg) return;

    setText("");
    focusInput();

    if (authStatus !== "signed_in" || !userId) {
      setAsk({ status: "error", question: msg, message: "Sign in to ask Life CFO." });
      scrollToAnswer();
      return;
    }

    // Crisis intercept (no save, no AI)
    const intercept = maybeCrisisIntercept(msg);
    if (intercept) {
      setAsk({ status: "done", question: msg, answer: intercept.content, actionHref: null, suggestedNext: "none", captureSeed: null });
      scrollToAnswer();
      return;
    }

    // “yes” follow-up after an answer (simple affordance)
    if (isYesish(msg) && ask.status === "done") {
      await askHome(`${ask.question}\n\nUser follow-up: yes.`);
      return;
    }

    // Always ASK (no intent routing here)
    await askHome(msg);
  };

  /* ---------- render ---------- */

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;

  const canType = authStatus === "signed_in";

  return (
    <Page title="Home" subtitle={subtitle}>
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* Top calm orientation card (keep the original vibe/copy) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm font-semibold text-zinc-900">Life CFO</div>

              {authStatus === "signed_out" ? (
                <div className="text-sm text-zinc-700">Sign in to use Home.</div>
              ) : (
                <div className="text-sm text-zinc-700">You don’t need to do anything right now.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Input card (same copy / same feel) */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What’s on your mind?"
              className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              disabled={!canType}
              onKeyDown={(e) => {
                const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                if (cmdOrCtrl && e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                  return;
                }

                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />

            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>Ask a question or put something down.</span>

              {/* keep the right side quiet + non-system-y */}
              {ask.status === "loading" ? <span aria-live="polite">Thinking…</span> : <span className="h-4" aria-hidden="true" />}
            </div>

            {/* Optional button (only if you want it visible; keeping it subtle) */}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={() => void submit()}
                disabled={!canType || !text.trim() || ask.status === "loading"}
                className="rounded-2xl"
              >
                Ask
              </Button>
              <Chip
                className="text-xs"
                title="Clear"
                onClick={() => setText("")}
                disabled={!text.trim() || ask.status === "loading"}
              >
                Clear
              </Chip>
            </div>
          </CardContent>
        </Card>

        {/* Answer card */}
        {ask.status !== "idle" ? (
          <div ref={answerRef}>
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                {ask.status === "loading" ? (
                  <div className="text-sm text-zinc-700">Thinking…</div>
                ) : ask.status === "error" ? (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                    <div className="text-sm text-zinc-700">{ask.message}</div>
                    <div className="text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600">You asked:</span> {ask.question}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip className="text-xs" title="Try again" onClick={() => void askHome(ask.question)}>
                        Try again
                      </Chip>
                      <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm font-semibold text-zinc-900">Life CFO</div>

                    {/* Cleaned, calm rendering */}
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{ask.answer}</div>

                    <div className="text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600">You asked:</span> {ask.question}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {ask.actionHref ? (
                        <Chip className="text-xs" title="Open" onClick={() => router.push(ask.actionHref!)}>
                          Open
                        </Chip>
                      ) : null}

                      <Chip
                        className="text-xs"
                        title="Copy answer"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(ask.answer || "");
                            toast({ title: "Copied", description: "Ready to paste." });
                          } catch {
                            toast({ title: "Couldn’t copy", description: "Your browser blocked clipboard access." });
                          }
                        }}
                      >
                        Copy answer
                      </Chip>

                      <Chip className="text-xs" title="Ask follow-up" onClick={focusInput}>
                        Ask follow-up
                      </Chip>

                      <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>

                    {/* Permissioned saving (quiet, optional, post-answer) */}
                    <div className="pt-2">
                      <div className="text-xs font-medium text-zinc-600">Would you like me to hold onto this?</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Chip
                          className="text-xs"
                          title="Create a capture"
                          onClick={async () => {
                            // Keep it simple: copy the question so user can paste, then navigate.
                            try {
                              await navigator.clipboard.writeText(ask.question);
                              toast({ title: "Copied", description: "Question copied. Paste it into Capture." });
                            } catch {}
                            router.push("/capture");
                          }}
                        >
                          Create a capture →
                        </Chip>

                        <Chip
                          className="text-xs"
                          title="Save as a decision"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(ask.question);
                              toast({ title: "Copied", description: "Question copied. Paste it into a Decision." });
                            } catch {}
                            router.push("/framing");
                          }}
                        >
                          Save as a decision →
                        </Chip>

                        <Chip className="text-xs" title="Leave it for now" onClick={() => {}}>
                          Leave it for now
                        </Chip>
                      </div>

                      {/* If API suggests "create_capture", we keep it calm and non-directive */}
                      {ask.suggestedNext === "create_capture" ? (
                        <div className="mt-2 text-xs text-zinc-500">
                          If you want, we can hold this as a capture so you don’t have to carry it.
                        </div>
                      ) : null}
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
