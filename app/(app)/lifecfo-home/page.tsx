// app/(app)/lifecfo-home/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type AskState = "idle" | "asking" | "answered" | "error";

type AskApiResponse = {
  answer?: string;
  action?: "open_bills" | "open_money" | "open_decisions" | "open_review" | "open_chapters" | "none";
  suggested_next?: "none" | "create_capture" | "open_thinking";
  capture_seed?: { title: string; prompt: string; notes: string[] } | null;
  error?: string;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function actionToHref(action: AskApiResponse["action"]): string | null {
  switch (action) {
    case "open_money":
      return "/money";
    case "open_bills":
      return "/bills";
    case "open_decisions":
      return "/decisions";
    case "open_review":
      return "/revisit";
    case "open_chapters":
      return "/chapters";
    default:
      return null;
  }
}

/**
 * Make AI output look calm and readable even if it returns markdown.
 * We intentionally keep this lightweight + non-destructive.
 */
function toCleanLines(raw: string): string[] {
  const s = (raw || "").trim();
  if (!s) return [];

  // Normalize line endings
  let t = s.replace(/\r\n/g, "\n");

  // Convert bold headings like "**Active Accounts:**" to "Active Accounts:"
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");

  // Remove leading markdown bullets "- " (keep content)
  t = t.replace(/^\s*-\s+/gm, "• ");

  // Remove accidental double bullets
  t = t.replace(/^•\s*•\s+/gm, "• ");

  // Trim extra blank lines (cap at 1)
  const lines = t.split("\n");
  const out: string[] = [];
  let blank = 0;
  for (const line of lines) {
    const cleaned = line.trimEnd();
    if (cleaned.trim() === "") {
      blank += 1;
      if (blank <= 1) out.push("");
      continue;
    }
    blank = 0;
    out.push(cleaned);
  }

  // If the model used section headings with trailing colon, add spacing before them for readability
  const final: string[] = [];
  for (let i = 0; i < out.length; i++) {
    const line = out[i];
    const isHeading = /:$/.test(line) && line.length <= 40 && !line.startsWith("• ");
    if (isHeading && final.length > 0 && final[final.length - 1] !== "") final.push("");
    final.push(line);
  }

  // Remove leading/trailing blank lines
  while (final.length && final[0] === "") final.shift();
  while (final.length && final[final.length - 1] === "") final.pop();

  return final;
}

export default function LifeCFOHomePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [userId, setUserId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [state, setState] = useState<AskState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [resp, setResp] = useState<AskApiResponse | null>(null);
  const lastAskedRef = useRef<string>("");

  const answerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user?.id) {
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

  const canSubmit = useMemo(() => {
    return authStatus === "signed_in" && !!userId && text.trim().length > 0 && state !== "asking";
  }, [authStatus, userId, text, state]);

  const actionHref = useMemo(() => actionToHref(resp?.action), [resp?.action]);

  const cleanLines = useMemo(() => toCleanLines(safeStr(resp?.answer)), [resp?.answer]);

  const scrollToAnswer = () => {
    window.setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  async function ask() {
    const q = text.trim();
    if (!q) return;

    if (authStatus !== "signed_in" || !userId) {
      setState("error");
      setErrorMsg("Sign in to ask Life CFO.");
      return;
    }

    setState("asking");
    setErrorMsg(null);
    setResp(null);
    lastAskedRef.current = q;

    try {
      const res = await fetch("/api/home/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, question: q }),
      });

      const json = (await res.json().catch(() => ({}))) as AskApiResponse;

      if (!res.ok) {
        setState("error");
        setErrorMsg(json?.error ? String(json.error) : "I couldn’t answer that right now.");
        scrollToAnswer();
        return;
      }

      setResp(json);
      setState("answered");
      scrollToAnswer();
    } catch (e: any) {
      setState("error");
      setErrorMsg(e?.message ? String(e.message) : "I couldn’t answer that right now.");
      scrollToAnswer();
    }
  }

  async function copyToClipboard(v: string) {
    const s = v.trim();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      toast({ title: "Copied", description: "Ready to paste." });
    } catch {
      toast({ title: "Couldn’t copy", description: "Your browser blocked clipboard access." });
    }
  }

  function clear() {
    setText("");
    setResp(null);
    setErrorMsg(null);
    setState("idle");
    lastAskedRef.current = "";
  }

  return (
    <Page
      title="Life CFO"
      subtitle={<span className="text-sm">You don’t need to do anything right now.</span>}
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/lifecfo-home-v2")} className="text-xs" title="Open v2 route">
            v2 route
          </Chip>
          <Chip onClick={() => router.push("/home")} className="text-xs" title="Keystone">
            Keystone
          </Chip>
        </div>
      }
    >
      <div className="mx-auto max-w-[760px] space-y-4">
        {/* tiny stamp (keep it subtle; remove later) */}
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-[11px] text-zinc-500">
          BUILD STAMP: LIFECFO_HOME_ANSWER_FIRST__2026-02-06__A
        </div>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-1">
            <div className="text-sm font-semibold text-zinc-900">Life CFO</div>
            {authStatus === "signed_out" ? (
              <div className="text-sm text-zinc-700">Sign in to ask a question.</div>
            ) : (
              <div className="text-sm text-zinc-700">Ask anything — I’ll answer first. Saving is always optional.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="text-sm font-semibold text-zinc-900">What’s on your mind?</div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. ‘Husband and I need to know how to best manage our accounts…’"
              className="mt-2 min-h-[140px] w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-800 placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-zinc-200"
              disabled={authStatus !== "signed_in"}
              onKeyDown={(e) => {
                const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                if (cmdOrCtrl && e.key === "Enter") {
                  e.preventDefault();
                  void ask();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={ask} disabled={!canSubmit}>
                {state === "asking" ? "Thinking…" : "Ask"}
              </Button>

              <Chip className="text-xs" title="Copy" onClick={() => copyToClipboard(text)} disabled={text.trim().length === 0}>
                Copy
              </Chip>

              <Chip className="text-xs" title="Clear" onClick={clear} disabled={state === "asking"}>
                Clear
              </Chip>

              <div className="ml-auto text-xs text-zinc-500">
                {state === "idle" ? "Ready" : state === "asking" ? "Thinking…" : state === "answered" ? "Updated just now" : "—"}
              </div>
            </div>
          </CardContent>
        </Card>

        {(state === "error" || state === "answered") ? (
          <div ref={answerRef}>
            <Card className="border-zinc-200 bg-white">
              <CardContent className="space-y-3">
                <div className="text-sm font-semibold text-zinc-900">Life CFO</div>

                {state === "error" ? (
                  <div className="space-y-2">
                    <div className="text-sm text-zinc-700">{errorMsg || "I couldn’t answer that right now."}</div>
                    <div className="flex flex-wrap gap-2">
                      <Chip className="text-xs" title="Try again" onClick={() => void ask()}>
                        Try again
                      </Chip>
                      <Chip className="text-xs" title="Done" onClick={() => setState("idle")}>
                        Done
                      </Chip>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      {cleanLines.length > 0 ? (
                        cleanLines.map((line, idx) =>
                          line === "" ? (
                            <div key={idx} className="h-2" />
                          ) : (
                            <div key={idx} className="text-[15px] leading-relaxed text-zinc-800">
                              {line}
                            </div>
                          )
                        )
                      ) : (
                        <div className="text-sm text-zinc-700">—</div>
                      )}
                    </div>

                    <div className="text-xs text-zinc-500">
                      <span className="font-medium text-zinc-600">You asked:</span> {lastAskedRef.current}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {actionHref ? (
                        <Chip className="text-xs" title="Open suggested page" onClick={() => router.push(actionHref)}>
                          Open
                        </Chip>
                      ) : null}

                      <Chip className="text-xs" title="Copy answer" onClick={() => copyToClipboard(safeStr(resp?.answer ?? ""))}>
                        Copy answer
                      </Chip>

                      <Chip className="text-xs" title="Ask follow-up" onClick={() => window.setTimeout(() => document.querySelector("textarea")?.focus(), 0)}>
                        Ask follow-up
                      </Chip>

                      <Chip className="text-xs" title="Done" onClick={() => setState("idle")}>
                        Done
                      </Chip>
                    </div>

                    <div className="pt-3">
                      <div className="mb-2 text-xs font-medium text-zinc-600">Optional</div>
                      <div className="flex flex-wrap gap-2">
                        <Chip
                          className="text-xs"
                          title="Create a capture (paste your question)"
                          onClick={async () => {
                            await copyToClipboard(lastAskedRef.current);
                            router.push("/capture");
                          }}
                        >
                          Hold this as a capture →
                        </Chip>

                        <Chip
                          className="text-xs"
                          title="Save as a decision (paste your question)"
                          onClick={async () => {
                            await copyToClipboard(lastAskedRef.current);
                            router.push("/framing");
                          }}
                        >
                          Save as a decision →
                        </Chip>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
