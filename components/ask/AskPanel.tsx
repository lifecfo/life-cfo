"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAsk } from "@/components/ask/AskProvider";
import { Button, Chip } from "@/components/ui";

type AskPanelMode = "overlay" | "split";

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
  return "Answer";
}

function scopeLabel(scope: string | null) {
  if (!scope) return "App context";
  if (scope === "money") return "Money context";
  if (scope === "accounts") return "Accounts context";
  if (scope === "transactions") return "Transactions context";
  if (scope === "connections") return "Connections context";
  if (scope === "decisions") return "Decisions context";
  if (scope === "family") return "Family context";
  if (scope === "household") return "Household context";
  if (scope === "settings") return "Settings context";
  if (scope === "home") return "Home context";
  return "App context";
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
    currentScope,
    shellSplitHostActive,
  } = useAsk();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);

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

  if (!effectiveOpen) return null;

  const panelContent = (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-500">{scopeLabel(currentScope)}.</div>
        </div>

        <div className="flex items-center gap-2">
          <Chip onClick={clearAsk}>Clear</Chip>
          <Chip onClick={closeAsk}>Close</Chip>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages.length > 0 ? (
            <div className="space-y-3">
              {messages.map((message) => {
                const isUser = message.role === "user";

                return (
                  <div
                    key={message.id}
                    className={[
                      "rounded-2xl border p-3",
                      isUser
                        ? "ml-8 border-zinc-200 bg-zinc-50"
                        : "mr-8 border-zinc-200 bg-white",
                    ].join(" ")}
                  >
                    <div className="mb-1 text-xs font-medium text-zinc-500">
                      {isUser ? "You" : toneLabel(message.tone, message.verdict)}
                    </div>

                    <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
                      {cleanAnswer(message.content)}
                    </div>

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
            <div className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="text-sm text-zinc-700">Ask things like:</div>
              <div className="mt-2 space-y-1 text-sm text-zinc-600">
                <div>• Are we okay this month?</div>
                <div>• What bills are coming up?</div>
                <div>• Where is our money leaking?</div>
                <div>• Can we afford this?</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-zinc-100 px-4 py-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="text-xs font-medium text-zinc-700">Question</div>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask anything about money, decisions, pressure points, or what to do next..."
            className="mt-2 min-h-[110px] w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
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

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-xs text-zinc-500">Answer-first. Save later.</div>
            <Button
              onClick={() => void submitAsk()}
              disabled={!draft.trim() || status === "loading"}
              className="rounded-2xl"
            >
              {status === "loading" ? "Thinking..." : "Get answer"}
            </Button>
          </div>
        </div>
      </div>
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

