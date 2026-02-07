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

function formatCheckedAt(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ---------- CFO memo shaping (Q&A memo) ---------- */

type MemoTone = "ok" | "tight" | "attention";

function inferTone(text: string): MemoTone {
  const t = (text || "").toLowerCase();

  // attention signals
  if (
    /(insufficient|overdue|past due|urgent|immediately|cannot|can’t|risk|at risk|missed|late fee|failed|error|shortfall|negative)/i.test(
      t
    )
  ) {
    return "attention";
  }

  // tight but not alarming
  if (/(tight|close|careful|reduce|cut back|watch|monitor|buffer|low|smaller margin|limited)/i.test(t)) {
    return "tight";
  }

  // default calm
  return "ok";
}

function splitHeadlineAndBody(answer: string): { headline: string; body: string } {
  const a = (answer || "").trim();
  if (!a) return { headline: "", body: "" };

  // Prefer first non-empty line as headline if it reads like a sentence.
  const lines = a
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { headline: "", body: "" };

  const first = lines[0];

  // If first line is short bullet-like, try first sentence from whole text.
  const looksBullet = first.startsWith("•") || first.startsWith("-") || first.startsWith("*");
  const looksTooShort = first.length < 24;

  if (looksBullet || looksTooShort) {
    const firstSentence = a.split(/(?<=[.!?])\s+/)[0]?.trim() || first;
    const rest = a.slice(firstSentence.length).trim();
    return { headline: firstSentence, body: rest };
  }

  // If first line is long, keep it as headline, rest as body.
  const body = lines.slice(1).join("\n").trim();
  return { headline: first, body };
}

function extractBullets(text: string): string[] {
  const lines = (text || "").split("\n").map((s) => s.trim());
  const bullets = lines
    .filter((l) => l.startsWith("• "))
    .map((l) => l.replace(/^•\s+/, "").trim())
    .filter(Boolean);

  // If there are no bullets, create a light structure from paragraphs (max 3).
  if (bullets.length === 0) {
    const paras = (text || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((l) => !l.toLowerCase().startsWith("you asked:"));

    // Take up to 3 meaningful lines
    return paras.slice(0, 3);
  }

  return bullets.slice(0, 5);
}

function tonePill(tone: MemoTone) {
  if (tone === "attention") return { label: "Needs attention", className: "bg-zinc-900 text-white" };
  if (tone === "tight") return { label: "A bit tight", className: "bg-zinc-100 text-zinc-800 border border-zinc-200" };
  return { label: "All clear", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
}

function calmWhatWouldChange(tone: MemoTone): string[] {
  if (tone === "attention") {
    return ["If income lands later than expected", "If a bill date is earlier than listed", "If current balances are lower than recorded"];
  }
  if (tone === "tight") {
    return ["If one extra cost appears this week", "If a bill is higher than usual", "If income timing shifts"];
  }
  return ["If a new bill is added", "If income timing changes", "If a large one-off expense appears"];
}

function calmAssumptions(): string[] {
  return ["Bills and due dates are up to date", "Account balances are current", "No large untracked expenses are pending"];
}

/* ---------- types ---------- */

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

type StatusRun = {
  id: string;
  user_id: string;
  status: "all_clear" | "tight" | "attention" | "unknown";
  reasons: any;
  facts_snapshot: any;
  memo_text: string | null;
  checked_at: string;
};

type StatusState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; run: StatusRun }
  | { status: "error"; message: string };

/* ---------- routing helpers ---------- */

function actionToHref(action: ApiAction | undefined): string | null {
  if (action === "open_money") return "/money";
  if (action === "open_bills") return "/bills";
  if (action === "open_decisions") return "/decisions";
  if (action === "open_review") return "/revisit";
  if (action === "open_chapters") return "/chapters";
  return null;
}

function statusPill(s: StatusRun["status"]) {
  if (s === "attention") return { label: "Needs attention", className: "bg-zinc-900 text-white" };
  if (s === "tight") return { label: "A bit tight", className: "bg-zinc-100 text-zinc-800 border border-zinc-200" };
  if (s === "unknown") return { label: "Not enough data", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
  return { label: "All clear", className: "bg-zinc-50 text-zinc-700 border border-zinc-200" };
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
  const [showWhy, setShowWhy] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);

  const [statusMemo, setStatusMemo] = useState<StatusState>({ status: "idle" });

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

  /* ---------- status memo (always-on CFO check-in) ---------- */

  async function fetchLatestStatus(u: string) {
    const { data, error } = await supabase
      .from("home_status_latest")
      .select("id,user_id,status,reasons,facts_snapshot,memo_text,checked_at")
      .eq("user_id", u)
      .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!data) return { ok: true as const, run: null as StatusRun | null };

    return { ok: true as const, run: data as unknown as StatusRun };
  }

  async function runStatusCheck(opts?: { force?: boolean }) {
    if (!userId) return;

    setStatusMemo((s) => (s.status === "ready" ? s : { status: "loading" }));

    try {
      // stale-aware runner (server decides whether it actually runs)
      await fetch("/api/home/status/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, force: opts?.force === true }),
      });

      const latest = await fetchLatestStatus(userId);
      if (!latest.ok) {
        setStatusMemo({ status: "error", message: "I couldn’t load your latest check-in." });
        return;
      }

      if (!latest.run) {
        setStatusMemo({ status: "error", message: "No check-in yet. Run a check when you’re ready." });
        return;
      }

      setStatusMemo({ status: "ready", run: latest.run });
    } catch {
      setStatusMemo({ status: "error", message: "I couldn’t run the check-in right now." });
    }
  }

  // Auto-run status check after sign-in (quietly; server skips if not stale)
  useEffect(() => {
    if (authStatus !== "signed_in" || !userId) return;
    void runStatusCheck({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, userId]);

  /* ---------- ask ---------- */

  const askHome = async (question: string) => {
    if (!userId) return;

    setAsk({ status: "loading", question });
    setShowDetails(false);
    setShowWhy(false);
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

    await askHome(msg);
  };

  /* ---------- memo view model (Q&A) ---------- */

  const memo = useMemo(() => {
    if (ask.status !== "done") return null;
    const tone = inferTone(ask.answer || "");
    const { headline, body } = splitHeadlineAndBody(ask.answer || "");
    const bullets = extractBullets(body || "");
    return { tone, headline, body, bullets };
  }, [ask]);

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;
  const canType = authStatus === "signed_in";

  return (
    <Page title="Home" subtitle={subtitle}>
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* TOP: Always-on CFO check-in memo */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
                <div className="flex items-center gap-2">
                  <Chip className="text-xs" title="How it works" onClick={() => router.push("/how-life-cfo-works")}>
                    How it works
                  </Chip>
                </div>
              </div>

              {authStatus === "signed_out" ? (
                <div className="text-sm text-zinc-700">Sign in to get a household check-in and ask a question.</div>
              ) : (
                <>
                  {statusMemo.status === "idle" || statusMemo.status === "loading" ? (
                    <div className="space-y-2">
                      <div className="text-sm text-zinc-700">Checking in…</div>
                      <div className="text-xs text-zinc-500">This is a calm status snapshot. Nothing saves unless you choose.</div>
                    </div>
                  ) : statusMemo.status === "error" ? (
                    <div className="space-y-2">
                      <div className="text-sm text-zinc-700">{statusMemo.message}</div>
                      <div className="flex flex-wrap gap-2">
                        <Chip className="text-xs" title="Run check now" onClick={() => void runStatusCheck({ force: true })}>
                          Run check now
                        </Chip>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-zinc-500">
                            <span className="font-medium text-zinc-600">Check-in</span>{" "}
                            <span className="text-zinc-400">•</span>{" "}
                            <span>Last checked: {formatCheckedAt(statusMemo.run.checked_at)}</span>
                          </div>
                        </div>

                        <div className={"rounded-full px-3 py-1 text-xs font-medium " + statusPill(statusMemo.run.status).className}>
                          {statusPill(statusMemo.run.status).label}
                        </div>
                      </div>

                      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">
                        {cleanAnswer(statusMemo.run.memo_text || "") || "No memo text available yet."}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Chip className="text-xs" title="Check now" onClick={() => void runStatusCheck({ force: true })}>
                          Check now
                        </Chip>

                        {/* gentle “open details” shortcuts (optional depth) */}
                        <Chip className="text-xs" title="Open Money" onClick={() => router.push("/money")}>
                          Open Money
                        </Chip>
                        <Chip className="text-xs" title="Open Bills" onClick={() => router.push("/bills")}>
                          Open Bills
                        </Chip>

                        {buildStamp ? <span className="ml-auto text-[11px] text-zinc-400">Build {buildStamp}</span> : null}
                      </div>

                      <div className="text-xs text-zinc-500">
                        One place. One question. One answer. <span className="text-zinc-400">Save only if you choose.</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {authStatus !== "signed_out" && buildStamp && statusMemo.status !== "ready" ? (
                <div className="text-[11px] text-zinc-400">Build {buildStamp}</div>
              ) : null}
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
                <Chip key={ex} className="text-xs" title={ex} disabled={!canType || ask.status === "loading"} onClick={() => setText(ex)}>
                  {ex}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Q&A CFO Answer card */}
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
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold text-zinc-900">Life CFO answer</div>
                        <div className="text-xs text-zinc-500">
                          <span className="font-medium text-zinc-600">Question:</span> {ask.question}
                        </div>
                      </div>

                      {memo ? (
                        <div className={"rounded-full px-3 py-1 text-xs font-medium " + tonePill(memo.tone).className}>
                          {tonePill(memo.tone).label}
                        </div>
                      ) : null}
                    </div>

                    {/* One-sentence headline */}
                    <div className="text-[16px] leading-relaxed text-zinc-900">
                      <span className="font-medium">{memo?.headline || ask.answer}</span>
                    </div>

                    {/* Key points */}
                    {memo ? (
                      <div className="space-y-2">
                        {memo.bullets.length > 0 ? (
                          <ul className="space-y-1">
                            {memo.bullets.slice(0, 3).map((b, idx) => (
                              <li key={idx} className="text-[14px] leading-relaxed text-zinc-800">
                                <span className="text-zinc-400">• </span>
                                {b}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

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
                            await navigator.clipboard.writeText((memo?.headline ? memo.headline + "\n\n" : "") + (ask.answer || ""));
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

                    {/* Optional depth */}
                    {memo ? (
                      <div className="space-y-3 pt-1">
                        <div className="flex flex-wrap gap-2">
                          <Chip className="text-xs" title="Details" onClick={() => setShowDetails((v) => !v)}>
                            {showDetails ? "Hide details" : "Details"}
                          </Chip>
                          <Chip className="text-xs" title="What would change this?" onClick={() => setShowWhy((v) => !v)}>
                            {showWhy ? "Hide what would change this" : "What would change this?"}
                          </Chip>
                          <Chip className="text-xs" title="Assumptions" onClick={() => setShowAssumptions((v) => !v)}>
                            {showAssumptions ? "Hide assumptions" : "Assumptions"}
                          </Chip>
                        </div>

                        {showDetails ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                            <div className="text-xs font-medium text-zinc-700">Details</div>
                            <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
                              {memo.body ? memo.body : ask.answer}
                            </div>
                          </div>
                        ) : null}

                        {showWhy ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                            <div className="text-xs font-medium text-zinc-700">What would change this</div>
                            <ul className="mt-2 space-y-1">
                              {calmWhatWouldChange(memo.tone).map((x) => (
                                <li key={x} className="text-[14px] leading-relaxed text-zinc-800">
                                  <span className="text-zinc-400">• </span>
                                  {x}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {showAssumptions ? (
                          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                            <div className="text-xs font-medium text-zinc-700">Assumptions</div>
                            <ul className="mt-2 space-y-1">
                              {calmAssumptions().map((x) => (
                                <li key={x} className="text-[14px] leading-relaxed text-zinc-800">
                                  <span className="text-zinc-400">• </span>
                                  {x}
                                </li>
                              ))}
                            </ul>
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
