// app/(app)/thinking/ConversationPanel.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip } from "@/components/ui";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

type Msg = { role: "user" | "assistant"; content: string; at: string };

type Frame = {
  decision_statement?: string;
};

function isQuotaError(status: number, errorMsg: string) {
  const msg = (errorMsg || "").toLowerCase();
  return status === 429 || msg.includes("exceeded your current quota") || msg.includes("insufficient_quota");
}

function MarkdownBubble({ content }: { content: string }) {
  return (
    <div
      className={[
        // Typography + sizing similar to ChatGPT
        "prose max-w-none",
        "prose-sm sm:prose-base",
        "text-zinc-800",
        // Headings
        "prose-headings:text-zinc-900 prose-headings:font-semibold",
        "prose-h1:text-lg prose-h2:text-base prose-h3:text-base",
        // Spacing (key for “ChatGPT feel”)
        "prose-p:my-3 prose-ul:my-3 prose-ol:my-3",
        "prose-li:my-1 prose-hr:my-4",
        // Emphasis + inline code
        "prose-strong:text-zinc-900",
        "prose-code:text-zinc-900 prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
        // Code blocks
        "prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200 prose-pre:rounded-xl prose-pre:p-3",
        // Links
        "prose-a:underline prose-a:underline-offset-2",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          code({ children, className }) {
            // Keep block code as-is (react-markdown wraps it in <pre><code>)
            const isBlock = (className || "").includes("language-");
            if (isBlock) return <code className={className}>{children}</code>;
            return <code className="rounded bg-zinc-100 px-1 py-0.5">{children}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function ConversationPanel(props: {
  decisionId: string;
  decisionTitle: string;
  frame?: Frame | null;
  onClose: () => void;
  onSummarySaved?: () => void;

  autoFocusToken?: number;
  askedText?: string;
  autoStartToken?: number;

  initialUserMessage?: string;
  initialUserMessageToken?: number;
  onInitialUserMessageConsumed?: () => void;
}) {
  const {
    decisionId,
    decisionTitle,
    frame,
    onClose,
    onSummarySaved,
    askedText,
    autoStartToken,
    initialUserMessage,
    initialUserMessageToken,
    onInitialUserMessageConsumed,
  } = props;

  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [sending, setSending] = useState<boolean>(false);
  const [summarising, setSummarising] = useState<boolean>(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<string>("");

  const [bootMessage, setBootMessage] = useState<string>("");

  const [summaryText, setSummaryText] = useState<string>("");
  const [summaryStatus, setSummaryStatus] = useState<string>("");

  const [addingSummary, setAddingSummary] = useState<boolean>(false);
  const [addedSummary, setAddedSummary] = useState<boolean>(false);
  const [addSummaryStatus, setAddSummaryStatus] = useState<string>("");

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const decisionStatement = useMemo(() => frame?.decision_statement ?? "", [frame]);
  const canSend = draft.trim().length > 0 && !sending;

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

  useEffect(() => {
    if (!autoStartToken) return;

    const asked = (askedText || decisionStatement || decisionTitle || "").trim();
    const line1 = asked ? `Okay — let’s work through this: “${asked}”.` : "Okay — let’s work through this.";
    const line2 = "I’ll clarify what matters, check constraints, then lay out options + trade-offs.";

    setBootMessage(`${line1}\n\n${line2}`);
  }, [autoStartToken, askedText, decisionStatement, decisionTitle]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        (inputRef.current as any)?.focus?.({ preventScroll: true });
      } catch {
        inputRef.current?.focus();
      }
    }, 0);

    return () => window.clearTimeout(t);
  }, [decisionId, props.autoFocusToken]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, bootMessage, summaryText]);

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

  const sendText = async (textRaw: string) => {
    const text = (textRaw ?? "").trim();
    if (!text) return;
    if (sending) return;

    setSending(true);

    const now = new Date().toISOString();
    const next: Msg[] = [...messages, { role: "user" as const, content: text, at: now }];

    setDraft("");
    setMessages(next);
    setStatus("");
    void persist(next);

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

      const after: Msg[] = [...next, { role: "assistant" as const, content: assistantText, at: new Date().toISOString() }];
      setMessages(after);
      setStatus("");
      void persist(after);
    } catch (e: any) {
      setStatus(e?.message ?? "AI request failed.");
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    await sendText(text);
  };

  useEffect(() => {
    const injected = (initialUserMessage ?? "").trim();
    if (!injected) return;
    if (!initialUserMessageToken) return;

    void (async () => {
      await sendText(injected);
      onInitialUserMessageConsumed?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserMessageToken]);

  const summariseChat = async () => {
    if (summarising) return;

    if (messages.length === 0) {
      setSummaryText("");
      setSummaryStatus("Nothing to capture yet.");
      return;
    }

    setSummarising(true);
    setSummaryText("");
    setSummaryStatus("Capturing…");
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
        setSummaryStatus("No capture returned.");
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
      setAddSummaryStatus("Saved.");
      onSummarySaved?.();
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
            {askedText ? (
              <div className="mt-1 text-xs text-zinc-600">
                <span className="font-medium text-zinc-700">You asked:</span> {askedText}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Chip onClick={onClose} title="Close conversation">
              Done
            </Chip>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50">
          <div className="max-h-[420px] overflow-auto p-3">
            {loading ? <div className="text-sm text-zinc-600">Loading…</div> : null}

            {!loading && messages.length === 0 ? (
              <div className="py-2">
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
                    {bootMessage || "Okay — let’s think this through."}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";

                // Make assistant bubble wider than user bubble
                const bubbleWidth = isUser ? "max-w-[72%]" : "max-w-[88%]";

                return (
                  <div key={idx} className={isUser ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={[
                        bubbleWidth,
                        "rounded-2xl px-4 py-3",
                        isUser
                          ? "bg-zinc-200/70 text-zinc-900 border border-zinc-200 text-sm leading-relaxed"
                          : "bg-white text-zinc-800 border border-zinc-200",
                      ].join(" ")}
                    >
                      {isUser ? <div className="whitespace-pre-wrap">{m.content}</div> : <MarkdownBubble content={m.content} />}
                    </div>
                  </div>
                );
              })}
            </div>

            {summaryText ? (
              <div className="mt-4 space-y-2">
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                    <div className="text-xs text-zinc-500 mb-2">Capture preview</div>
                    <MarkdownBubble content={summaryText} />

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Chip onClick={addSummaryToDecision} title="Save this summary to the decision (explicit consent)">
                        {addingSummary ? "Saving…" : addedSummary ? "Saved" : "Save to decision"}
                      </Chip>
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
                      {addSummaryStatus ? <div className="text-xs text-zinc-500">{addSummaryStatus}</div> : null}
                    </div>

                    <div className="mt-2 text-xs text-zinc-500">Nothing commits until you choose to save.</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          <div className="border-t border-zinc-200 bg-white p-3 space-y-2 rounded-b-xl">
            {status ? <div className="text-xs text-zinc-500">{status}</div> : null}
            {summaryStatus ? <div className="text-xs text-zinc-500">{summaryStatus}</div> : null}

            <div className="relative">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Talk it through…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-12 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                onKeyDown={(e) => {
                  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                  const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                  if (cmdOrCtrl && e.key === "Enter") {
                    e.preventDefault();
                    void send();
                    return;
                  }

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

              <Chip onClick={summariseChat} title="Generate a capture preview (nothing commits yet)">
                {summarising ? "Capturing…" : "Capture preview"}
              </Chip>

              <div className="text-xs text-zinc-500">Enter to send • Shift+Enter for newline</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
