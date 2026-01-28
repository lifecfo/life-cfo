// app/(app)/home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function moneyAUD(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "AUD" }).format(n);
}

type BillRow = {
  id: string;
  user_id: string;
  merchant_key: string;
  nickname: string | null;
  due_day_or_date: string; // text
  expected_amount: number | null; // numeric
  status: string | null; // 'active' default
  created_at: string | null;
  updated_at: string | null;
};

type ParsedDue =
  | { kind: "date"; date: Date; label: string }
  | { kind: "day"; day: number; label: string }
  | { kind: "unknown"; label: string };

function parseDue(due_day_or_date: string): ParsedDue {
  const raw = (due_day_or_date || "").trim();
  if (!raw) return { kind: "unknown", label: "Due date not set" };

  // ISO date e.g. 2026-01-15
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const ms = Date.parse(`${raw}T12:00:00`);
    if (!Number.isNaN(ms)) {
      const dt = new Date(ms);
      return { kind: "date", date: dt, label: dt.toLocaleDateString() };
    }
  }

  // Day-of-month: allow "15", "15th", "15th of month", etc.
  const dayMatch = raw.match(/(\d{1,2})/);
  if (dayMatch) {
    const day = Number(dayMatch[1]);
    if (day >= 1 && day <= 31) {
      return { kind: "day", day, label: `Day ${day}` };
    }
  }

  return { kind: "unknown", label: raw };
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
  if (/\b(bill|bills|due|total|this month|month|afford|balance|spend|spent)\b/i.test(lower)) return "ask";
  return "hold";
}

function looksLikeBillsQuestion(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return false;
  const hasBillsWord = s.includes("bill") || s.includes("bills");
  const hasMonthCue = s.includes("this month") || s.includes("month") || s.includes("due") || s.includes("upcoming") || s.includes("coming up");
  return hasBillsWord && hasMonthCue;
}

