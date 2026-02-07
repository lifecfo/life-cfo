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

type MemoTone = "ok" | "tight" | "attention";

type AskMemo = {
  tone?: MemoTone;
  headline?: string;
  key_points?: string[];
  details?: string;
  what_changes_this?: string[];
  assumptions?: string[];
};

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | {
      status: "done";
      question: string;
      answer: string; // ChatGPT-style formatted string (from API)
      actionHref?: string | null;
      suggestedNext?: SuggestedNext;
      captureSeed?: CaptureSeed | null;
      memo?: AskMemo | null; // structured memo (preferred)
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
 * Keep formatting. Only normalize line endings + collapse extreme blank lines.
 * (Do NOT strip markdown — we want ChatGPT-style readability.)
 */
function normalizeAnswer(raw: string) {
  let t = (raw || "").trim();
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\n{4,}/g, "\n\n\n");
  return t.trim();
}

/* ---------- minimal safe “ChatGPT-style” renderer ---------- */
/**
 * Supports:
 * - paragraphs
 * - bullet lists starting with "- " or "• "
 * - **bold** (inline only)
 *
 * No links, no HTML injection, no arbitrary markdown features.
 */
function renderInlineBold(text: string) {
  const parts: Array<{ type: "text" | "bold"; value: string }> = [];
  const s = text || "";
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(s)) !== null) {
    const start = m.index;
    const end = re.lastIndex;
    if (start > last) parts.push({ type: "text", value: s.slice(last, start) });
    parts.push({ type: "bold", value: m[1] });
    last = end;
  }
  if (last < s.length) parts.push({ type: "text", value: s.slice(last) });

  return parts.map((p, idx) =>
    p.type === "bold" ? (
      <strong key={idx} className="font-semibold text-zinc-900">
        {p.value}
      </strong>
    ) : (
      <span key={idx}>{p.value}</span>
    )
  );
}

function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => {
    const src = (text || "").replace(/\r\n/g, "\n").trim();
    if (!src) return [];

    // Split into blocks by blank lines
    const rawBlocks = src.split(/\n\s*\n/g).map((b) => b.trim()).filter(Boolean);

    return rawBlocks.map((b) => {
      const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
      const isList = lines.every((l) => l.startsWith("- ") || l.startsWith("• "));
      if (isList) {
        const items = lines
          .map((l) => (l.startsWith("- ") ? l.slice(2) : l.startsWith("• ") ? l.slice(2) : l))
          .map((x) => x.trim())
          .filter(Boolean);
        return { kind: "list" as const, items };
      }
      return { kind: "para" as const, text: b };
    });
  }, [text]);

  if (blocks.length === 0) return null;

  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.kind === "list" ? (
          <ul key={i} className="space-y-1">
            {b.items.map((it, j) => (
              <li key={j} className="text-[15px] leading-relaxed text-zinc-800">
                <span className="text-zinc-400">• </span>
                {renderInlineBold(it)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
            {renderInlineBold(b.text)}
          </p>
        )
      )}
    </div>
  );
}

/* ---------- memo UI helpers ---------- */

