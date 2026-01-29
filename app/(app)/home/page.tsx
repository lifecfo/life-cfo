// app/(app)/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { useHomeUnload } from "@/lib/home/useHomeUnload";
import { useHomeOrientation } from "@/lib/home/useHomeOrientation";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

function firstNameOf(full: string) {
  const s = (full || "").trim();
  if (!s) return "";
  return s.split(/\s+/)[0] || "";
}

function isYesish(s: string) {
  const t = s.trim().toLowerCase();
  return t === "y" || t === "yes" || t === "yep" || t === "yeah" || t === "sure" || t === "ok" || t === "okay";
}

function inferIntent(raw: string): "ask" | "hold" {
  const s = raw.trim();
  if (!s) return "hold";

  const lower = s.toLowerCase();
  if (s.includes("?")) return "ask";
  if (/^(what|when|why|how|can|should|do i|did i|am i|are we)\b/i.test(lower)) return "ask";
  if (/\b(bill|bills|due|total|this month|month|next|days|afford|balance|spend|spent)\b/i.test(lower)) return "ask";
  return "hold";
}

// Treat these as “bills window” questions:
// - “this month”
// - “next 30 days” / “next 2 weeks” / “in the next 10 days”
// - “upcoming bills” / “bills due soon”
function isReviewIntent(q: string) {
  const s = q.trim().toLowerCase();
  return /\b(review|revisit|check[- ]?in)\b/.test(s);
}