type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: string; actionHref?: string | null }
  | { status: "error"; question: string; message: string };

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState<string>("");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

  // Real “Ask” response
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

  // --- Load name (from Fine Print signature) ---
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

  // --- Hooks (contracts) ---
  const unload = useHomeUnload({ userId });
  const orientation = useHomeOrientation({ userId });

  // --- Helpers ---
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

  // --------- Local bills fallback (useful even before full “next_due_at” exists) ----------
  const localBillsAnswer = async (uid: string) => {
    const { data, error } = await supabase
      .from("bills")
      .select("id,user_id,merchant_key,nickname,due_day_or_date,expected_amount,status,created_at,updated_at")
      .eq("user_id", uid)
      .eq("status", "active");

    if (error) return { ok: false as const, answer: "I couldn’t load bills right now." };

    const rows = (data ?? []) as BillRow[];
    if (rows.length === 0) return { ok: true as const, answer: "I can’t see any active bills yet." };

    const now = new Date();
    const thisMonth = monthKey(now);
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based

    const enriched = rows
      .map((b) => {
        const parsed = parseDue(b.due_day_or_date);
        let sortKey = 9999;
        let dueLabel = parsed.label;

        if (parsed.kind === "date") {
          const mk = monthKey(parsed.date);
          if (mk !== thisMonth) return null; // ✅ only this month
          sortKey = parsed.date.getDate();
          dueLabel = parsed.date.toLocaleDateString();
        } else if (parsed.kind === "day") {
          sortKey = parsed.day;
          const dt = new Date(year, month, parsed.day, 12, 0, 0, 0);
          dueLabel = dt.toLocaleDateString();
        }

        return { bill: b, sortKey, dueLabel };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.sortKey - b.sortKey);

    if (enriched.length === 0) {
      return { ok: true as const, answer: "No bills due this month (from what I can see)." };
    }

    const lines = (enriched as any[]).map(({ bill, dueLabel }) => {
      const name = bill.nickname?.trim() ? bill.nickname.trim() : bill.merchant_key;
      const amt = bill.expected_amount != null ? moneyAUD(Number(bill.expected_amount)) : null;
      return `• ${name} — ${dueLabel}${amt ? ` — ${amt}` : ""}`;
    });

    const total = (enriched as any[]).reduce((sum, x) => {
      const n = x.bill.expected_amount;
      if (typeof n !== "number" || !Number.isFinite(n)) return sum;
      return sum + n;
    }, 0);

    return {
      ok: true as const,
      answer: `${lines.join("\n")}\n\nEstimated total: ${moneyAUD(total) ?? "—"}`,
    };
  };

  // --------- Real AI call (server route) ----------
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
        // fallback for the one thing people ask first
        if (looksLikeBillsQuestion(question)) {
          const fb = await localBillsAnswer(uid);
          setAsk({
            status: "done",
            question,
            answer: fb.answer,
            actionHref: "/bills",
          });
          return;
        }

        setAsk({ status: "error", question, message: "I couldn’t answer that just now." });
        return;
      }

      const answer = typeof json?.answer === "string" ? json.answer : "";
      const action = typeof json?.action === "string" ? json.action : "none";

      let actionHref: string | null = null;
      if (action === "open_bills") actionHref = "/bills";
      if (action === "open_money") actionHref = "/money";
      if (action === "open_review") actionHref = "/revisit";
      if (action === "open_decisions") actionHref = "/decisions";

      setAsk({ status: "done", question, answer, actionHref });
    } catch {
      // fallback for bills
      if (looksLikeBillsQuestion(question)) {
        const fb = await localBillsAnswer(uid);
        setAsk({
          status: "done",
          question,
          answer: fb.answer,
          actionHref: "/bills",
        });
        return;
      }

      setAsk({ status: "error", question, message: "I couldn’t answer that just now." });
    }
  };

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;

    const msg = raw;

    // Clear input immediately (feels fast)
    setText("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (authStatus !== "signed_in" || !userId) {
      flashAffirmation("Held.");
      return;
    }

    // If user replies “yes” while an ASK is on screen, treat it as a follow-up to the last question.
    if (isYesish(msg) && (ask.status === "done" || ask.status === "error")) {
      const q = ask.question;
      const followUp = `${q}\n\nUser follow-up: yes.`;
      flashAffirmation("Held.");
      await askHome(userId, followUp);
      return;
    }

    const intent = inferIntent(msg);

    // ASK: answer in-place (no “Saved.”; no weird “want help…” prompt)
    if (intent === "ask") {
      flashAffirmation("Held.");
      await askHome(userId, msg);
      return;
    }

    // HOLD: save capture quietly
    flashAffirmation("Saved.");
    // also clear the ask panel if they’re switching focus
    setAsk({ status: "idle" });
    await unload.submit(msg);
  };

  const showExamples = text.trim().length === 0;
  const canSend = authStatus === "signed_in" && text.trim().length > 0;

  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;

  const greeting = useMemo(() => {
    if (!preferredName) return "A quiet place to unload or ask.";
    return "A quiet place to unload or ask.";
  }, [preferredName]);

  return (
    <Page title="Home" subtitle={subtitle} right={<div className="flex items-center gap-2"></div>}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Primary input */}
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

                    // Cmd/Ctrl + Enter sends
                    if (cmdOrCtrl && e.key === "Enter") {
                      e.preventDefault();
                      void submit();
                      return;
                    }

                    // Enter sends (Shift+Enter newline)
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
                    onClick={() => setText("I feel unsure about a money decision.")}
                    className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    “I feel unsure about a money decision.”
                  </button>
                </div>
              ) : null}

              {authStatus === "signed_out" ? <div className="text-sm text-zinc-600">Sign in to use Home.</div> : null}
            </div>
          </CardContent>
        </Card>

        {/* Answer (Ask) */}
        {ask.status !== "idle" ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-600">Answer</div>

                {ask.status === "loading" ? (
                  <div className="text-sm text-zinc-700">Thinking…</div>
                ) : ask.status === "error" ? (
                  <div className="text-sm text-zinc-700">{ask.message}</div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{ask.answer}</div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {ask.actionHref ? (
                        <Chip onClick={() => router.push(ask.actionHref!)} title="Open">
                          Open
                        </Chip>
                      ) : null}

                      {looksLikeBillsQuestion(ask.question) ? (
                        <Chip onClick={() => router.push("/bills")} title="Open Bills">
                          Open Bills
                        </Chip>
                      ) : null}

                      <Chip
                        onClick={() => {
                          setAsk({ status: "idle" });
                        }}
                        title="Dismiss"
                      >
                        Done
                      </Chip>
                    </div>

                    <div className="text-xs text-zinc-500 pt-1">You can reply here (e.g. “yes”, “show totals”, “only active”).</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Notes from Keystone */}
        {orientation.items.length > 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="text-xs font-medium text-zinc-600">Notes from Keystone</div>

              <div className="mt-2 space-y-3">
                {orientation.items.slice(0, 3).map((n, idx) => (
                  <div key={`${idx}-${n.href}-${n.text}`} className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openHref(n.href)}
                      className="min-w-0 flex-1 text-left text-[15px] leading-relaxed text-zinc-800 hover:underline underline-offset-4"
                      title="Open"
                    >
                      {n.text}
                    </button>

                    <div className="shrink-0">
                      <Chip onClick={() => openHref(n.href)} title="Open">
                        Open
                      </Chip>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Existing unload response (if your hook provides one) */}
        {unload.response ? <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div> : null}
      </div>
    </Page>
  );
}
