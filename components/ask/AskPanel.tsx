"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAsk } from "@/components/ask/AskProvider";
import { Chip } from "@/components/ui";
import type { DecisionCandidate } from "@/lib/memory/contracts";

type AskPanelMode = "overlay" | "split";
const MONEY_SMART_INSIGHT_PREVIEW_KEY = "lifecfo:money-smart-insight-preview";
type MoneyInsightPreview = {
  headline: string;
  supporting?: string;
};

function readMoneyInsightPreview(): MoneyInsightPreview | null {
  try {
    const value = window.sessionStorage.getItem(MONEY_SMART_INSIGHT_PREVIEW_KEY);
    if (!value || !value.trim()) return null;

    try {
      const parsed = JSON.parse(value) as MoneyInsightPreview;
      const headline = String(parsed?.headline || "").trim();
      const supporting = String(parsed?.supporting || "").trim();
      return headline ? { headline, supporting: supporting || undefined } : null;
    } catch {
      return { headline: value.trim() };
    }
  } catch {
    return null;
  }
}

function cleanAnswer(raw: string) {
  let t = (raw || "").trim();
  if (!t) return "";
  t = t.replace(/\r\n/g, "\n");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/^\s*-\s+/gm, "• ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function toneLabel(tone?: string | null, verdict?: string | null) {
  if (verdict === "NEEDS_ATTENTION") return "Needs attention";
  if (tone === "attention") return "Needs attention";
  if (tone === "tight") return "A bit tight";
  return "Life CFO";
}

function friendlyScopeLabel(scope: string | null) {
  if (!scope) return "Home";
  if (scope === "money") return "Money";
  if (scope === "accounts") return "Money -> Accounts";
  if (scope === "transactions") return "Money -> Transactions";
  if (scope === "connections") return "Money -> Connections";
  if (scope === "decisions") return "Decisions";
  if (scope === "family") return "Family";
  if (scope === "household") return "Household";
  if (scope === "settings") return "Settings";
  if (scope === "home") return "Home";
  return "Home";
}

function routeLabel(pathname: string | null, scope: string | null) {
  const path = pathname || "";

  if (path === "/lifecfo-home" || path === "/home") return "Home";
  if (path === "/money") return "Money";
  if (path === "/money/in" || path.startsWith("/money/in/")) return "Money -> In";
  if (path === "/money/out" || path.startsWith("/money/out/")) return "Money -> Out";
  if (path === "/money/saved" || path.startsWith("/money/saved/")) return "Money -> Saved";
  if (path === "/money/planned" || path.startsWith("/money/planned/")) return "Money -> Planned";
  if (path === "/money/goals" || path.startsWith("/money/goals/")) return "Money -> Goals";
  if (path === "/accounts" || path.startsWith("/accounts/")) return "Money -> Accounts";
  if (path === "/transactions" || path.startsWith("/transactions/")) return "Money -> Transactions";
  if (path === "/connections" || path.startsWith("/connections/")) return "Money -> Connections";
  if (path === "/decisions" || path.startsWith("/decisions/")) return "Decisions";
  if (path === "/family" || path.startsWith("/family/")) return "Family";
  if (path === "/household" || path.startsWith("/household/")) return "Household";
  if (path === "/settings" || path.startsWith("/settings/")) return "Settings";

  return friendlyScopeLabel(scope);
}

