"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Chip } from "@/components/ui";

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
        "prose prose-sm max-w-none",
        "text-zinc-800",
        "prose-headings:text-zinc-900 prose-headings:font-semibold",
        "prose-h1:text-base prose-h2:text-base prose-h3:text-sm",
        "prose-p:my-2.5 prose-ul:my-2.5 prose-ol:my-2.5",
        "prose-li:my-1 prose-hr:my-4",
        "prose-strong:text-zinc-900",
        "prose-code:text-zinc-900 prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
        "prose-pre:bg-zinc-50 prose-pre:rounded-xl prose-pre:p-3",
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
  const [savingSummary, setSavingSummary] = useState<boolean>(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState<string>("");

  const [bootMessage, setBootMessage] = useState<string>("");

  const [savedSummaryText, setSavedSummaryText] = useState<string>("");
  const [summaryStatus, setSummaryStatus] = useState<string>("");

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
        .eq("user_id", auth.user.id)
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
  }, [messages.length, bootMessage, savedSummaryText]);

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

    setSavedSummaryText("");
    setSummaryStatus("");

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

  // ✅ Single action: summarise + save to decision
  const saveChatSummary = async () => {
    if (savingSummary) return;

    if (messages.length === 0) {
      setSavedSummaryText("");
      setSummaryStatus("Nothing to summarise yet.");
      return;
    }
    if (!userId) {
      setSavedSummaryText("");
      setSummaryStatus("Not signed in.");
      return;
    }

    setSavingSummary(true);
    setSavedSummaryText("");
    setSummaryStatus("Saving summary…");

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

      const { error } = await supabase.from("decision_summaries").insert({
        user_id: userId,
        decision_id: decisionId,
        summary_text: text,
      });

      if (error) {
        setSummaryStatus(`Couldn’t save summary: ${error.message}`);
        return;
      }

      setSavedSummaryText(text);
      setSummaryStatus("Saved to this decision.");
      onSummarySaved?.();
    } catch (e: any) {
      setSummaryStatus(e?.message ?? "Summary failed.");
    } finally {
      setSavingSummary(false);
    }
  };

  const widthUser = "max-w-[68%]";
  const widthAsst = "max-w-[80%]";

  return (
    <div className="w-full">
      {/* Minimal header */}
      <div className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">Conversation</div>
          {askedText ? (
            <div className="mt-1 text-xs text-zinc-600 truncate">
              <span className="font-medium text-zinc-700">Decision:</span> {askedText}
            </div>
          ) : null}
        </div>

        <div className="shrink-0">
          <Chip onClick={onClose} title="Close conversation">
            Done
          </Chip>
        </div>
      </div>

      {/* Messages */}
      <div className="mt-3 max-h-[560px] overflow-auto px-2 py-3 sm:px-4">
        {loading ? <div className="px-2 text-sm text-zinc-600">Loading…</div> : null}

        {!loading && messages.length === 0 ? (
          <div className="py-2">
            <div className="flex justify-start">
              <div className={[widthAsst, "rounded-3xl bg-zinc-50 px-5 py-3.5 text-sm leading-relaxed text-zinc-800"].join(" ")}>
                <div className="whitespace-pre-wrap">{bootMessage || "Okay — let’s think this through."}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-5">
          {messages.map((m, idx) => {
            const isUser = m.role === "user";

            const bubbleClass = isUser
              ? [widthUser, "rounded-3xl bg-zinc-100 px-5 py-3.5 text-sm leading-relaxed text-zinc-900"].join(" ")
              : [widthAsst, "rounded-3xl bg-white px-5 py-3.5 text-sm leading-relaxed text-zinc-800 border border-zinc-100"].join(" ");

            return (
              <div key={idx} className={isUser ? "flex justify-end" : "flex justify-start"}>
                <div className={bubbleClass}>
                  {isUser ? <div className="whitespace-pre-wrap">{m.content}</div> : <MarkdownBubble content={m.content} />}
                </div>
              </div>
            );
          })}
        </div>

        {savedSummaryText ? (
          <div className="mt-6">
            <div className="flex justify-start">
              <div className={[widthAsst, "rounded-3xl bg-zinc-50 px-5 py-4"].join(" ")}>
                <div className="mb-2 text-xs text-zinc-500">Saved chat summary</div>
                <MarkdownBubble content={savedSummaryText} />
                <div className="mt-2 text-xs text-zinc-500">You can edit this later in the decision view.</div>
              </div>
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="px-2 pb-3 sm:px-4">
        {status ? <div className="mb-2 px-2 text-xs text-zinc-500">{status}</div> : null}
        {summaryStatus ? <div className="mb-2 px-2 text-xs text-zinc-500">{summaryStatus}</div> : null}

        <div className="rounded-2xl bg-white">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Write back…"
              className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-12 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
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
                className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                aria-label="Send"
                title="Send"
              >
                →
              </button>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip onClick={saveChatSummary} title="Summarise this chat and save it to the decision">
              {savingSummary ? "Saving summary…" : "Save chat summary"}
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}
