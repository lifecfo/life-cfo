"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string; at: string };

type Frame = {
  decision_statement?: string;
};

function isQuotaError(status: number, errorMsg: string) {
  const msg = (errorMsg || "").toLowerCase();
  return status === 429 || msg.includes("exceeded your current quota") || msg.includes("insufficient_quota");
}

export function ConversationPanel(props: {
  decisionId: string;
  decisionTitle: string;
  frame?: Frame | null;
  onClose: () => void;
}) {
  const { decisionId, decisionTitle, frame, onClose } = props;

  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [sending, setSending] = useState<boolean>(false);
  const [summarising, setSummarising] = useState<boolean>(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<string>("");

  // Summary preview (non-committal)
  const [summaryText, setSummaryText] = useState<string>("");
  const [summaryStatus, setSummaryStatus] = useState<string>("");

  // Consent step: add summary to decision
  const [addingSummary, setAddingSummary] = useState<boolean>(false);
  const [addedSummary, setAddedSummary] = useState<boolean>(false);
  const [addSummaryStatus, setAddSummaryStatus] = useState<string>("");

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const decisionStatement = useMemo(() => frame?.decision_statement ?? "", [frame]);

  const canSend = draft.trim().length > 0 && !sending;

  // Load auth + conversation
  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setStatus("Not signed in.");
        setLoading(false);
        return;
      }

      setUserId(auth.user.id);

      const { data, error } = await supabase
        .from("decision_conversations")
        .select("messages")
        .eq("id", auth.user.id)
        .eq("decision_id", decisionId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setStatus(`Couldn’t load conversation: ${error.message}`);
        setMessages([]);
        setLoading(false);
        return;
      }

      const raw = (data?.messages ?? []) as any[];
      const safe: Msg[] = Array.isArray(raw)
        ? raw
            .filter(
              (m) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                typeof m.content === "string" &&
                m.content.trim().length > 0
            )
            .map((m) => ({
              role: m.role === "user" ? ("user" as const) : ("assistant" as const),
              content: String(m.content),
              at: m.at ?? new Date().toISOString(),
            }))
        : [];

      setMessages(safe);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [decisionId]);

  // Focus input without scrolling the page (prevents the "jump to bottom" issue)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        (inputRef.current as any)?.focus?.({ preventScroll: true });
      } catch {
        inputRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [decisionId]);

  // Autoscroll the message list container to bottom (NOT the whole page)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  const persist = async (next: Msg[]) => {
    if (!userId) return;

    const { error } = await supabase.from("decision_conversations").upsert(
      {
        user_id: userId,
        decision_id: decisionId,
        messages: next,
      },
      { onConflict: "user_id,decision_id" }
    );

    if (error) setStatus(`Save failed: ${error.message}`);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (sending) return;

    setSending(true);

    const now = new Date().toISOString();
    const next: Msg[] = [...messages, { role: "user" as const, content: text, at: now }];

    // Optimistic UI
    setDraft("");
    setMessages(next);
    setStatus("");
    void persist(next);

    // New message invalidates any prior summary preview
    setSummaryText("");
    setSummaryStatus("");
    setAddedSummary(false);
    setAddSummaryStatus("");

    try {
      setStatus("Thinking…");

      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          decisionTitle,
          decisionStatement,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error ? String(json.error) : "AI request failed.";
        if (isQuotaError(res.status, errMsg)) {
          setStatus("AI is paused right now (quota/billing). Your conversation is still saved.");
        } else {
          setStatus(errMsg);
        }
        return;
      }

      const assistantText = String(json?.assistantText ?? "").trim();
      if (!assistantText) {
        setStatus("No response.");
        return;
      }

      const after: Msg[] = [
        ...next,
        { role: "assistant" as const, content: assistantText, at: new Date().toISOString() },
      ];
      setMessages(after);
      setStatus("");
      void persist(after);
    } catch (e: any) {
      setStatus(e?.message ?? "AI request failed.");
    } finally {
      setSending(false);
    }
  };

  const summariseChat = async () => {
    if (summarising) return;

    if (messages.length === 0) {
      setSummaryText("");
      setSummaryStatus("Nothing to summarise yet.");
      return;
    }

    setSummarising(true);
    setSummaryText("");
    setSummaryStatus("Summarising…");
    setAddedSummary(false);
    setAddSummaryStatus("");

    try {
      const res = await fetch("/api/ai/conversation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summarise",
          decisionTitle,
          decisionStatement,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = json?.error ? String(json.error) : "Summary failed.";
        if (isQuotaError(res.status, errMsg)) {
          setSummaryStatus("AI summaries are paused right now (quota/billing). Your conversation is still saved.");
        } else {
          setSummaryStatus(errMsg);
        }
        return;
      }

      const text = String(json?.summaryText ?? "").trim();
      if (!text) {
        setSummaryStatus("No summary returned.");
        return;
      }

      setSummaryText(text);
      setSummaryStatus("");
    } catch (e: any) {
      setSummaryStatus(e?.message ?? "Summary failed.");
    } finally {
      setSummarising(false);
    }
  };

  const addSummaryToDecision = async () => {
    if (!userId) {
      setAddSummaryStatus("Not signed in.");
      return;
    }
    if (!summaryText.trim()) return;
    if (addingSummary) return;

    setAddingSummary(true);
    setAddSummaryStatus("");
    try {
      const { error } = await supabase.from("decision_summaries").insert({
        user_id: userId,
        decision_id: decisionId,
        summary_text: summaryText.trim(),
      });

      if (error) {
        setAddSummaryStatus(`Couldn’t add summary: ${error.message}`);
        return;
      }

      setAddedSummary(true);
      setAddSummaryStatus("Added to decision.");
    } catch (e: any) {
      setAddSummaryStatus(e?.message ?? "Couldn’t add summary.");
    } finally {
      setAddingSummary(false);
    }
  };

  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900">Conversation</div>
            <div className="mt-0.5 text-xs text-zinc-500 truncate">Anchored to: {decisionTitle}</div>
          </div>

          <div className="flex items-center gap-2">
            <Chip onClick={onClose} title="Close conversation">
              Done
            </Chip>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-white">
          <div className="max-h-[320px] overflow-auto p-3 space-y-3">
            {loading ? <div className="text-sm text-zinc-600">Loading…</div> : null}

            {!loading && messages.length === 0 ? (
              <div className="text-sm text-zinc-600">Start anywhere. Keystone will keep this conversation with the decision.</div>
            ) : null}

            {messages.map((m, idx) => (
              <div key={idx} className="space-y-1">
                <div className="text-xs text-zinc-500">{m.role === "user" ? "You" : "Keystone"}</div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{m.content}</div>
              </div>
            ))}

            <div ref={endRef} />
          </div>

          <div className="border-t border-zinc-200 p-3 space-y-2">
            {status ? <div className="text-xs text-zinc-500">{status}</div> : null}

            <div className="relative">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Talk it through…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-12 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                onKeyDown={(e) => {
                  const isMac =
                    typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                  // Cmd/Ctrl + Enter sends
                  if (cmdOrCtrl && e.key === "Enter") {
                    e.preventDefault();
                    void send();
                    return;
                  }

                  // Enter sends (Shift+Enter makes newline)
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />

              {canSend ? (
                <button
                  type="button"
                  onClick={() => void send()}
                  className="absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                  aria-label="Send"
                  title="Send (Enter)"
                >
                  →
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Chip onClick={send} title={sending ? "Working…" : "Send"}>
                {sending ? "Thinking…" : "Send"}
              </Chip>

              <Chip onClick={summariseChat} title="Generate a preview summary (nothing is saved yet)">
                {summarising ? "Summarising…" : "Summarise chat"}
              </Chip>

              <div className="text-xs text-zinc-500">
                You can ask me to recommend, compare, simulate, optimise, or show reasoning — only if you want.
              </div>
            </div>

            {summaryStatus ? <div className="text-xs text-zinc-500">{summaryStatus}</div> : null}

            {summaryText ? (
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">Summary preview</div>
                    <div className="text-xs text-zinc-600">Nothing has been added to the decision yet.</div>
                  </div>

                  <Chip
                    onClick={() => {
                      setSummaryText("");
                      setSummaryStatus("");
                      setAddedSummary(false);
                      setAddSummaryStatus("");
                    }}
                    title="Dismiss preview"
                  >
                    Dismiss
                  </Chip>
                </div>

                <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{summaryText}</div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip onClick={addSummaryToDecision} title="Add this summary to the decision (explicit consent)">
                    {addingSummary ? "Adding…" : addedSummary ? "Added" : "Add summary to decision"}
                  </Chip>

                  {addSummaryStatus ? <div className="text-xs text-zinc-500">{addSummaryStatus}</div> : null}
                </div>

                <div className="pt-1 text-xs text-zinc-500">
                  This creates a durable summary entry for this decision. It can be used later for search and recall.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