export function AskPanel({ mode = "overlay" }: { mode?: AskPanelMode }) {
  const router = useRouter();
  const {
    open,
    closeAsk,
    draft,
    setDraft,
    status,
    messages,
    errorMessage,
    submitAsk,
    retryLast,
    clearAsk,
    promoteCandidate,
    currentScope,
    currentPath,
    shellSplitHostActive,
  } = useAsk();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [examplesExpanded, setExamplesExpanded] = useState(mode === "split");

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const splitHandledByShellDesktop = mode === "overlay" && shellSplitHostActive && isDesktop;
  const effectiveOpen = open && !splitHandledByShellDesktop;

  useEffect(() => {
    if (!effectiveOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [effectiveOpen]);

  useEffect(() => {
    if (!effectiveOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAsk();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveOpen, closeAsk]);

  useEffect(() => {
    if (!effectiveOpen) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status, effectiveOpen]);

  const moneyInsightPreview = useMemo(() => {
    if (!effectiveOpen || currentScope !== "money") return null;
    return readMoneyInsightPreview();
  }, [effectiveOpen, currentScope]);

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const title = useMemo(() => {
    if (status === "loading") return "Thinking...";
    if (status === "error") return "Ask Life CFO";
    if (latestAssistant) return toneLabel(latestAssistant.tone, latestAssistant.verdict);
    return "Ask Life CFO";
  }, [status, latestAssistant]);
  const currentViewLabel = useMemo(
    () => routeLabel(currentPath, currentScope),
    [currentPath, currentScope]
  );
  const hasScrollableContentAboveInput =
    messages.length > 0 ||
    status === "loading" ||
    status === "error" ||
    mode === "split" ||
    examplesExpanded;
  const isMoneyContext = currentScope === "money";

  if (!effectiveOpen) return null;

  const panelContent = (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-500">{currentViewLabel}</div>
        </div>

        <div className="flex items-center gap-2">
          <Chip onClick={clearAsk}>Clear</Chip>
          <Chip onClick={closeAsk}>Close</Chip>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={
          hasScrollableContentAboveInput
            ? "min-h-0 flex-1 overflow-y-auto px-4 py-4"
            : "px-4 py-0"
        }
      >
        <div className="space-y-4">
          {messages.length > 0 ? (
            <div className="space-y-4">
              {messages.map((message) => {
                const isUser = message.role === "user";
                const isLatestAssistant =
                  !isUser && latestAssistant?.id && latestAssistant.id === message.id;
                const decisionCandidates = (message.candidates?.decision_candidates || []) as DecisionCandidate[];

                return (
                  <div
                    key={message.id}
                    className={[
                      "ask-bubble rounded-2xl border p-3",
                      isUser
                        ? "ml-8 max-w-[75%] border-zinc-200 bg-zinc-50"
                        : "mr-8 border-zinc-200 bg-white",
                    ].join(" ")}
                  >
                    <div className="mb-1 text-xs font-medium text-zinc-500">
                      {isUser ? "You" : toneLabel(message.tone, message.verdict)}
                    </div>

                    <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
                      {cleanAnswer(message.content)}
                    </div>
                    {isLatestAssistant && status !== "loading" ? (
                      <div className="mt-2 text-xs text-zinc-400">
                        If this gives you what you need, you can stop here.
                      </div>
                    ) : null}

                    {!isUser && message.actionHref ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Chip onClick={() => router.push(message.actionHref!)}>Open relevant page</Chip>
                        <Chip
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(message.content || "");
                            } catch {}
                          }}
                        >
                          Copy
                        </Chip>
                      </div>
                    ) : null}

                    {!isUser && decisionCandidates.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {decisionCandidates.map((candidate) => {
                          const state = message.promotions?.[candidate.id];
                          const isSaving = state?.status === "saving";
                          const isSaved = state?.status === "saved";
                          const hasError = state?.status === "error";

                          return (
                            <div
                              key={candidate.id}
                              className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
                            >
                              <div className="text-xs text-zinc-600">{candidate.title}</div>
                              <div className="mt-2 flex items-center gap-2">
                                <Chip
                                  onClick={() => {
                                    if (isSaved || isSaving) return;
                                    void promoteCandidate({
                                      messageId: message.id,
                                      candidate,
                                    });
                                  }}
                                >
                                  {isSaved ? "Saved to Decisions" : isSaving ? "Saving..." : "Save to Decisions"}
                                </Chip>
                                {hasError ? (
                                  <span className="text-xs text-rose-700">
                                    {state?.error || "Could not save this yet."}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-sm text-zinc-700">Thinking...</div>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <div className="text-sm font-medium text-rose-900">Could not answer</div>
              <div className="mt-1 text-sm text-rose-800">
                {errorMessage || "Something went wrong."}
              </div>
              <div className="mt-3 flex gap-2">
                <Chip onClick={() => void retryLast()}>Try again</Chip>
              </div>
            </div>
          ) : null}

          {messages.length === 0 && status !== "loading" && status !== "error" ? (
            isMoneyContext ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                {moneyInsightPreview ? (
                  <div
                    className="mb-2 text-xs leading-relaxed text-zinc-400"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {[moneyInsightPreview.headline, moneyInsightPreview.supporting]
                      .filter(Boolean)
                      .join(" ")}
                  </div>
                ) : null}
                <div className="text-xs text-zinc-500">
                  Ask about what&apos;s happening, what changed, or what matters next.
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    "Why does money feel tight?",
                    "What changed recently?",
                    "Are we okay this month?",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void submitAsk(prompt)}
                      className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-700"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
            mode === "split" ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-zinc-700">Ask things like</div>
                  <button
                    type="button"
                    onClick={() => setExamplesExpanded((v) => !v)}
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    {examplesExpanded ? "Hide" : "Show"}
                  </button>
                </div>
                {examplesExpanded ? (
                  <div className="mt-2 space-y-1 text-sm text-zinc-600">
                    <div>• Are we okay this month?</div>
                    <div>• What bills are coming up?</div>
                    <div>• Where is our money leaking?</div>
                    <div>• Can we afford this?</div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-zinc-500">
                    Keep this closed for a cleaner view, or open examples for ideas.
                  </div>
                )}
              </div>
            ) : examplesExpanded ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm text-zinc-700">Ask things like</div>
                  <button
                    type="button"
                    onClick={() => setExamplesExpanded(false)}
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    Hide
                  </button>
                </div>
                <div className="space-y-1 text-sm text-zinc-600">
                  <div>• Are we okay this month?</div>
                  <div>• What bills are coming up?</div>
                  <div>• Where is our money leaking?</div>
                  <div>• Can we afford this?</div>
                </div>
              </div>
            ) : null
            )
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-100 px-4 py-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          {mode === "overlay" && messages.length === 0 && !examplesExpanded && !isMoneyContext ? (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setExamplesExpanded(true)}
                className="text-xs text-zinc-500 hover:text-zinc-700"
              >
                Need ideas? Show examples
              </button>
            </div>
          ) : null}

          <div className="relative">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask a follow-up if you want more detail..."
            className="min-h-[90px] w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 pr-14 text-[14px] leading-relaxed text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
            onKeyDown={(e) => {
              const isMac =
                typeof navigator !== "undefined" &&
                /Mac|iPhone|iPad|iPod/.test(navigator.platform);
              const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

              if (cmdOrCtrl && e.key === "Enter") {
                e.preventDefault();
                void submitAsk();
                return;
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submitAsk();
              }
            }}
          />
            <button
              type="button"
              onClick={() => void submitAsk()}
              disabled={!draft.trim() || status === "loading"}
              className={[
                "absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full border transition",
                !draft.trim() || status === "loading"
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
              ].join(" ")}
              aria-label={status === "loading" ? "Thinking..." : "Send question"}
              title={status === "loading" ? "Thinking..." : "Send"}
            >
              {status === "loading" ? (
                <span className="text-[11px]">...</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                  <path
                    d="M4 12h14M12 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        .ask-bubble {
          animation: askBubbleFadeIn 180ms ease-out;
        }

        @keyframes askBubbleFadeIn {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  if (mode === "split") {
    return (
      <aside className="hidden h-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm md:flex">
        {panelContent}
      </aside>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20 md:hidden" onClick={closeAsk} />

      <div className="fixed inset-x-0 bottom-0 z-[80] max-h-[88vh] rounded-t-3xl border border-zinc-200 bg-white shadow-2xl md:hidden">
        {panelContent}
      </div>
    </>
  );
}