function billsWindowFromQuestion(q: string): { kind: "month" } | { kind: "days"; days: number } | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;

  // ✅ If they are asking about review/revisit, do NOT intercept with bills logic.
  if (isReviewIntent(s)) return null;

  const hasBillsWord = s.includes("bill") || s.includes("bills");
  const hasDueCue = s.includes("due") || s.includes("upcoming") || s.includes("coming up") || s.includes("next");
  if (!hasBillsWord && !hasDueCue) return null;

  if (s.includes("this month") || (hasBillsWord && s.includes("month"))) return { kind: "month" };

  // match “next 30 days”, “in the next 30 days”, “next 2 weeks”
  const mDays = s.match(/(?:in\s+the\s+)?next\s+(\d{1,3})\s*day/);
  if (mDays) {
    const n = Number(mDays[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 365) return { kind: "days", days: n };
  }

  const mWeeks = s.match(/(?:in\s+the\s+)?next\s+(\d{1,2})\s*week/);
  if (mWeeks) {
    const n = Number(mWeeks[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 52) return { kind: "days", days: n * 7 };
  }

  // Common shorthand
  if (s.includes("next 30")) return { kind: "days", days: 30 };
  if (s.includes("next month")) return { kind: "days", days: 30 };
  if (s.includes("due soon") || s.includes("upcoming bills") || s.includes("coming up")) return { kind: "days", days: 30 };

  // If they said “bills due” but no window, default to 30 days (safe + helpful)
  if (hasBillsWord && (s.includes("due") || s.includes("upcoming") || s.includes("coming up"))) return { kind: "days", days: 30 };

  return null;
}

type FramingSeed = {
  title: string;
  prompt: string;
  notes: string[];
};

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | {
      status: "done";
      question: string;
      answer: string;
      actionHref?: string | null;
      suggestedNext?: "none" | "create_framing";
      framingSeed?: FramingSeed | null;
    }
  | { status: "error"; question: string; message: string };

type RecurringBillRow = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
  active: boolean | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function formatMoneyFromCents(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

function formatDateShort(d: Date) {
  // Example: Tue 27 Feb 2026
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function monthBoundsLocal() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function coerceSeed(raw: any): FramingSeed | null {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const notes = Array.isArray(raw.notes) ? raw.notes.map((x: unknown) => String(x)).filter(Boolean).slice(0, 10) : [];
  if (!title && !prompt) return null;
  return {
    title: (title || "Decision to frame").slice(0, 120),
    prompt: prompt.slice(0, 2000),
    notes,
  };
}

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState<string>("");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

  const [ask, setAsk] = useState<AskState>({ status: "idle" });

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // --- Auth (quiet) ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- Load name ---
  useEffect(() => {
    if (!userId) {
      setPreferredName("");
      return;
    }

    let alive = true;

    (async () => {
      const { data, error } = await supabase.from("profiles").select("fine_print_signed_name").eq("user_id", userId).maybeSingle();
      if (!alive) return;

      if (error) {
        setPreferredName("");
        return;
      }

      const full = typeof data?.fine_print_signed_name === "string" ? data.fine_print_signed_name : "";
      setPreferredName(firstNameOf(full));
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const unload = useHomeUnload({ userId });
  const orientation = useHomeOrientation({ userId });

  const flashAffirmation = (v: "Saved." | "Held.") => {
    setAffirmation(v);
    if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
    affirmationTimerRef.current = window.setTimeout(() => setAffirmation(null), 1300);
  };

  useEffect(() => {
    return () => {
      if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
      affirmationTimerRef.current = null;
    };
  }, []);

  const openHref = (href?: string | null) => {
    if (!href) return;
    router.push(href);
  };

  // ✅ Deterministic bills answer (recurring_bills only)
  const localBillsAnswer = async (uid: string, window: { kind: "month" } | { kind: "days"; days: number }) => {
    const now = new Date();
    const { start: monthStart, end: monthEnd } = monthBoundsLocal();

    const start = window.kind === "month" ? monthStart : now;
    const end = window.kind === "month" ? monthEnd : new Date(now.getTime() + window.days * 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from("recurring_bills")
      .select("id,user_id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes,created_at,updated_at")
      .eq("user_id", uid)
      .eq("active", true)
      .gte("next_due_at", start.toISOString())
      .lt("next_due_at", end.toISOString())
      .order("next_due_at", { ascending: true })
      .limit(200);

    if (error) return { ok: false as const, answer: "I couldn’t load bills right now." };

    const rows = (data ?? []) as RecurringBillRow[];
    if (rows.length === 0) {
      const range = window.kind === "month" ? "this month" : `in the next ${window.days} days (until ${formatDateShort(end)})`;
      return { ok: true as const, answer: `There are no bills due ${range} (from what I can see).` };
    }

    // Currency: if mixed, we don’t fake a single total currency
    const currencies = Array.from(new Set(rows.map((r) => (r.currency || "AUD").toUpperCase())));
    const singleCurrency = currencies.length === 1 ? currencies[0] : null;

    const lines = rows.map((b) => {
      const name = (b.name || "Bill").trim();
      const due = b.next_due_at ? new Date(b.next_due_at).toLocaleDateString() : "—";

      const cur = (b.currency || "AUD").toUpperCase();
      const cents = typeof b.amount_cents === "number" ? b.amount_cents : b.amount_cents == null ? null : Number(b.amount_cents);
      const amt = typeof cents === "number" && Number.isFinite(cents) ? formatMoneyFromCents(cents, cur) : "—";

      const ap = b.autopay ? "Autopay" : "Not Autopay";
      return `• ${name} — ${due} — ${amt} (${ap})`;
    });

    const rangeHeader =
      window.kind === "month" ? `This month (until ${formatDateShort(end)})` : `In the next ${window.days} days (until ${formatDateShort(end)})`;

    let totalLine = "";
    if (singleCurrency) {
      const totalCents = rows.reduce((sum, b) => {
        const n = typeof b.amount_cents === "number" ? b.amount_cents : b.amount_cents == null ? null : Number(b.amount_cents);
        if (typeof n !== "number" || !Number.isFinite(n)) return sum;
        return sum + n;
      }, 0);
      totalLine = `\n\nEstimated total: ${formatMoneyFromCents(totalCents, singleCurrency)}`;
    } else {
      totalLine = `\n\nEstimated total: (multiple currencies)`;
    }

    return { ok: true as const, answer: `${rangeHeader}\n\n${lines.join("\n")}${totalLine}` };
  };

  // Create Framing (server route) — only on explicit user action
  const createFramingFromSeed = async (uid: string, seed: FramingSeed) => {
    const res = await fetch("/api/home/create-framing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, seed }),
    });

    const json = await res.json();
    if (!res.ok) return { ok: false as const, message: "I couldn’t create that framing item." };

    const inboxId = typeof json?.inbox_id === "string" ? json.inbox_id : "";
    if (!inboxId) return { ok: false as const, message: "I couldn’t create that framing item." };

    return { ok: true as const, inboxId };
  };

  // Real AI call (server route)
  const askHome = async (uid: string, question: string) => {
    setAsk({ status: "loading", question });

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, question }),
      });

      const json = await res.json();

      if (!res.ok) {
        setAsk({ status: "error", question, message: "I couldn’t answer that just now." });
        return;
      }

      const answer = typeof json?.answer === "string" ? json.answer : "";
      const action = typeof json?.action === "string" ? json.action : "none";
      const suggestedNext = typeof json?.suggested_next === "string" ? json.suggested_next : "none";
      const framingSeed = coerceSeed(json?.framing_seed);

      let actionHref: string | null = null;
      if (action === "open_bills") actionHref = "/bills";
      if (action === "open_money") actionHref = "/money";
      if (action === "open_review") actionHref = "/revisit";
      if (action === "open_decisions") actionHref = "/decisions";

      setAsk({
        status: "done",
        question,
        answer,
        actionHref,
        suggestedNext: suggestedNext === "create_framing" ? "create_framing" : "none",
        framingSeed: suggestedNext === "create_framing" ? framingSeed : null,
      });
    } catch {
      setAsk({ status: "error", question, message: "I couldn’t answer that just now." });
    }
  };

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;

    const msg = raw;

    setText("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (authStatus !== "signed_in" || !userId) {
      flashAffirmation("Held.");
      return;
    }

    if (isYesish(msg) && (ask.status === "done" || ask.status === "error")) {
      const q = ask.question;
      const followUp = `${q}\n\nUser follow-up: yes.`;
      flashAffirmation("Held.");
      await askHome(userId, followUp);
      return;
    }

    const intent = inferIntent(msg);

    // ✅ Bills questions: deterministic + richer (month or next X days)
    const billsWindow = billsWindowFromQuestion(msg);
    if (intent === "ask" && billsWindow) {
      flashAffirmation("Held.");
      const fb = await localBillsAnswer(userId, billsWindow);
      setAsk({ status: "done", question: msg, answer: fb.answer, actionHref: "/bills", suggestedNext: "none", framingSeed: null });
      return;
    }

    if (intent === "ask") {
      flashAffirmation("Held.");
      await askHome(userId, msg);
      return;
    }

    flashAffirmation("Saved.");
    setAsk({ status: "idle" });
    await unload.submit(msg);
  };

  const showExamples = text.trim().length === 0;
  const canSend = authStatus === "signed_in" && text.trim().length > 0;

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;
  const greeting = "A quiet place to unload or ask.";

  const notesVisible = orientation.loading || orientation.items.length > 0;

  const canCreateFraming =
    ask.status === "done" && ask.suggestedNext === "create_framing" && !!ask.framingSeed && authStatus === "signed_in" && !!userId;

  const [creatingFraming, setCreatingFraming] = useState(false);

  const onCreateFraming = async () => {
    if (!canCreateFraming || !userId || !ask.framingSeed) return;
    if (creatingFraming) return;

    setCreatingFraming(true);
    try {
      const r = await createFramingFromSeed(userId, ask.framingSeed);
      if (!r.ok) {
        setAsk({ status: "error", question: ask.question, message: r.message });
        return;
      }

      // Take them straight into Framing, focused on that new capture
      router.push(`/framing?open=${encodeURIComponent(r.inboxId)}`);
    } finally {
      setCreatingFraming(false);
    }
  };

  return (
    <Page title="Home" subtitle={subtitle} right={<div className="flex items-center gap-2"></div>}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm text-zinc-600">{greeting}</div>

              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What’s on your mind?"
                  className="w-full min-h-[150px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[16px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
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
                  aria-label="What’s on your mind?"
                  disabled={authStatus !== "signed_in"}
                />

                {canSend ? (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                    aria-label="Send"
                    title="Send (Enter)"
                  >
                    →
                  </button>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-600">Unload it here. Ask if you want help.</div>

                {affirmation ? (
                  <div className="text-sm text-zinc-600" aria-live="polite">
                    {affirmation}
                  </div>
                ) : (
                  <div className="h-5" aria-hidden="true" />
                )}
              </div>

              {showExamples ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setText("Can we afford this right now?")}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    “Can we afford this right now?”
                  </button>
                  <button
                    type="button"
                    onClick={() => setText("What bills are due this month?")}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    “What bills are due this month?”
                  </button>
                  <button
                    type="button"
                    onClick={() => setText("What bills do we have in the next 30 days?")}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    “What bills do we have in the next 30 days?”
                  </button>
                </div>
              ) : null}

              {authStatus === "signed_out" ? <div className="text-sm text-zinc-600">Sign in to use Home.</div> : null}
            </div>
          </CardContent>
        </Card>

        {ask.status !== "idle" ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-zinc-600">Answer</div>

                  {ask.status === "done" || ask.status === "error" ? (
                    <div className="text-xs text-zinc-500">
                      <span className="text-zinc-400">You asked:</span>{" "}
                      <span className="text-zinc-600">{ask.question}</span>
                    </div>
                  ) : null}
                </div>

                {ask.status === "loading" ? (
                  <div className="text-sm text-zinc-700">Thinking…</div>
                ) : ask.status === "error" ? (
                  <div className="text-sm text-zinc-700">{ask.message}</div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{ask.answer}</div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                     {ask.actionHref && ask.suggestedNext !== "create_framing" ? (
                        <Chip onClick={() => router.push(ask.actionHref!)} title="Open">
                          Open
                        </Chip>
                      ) : null}

                      {canCreateFraming ? (
                        <Chip onClick={() => void onCreateFraming()} title="Create a Framing item">
                          {creatingFraming ? "Creating…" : "Create Framing"}
                        </Chip>
                      ) : null}

                      <Chip onClick={() => setAsk({ status: "idle" })} title="Dismiss">
                        Done
                      </Chip>
                    </div>

                    <div className="text-xs text-zinc-500 pt-1">
                      You can reply here (e.g. “yes”, “show totals”, “only active”).
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {notesVisible ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-zinc-700">Notes from Keystone</div>
                {orientation.loading ? (
                  <div className="text-xs text-zinc-500">Updating…</div>
                ) : (
                  <div className="h-4" aria-hidden="true" />
                )}
              </div>

              <div className="mt-4">
                {orientation.loading && orientation.items.length === 0 ? (
                  <div className="space-y-3" aria-hidden="true">
                    <div className="h-5 w-3/4 rounded bg-zinc-100" />
                    <div className="h-5 w-2/3 rounded bg-zinc-100" />
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {orientation.items.slice(0, 3).map((n, idx) => (
                      <li key={`${idx}-${n.href}-${n.text}`} className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => openHref(n.href)}
                          className="min-w-0 flex-1 text-left text-[15px] leading-relaxed text-zinc-800 hover:underline underline-offset-4"
                          title="Open"
                        >
                          <span className="mr-2 text-zinc-400">•</span>
                          {n.text}
                        </button>

                        <div className="shrink-0">
                          <Chip onClick={() => openHref(n.href)} title="Open">
                            Open
                          </Chip>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {unload.response ? <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div> : null}
      </div>
    </Page>
  );
}
