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

function monthBoundsISO() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function softDate(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString();
}

function dollarsFromCents(cents: any) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [preferredName, setPreferredName] = useState<string>("");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

  // Inline “answer” (deterministic) for Home questions
  const [answerStatus, setAnswerStatus] = useState<string>("");
  const [answerText, setAnswerText] = useState<string>("");
  const [lastQuestion, setLastQuestion] = useState<string>("");

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
      const { data, error } = await supabase
        .from("profiles")
        .select("fine_print_signed_name")
        .eq("user_id", userId)
        .maybeSingle();

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

  const isBillsQuestion = (q: string) => {
    const s = q.trim().toLowerCase();
    if (!s) return false;
    // intent: bills + month/due
    const hasBillsWord = s.includes("bill") || s.includes("bills");
    const hasMonthCue = s.includes("this month") || s.includes("month") || s.includes("due");
    return hasBillsWord && hasMonthCue;
  };

  const answerHomeQuestion = async (uid: string, qRaw: string) => {
    const q = qRaw.trim();
    setLastQuestion(q);
    setAnswerText("");
    setAnswerStatus("Checking…");

    // Bills due this month (deterministic)
    if (isBillsQuestion(q)) {
      const { startIso, endIso } = monthBoundsISO();

      // We don’t know the exact bills schema, so we try a couple of likely shapes safely.
      // Attempt A: next_due_at exists
      try {
        const resA = await supabase
          .from("bills")
          .select("id,name,amount_cents,currency,next_due_at")
          .eq("user_id", uid)
          .gte("next_due_at", startIso)
          .lt("next_due_at", endIso)
          .order("next_due_at", { ascending: true });

        if (!resA.error) {
          const rows = (resA.data ?? []) as any[];

          if (rows.length === 0) {
            setAnswerStatus("");
            setAnswerText("I can’t see any bills due this month.");
            return;
          }

          const lines = rows.map((b) => {
            const when = softDate(b.next_due_at);
            const amt = dollarsFromCents(b.amount_cents);
            const cur = typeof b.currency === "string" ? b.currency : "";
            const amtPart = amt ? ` — ${amt}${cur ? ` ${cur}` : ""}` : "";
            return `• ${b.name ?? "Bill"}${when ? ` — ${when}` : ""}${amtPart}`;
          });

          setAnswerStatus("");
          setAnswerText(lines.join("\n"));
          return;
        }
      } catch {
        // fall through
      }

      // Attempt B: due_date exists (date)
      try {
        // Convert month bounds to YYYY-MM-DD for date comparisons if needed
        const startDate = new Date(startIso).toISOString().slice(0, 10);
        const endDate = new Date(endIso).toISOString().slice(0, 10);

        const resB = await supabase
          .from("bills")
          .select("id,name,amount_cents,currency,due_date")
          .eq("user_id", uid)
          .gte("due_date", startDate)
          .lt("due_date", endDate)
          .order("due_date", { ascending: true });

        if (!resB.error) {
          const rows = (resB.data ?? []) as any[];

          if (rows.length === 0) {
            setAnswerStatus("");
            setAnswerText("I can’t see any bills due this month.");
            return;
          }

          const lines = rows.map((b) => {
            const when = b.due_date ? String(b.due_date) : "";
            const amt = dollarsFromCents(b.amount_cents);
            const cur = typeof b.currency === "string" ? b.currency : "";
            const amtPart = amt ? ` — ${amt}${cur ? ` ${cur}` : ""}` : "";
            return `• ${b.name ?? "Bill"}${when ? ` — ${when}` : ""}${amtPart}`;
          });

          setAnswerStatus("");
          setAnswerText(lines.join("\n"));
          return;
        }
      } catch {
        // fall through
      }

      // Fallback: we can’t reliably compute “this month” from schema
      setAnswerStatus("");
      setAnswerText("I can’t answer bills-by-month yet from Home. For now, open Bills to see what’s due.");
      return;
    }

    // Unknown question type (for now): hold it, don’t pretend.
    setAnswerStatus("");
    setAnswerText("I can’t answer that yet here — but it’s been held.");
  };

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;

    // Clear old answer display whenever a new message is sent
    setAnswerStatus("");
    setAnswerText("");
    setLastQuestion("");

    // Snapshot before we clear
    const msg = raw;

    setText("");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    if (authStatus !== "signed_in" || !userId) {
      flashAffirmation("Held.");
      return;
    }

    // If it looks like a question, answer inline (deterministic, V1)
    const looksLikeQuestion = msg.endsWith("?") || isBillsQuestion(msg);

    if (looksLikeQuestion) {
      flashAffirmation("Held.");
      await answerHomeQuestion(userId, msg);
      return;
    }

    // Otherwise: unload/capture
    flashAffirmation("Saved.");
    await unload.submit(msg);
  };

  const showExamples = text.trim().length === 0;
  const canSend = authStatus === "signed_in" && text.trim().length > 0;
  const subtitle = preferredName ? `Good to see you, ${preferredName}.` : undefined;

  return (
    <Page title="Home" subtitle={subtitle} right={<div className="flex items-center gap-2"></div>}>
      <div className="mx-auto w-full max-w-[680px] space-y-6">
        {/* Unload / Ask (primary) */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What’s on your mind?"
              className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                // Cmd/Ctrl + Enter sends
                if (cmdOrCtrl && e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                  return;
                }

                // Enter sends (Shift+Enter makes a newline)
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
                className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                aria-label="Send"
                title="Send (Enter)"
              >
                →
              </button>
            ) : null}
          </div>

          <div className="text-xs text-zinc-600">Unload it here. Ask if you want help.</div>

          {showExamples ? (
            <div className="text-xs text-zinc-500 space-y-1">
              <div>• “Can we afford this right now?”</div>
              <div>• “What are my total bills due this month?”</div>
              <div>• “I feel unsure about a money decision.”</div>
            </div>
          ) : null}

          {affirmation ? (
            <div className="text-sm text-zinc-600" aria-live="polite">
              {affirmation}
            </div>
          ) : (
            <div className="h-5" aria-hidden="true" />
          )}

          {/* Inline answer card (deterministic V1 questions) */}
          {answerStatus || answerText ? (
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                <div className="space-y-2">
                  {lastQuestion ? <div className="text-xs text-zinc-500">Answer</div> : null}
                  {answerStatus ? <div className="text-xs text-zinc-500">{answerStatus}</div> : null}
                  {answerText ? <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-800">{answerText}</div> : null}
                  {answerText && isBillsQuestion(lastQuestion) ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Chip onClick={() => router.push("/bills")} title="Open Bills">
                        Open Bills
                      </Chip>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Existing unload response (if your hook provides one) */}
          {unload.response ? <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div> : null}

          {authStatus === "signed_out" ? <div className="text-sm text-zinc-600">Sign in to use Home.</div> : null}
        </div>

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
      </div>
    </Page>
  );
}