function tonePill(tone: MemoTone | undefined) {
  const t = tone || "ok";
  if (t === "attention") return { label: "Needs attention", className: "bg-zinc-900 text-white" };
  if (t === "tight") return { label: "A bit tight", className: "bg-zinc-100 text-zinc-800 border border-zinc-200" };
  return { label: "All clear", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
}

function safeArr(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function safeTone(x: unknown): MemoTone | undefined {
  const t = String(x ?? "").trim();
  if (t === "ok" || t === "tight" || t === "attention") return t;
  return undefined;
}

/* ---------- page ---------- */

export default function LifeCFOHomePage() {
  const router = useRouter();
  const { toast } = useToast();

  const buildStamp = process.env.NEXT_PUBLIC_BUILD_STAMP || "";

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState("");

  const [text, setText] = useState("");
  const [ask, setAsk] = useState<AskState>({ status: "idle" });

  const [showDetails, setShowDetails] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

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
    setShowDetails(false);
    setShowChanges(false);
    setShowAssumptions(false);

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

      const answer = normalizeAnswer(typeof json?.answer === "string" ? json.answer : "");
      const actionHref = actionToHref(json?.action as ApiAction);

      // Prefer structured memo fields if present (new API)
      const memo: AskMemo | null = (() => {
        const headline = typeof json?.headline === "string" ? json.headline.trim() : "";
        const key_points = safeArr(json?.key_points);
        const details = typeof json?.details === "string" ? json.details.trim() : "";
        const what_changes_this = safeArr(json?.what_changes_this);
        const assumptions = safeArr(json?.assumptions);
        const tone = safeTone(json?.tone);

        const hasAny =
          !!tone || !!headline || key_points.length > 0 || !!details || what_changes_this.length > 0 || assumptions.length > 0;

        return hasAny
          ? {
              tone,
              headline,
              key_points,
              details,
              what_changes_this,
              assumptions,
            }
          : null;
      })();

      setAsk({
        status: "done",
        question,
        answer,
        actionHref,
        suggestedNext: (typeof json?.suggested_next === "string" ? (json.suggested_next as SuggestedNext) : "none") as SuggestedNext,
        captureSeed: (json?.capture_seed && typeof json.capture_seed === "object" ? (json.capture_seed as CaptureSeed) : null) as
          | CaptureSeed
          | null,
        memo,
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
      setAsk({
        status: "done",
        question: msg,
        answer: intercept.content,
        actionHref: null,
        suggestedNext: "none",
        captureSeed: null,
        memo: { tone: "attention", headline: intercept.content, key_points: [], details: "", what_changes_this: [], assumptions: [] },
      });
      scrollToAnswer();
      return;
    }

    // “yes” follow-up after an answer (simple affordance)
    if (isYesish(msg) && ask.status === "done") {
      await askHome(`${ask.question}\n\nUser follow-up: yes.`);
      return;
    }

    await askHome(msg);
  };

  /* ---------- memo view model ---------- */

  const memoVM = useMemo(() => {
    if (ask.status !== "done") return null;

    // If API sent structured memo, use it.
    if (ask.memo) {
      const tone = ask.memo.tone ?? "ok";
      const headline = (ask.memo.headline || "").trim() || "";
      const keyPoints = Array.isArray(ask.memo.key_points) ? ask.memo.key_points.filter(Boolean) : [];
      const details = (ask.memo.details || "").trim();
      const changes = Array.isArray(ask.memo.what_changes_this) ? ask.memo.what_changes_this.filter(Boolean) : [];
      const assumptions = Array.isArray(ask.memo.assumptions) ? ask.memo.assumptions.filter(Boolean) : [];

      return {
        tone,
        headline,
        keyPoints,
        details,
        changes,
        assumptions,
        answer: ask.answer,
      };
    }

    // Back-compat fallback: show answer only.
    return {
      tone: "ok" as MemoTone,
      headline: "",
      keyPoints: [],
      details: "",
      changes: [],
      assumptions: [],
      answer: ask.answer,
    };
  }, [ask]);

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;
  const canType = authStatus === "signed_in";

  return (
    <Page title="Home" subtitle={subtitle}>
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* Orientation card */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                <div className="flex items-center gap-2">
                  <Chip className="text-xs" title="How it works" onClick={() => router.push("/how-life-cfo-works")}>
                    How it works
                  </Chip>
                </div>
              </div>

              {authStatus === "signed_out" ? (
                <div className="text-sm text-zinc-700">Sign in to ask a question and get a clear answer.</div>
              ) : (
                <div className="text-sm text-zinc-700">
                  One place. One question. One answer. <span className="text-zinc-500">Nothing saves unless you choose.</span>
                </div>
              )}

              {buildStamp ? <div className="text-[11px] text-zinc-400">Build {buildStamp}</div> : null}
            </div>
          </CardContent>
        </Card>

        {/* Input card */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask Life CFO… (or just unload what’s in your head)"
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
              <span>Ask anything. Save only if you want to.</span>
              {ask.status === "loading" ? <span aria-live="polite">Thinking…</span> : <span className="h-4" aria-hidden="true" />}
            </div>

            <div className="mt-3 flex gap-2">
              <Button onClick={() => void submit()} disabled={!canType || !text.trim() || ask.status === "loading"} className="rounded-2xl">
                Get answer
              </Button>
              <Chip className="text-xs" title="Clear" onClick={() => setText("")} disabled={!text.trim() || ask.status === "loading"}>
                Clear
              </Chip>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {["Are we okay this month?", "What bills are due soon?", "What changed recently?", "Can we afford $___?"].map((ex) => (
                <Chip
                  key={ex}
                  className="text-xs"
                  title={ex}
                  disabled={!canType || ask.status === "loading"}
                  onClick={() => setText(ex)}
                >
                  {ex}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CFO Memo card */}
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
                  <div className="space-y-4">
                    {/* Memo header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-zinc-900">Life CFO memo</div>
                        <div className="text-xs text-zinc-500">
                          <span className="font-medium text-zinc-600">Question:</span> {ask.question}
                        </div>
                      </div>

                      {memoVM ? (
                        <div className={"rounded-full px-3 py-1 text-xs font-medium " + tonePill(memoVM.tone).className}>
                          {tonePill(memoVM.tone).label}
                        </div>
                      ) : null}
                    </div>

                    {/* Headline + Key points (structured) */}
                    {memoVM && (memoVM.headline || memoVM.keyPoints.length > 0) ? (
                      <div className="space-y-3">
                        {memoVM.headline ? (
                          <div className="text-[16px] leading-relaxed text-zinc-900">
                            <span className="font-medium">{memoVM.headline}</span>
                          </div>
                        ) : null}

                        {memoVM.keyPoints.length > 0 ? (
                          <ul className="space-y-1">
                            {memoVM.keyPoints.slice(0, 4).map((b, idx) => (
                              <li key={idx} className="text-[15px] leading-relaxed text-zinc-800">
                                <span className="text-zinc-400">• </span>
                                {renderInlineBold(b)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : (
                      // Fallback: show the formatted answer as-is (ChatGPT-style)
                      <MarkdownLite text={ask.answer} className="space-y-3" />
                    )}

                    {/* Controls */}
                    <div className="flex flex-wrap gap-2">
                      <Chip className="text-xs" title="Ask follow-up" onClick={focusInput}>
                        Ask follow-up
                      </Chip>

                      <Chip
                        className="text-xs"
                        title="Copy"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(ask.answer || "");
                            toast({ title: "Copied", description: "Ready to paste." });
                          } catch {
                            toast({ title: "Couldn’t copy", description: "Your browser blocked clipboard access." });
                          }
                        }}
                      >
                        Copy
                      </Chip>

                      {ask.actionHref ? (
                        <Chip className="text-xs" title="Open" onClick={() => router.push(ask.actionHref!)}>
                          Open details
                        </Chip>
                      ) : null}

                      <Chip className="text-xs" title="Done" onClick={() => setAsk({ status: "idle" })}>
                        Done
                      </Chip>
                    </div>

                    {/* Optional depth (never required) */}
                    {memoVM ? (
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap gap-2">
                          <Chip className="text-xs" title="Details" onClick={() => setShowDetails((v) => !v)}>
                            {showDetails ? "Hide details" : "Details"}
                          </Chip>
                          <Chip className="text-xs" title="What would change this?" onClick={() => setShowChanges((v) => !v)}>
                            {showChanges ? "Hide what would change this" : "What would change this?"}
                          </Chip>
                          <Chip className="text-xs" title="Assumptions" onClick={() => setShowAssumptions((v) => !v)}>
                            {showAssumptions ? "Hide assumptions" : "Assumptions"}
                          </Chip>
                        </div>

                        {showDetails ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                            <div className="text-xs font-medium text-zinc-700">Details</div>
                            <div className="mt-2">
                              {memoVM.details ? (
                                <MarkdownLite text={memoVM.details} />
                              ) : (
                                <div className="text-[14px] leading-relaxed text-zinc-500">No additional details were provided for this memo.</div>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {showChanges ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                            <div className="text-xs font-medium text-zinc-700">What would change this</div>
                            {memoVM.changes.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {memoVM.changes.slice(0, 5).map((x) => (
                                  <li key={x} className="text-[14px] leading-relaxed text-zinc-800">
                                    <span className="text-zinc-400">• </span>
                                    {renderInlineBold(x)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-2 text-[14px] leading-relaxed text-zinc-500">Nothing specific was listed for this memo.</div>
                            )}
                          </div>
                        ) : null}

                        {showAssumptions ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                            <div className="text-xs font-medium text-zinc-700">Assumptions</div>
                            {memoVM.assumptions.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {memoVM.assumptions.slice(0, 6).map((x) => (
                                  <li key={x} className="text-[14px] leading-relaxed text-zinc-800">
                                    <span className="text-zinc-400">• </span>
                                    {renderInlineBold(x)}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-2 text-[14px] leading-relaxed text-zinc-500">No explicit assumptions were listed for this memo.</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Permissioned save (post-answer, calm) */}
                    <div className="pt-2">
                      <div className="text-xs font-medium text-zinc-600">Want me to hold onto this?</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Chip
                          className="text-xs"
                          title="Save a note"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(ask.question);
                              toast({ title: "Copied", description: "Paste into Notes." });
                            } catch {}
                            router.push("/capture");
                          }}
                        >
                          Save a note
                        </Chip>

                        <Chip
                          className="text-xs"
                          title="Save a decision"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(ask.question);
                              toast({ title: "Copied", description: "Paste into a Decision." });
                            } catch {}
                            router.push("/framing");
                          }}
                        >
                          Save a decision
                        </Chip>

                        <Chip
                          className="text-xs"
                          title="Leave it"
                          onClick={() => {
                            toast({ title: "Okay", description: "Nothing saved." });
                          }}
                        >
                          Leave it
                        </Chip>
                      </div>

                      {ask.suggestedNext === "create_capture" ? (
                        <div className="mt-2 text-xs text-zinc-500">If you’d like, we can save this so it doesn’t stay in your head.</div>
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
