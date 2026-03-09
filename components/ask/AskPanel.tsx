"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAsk } from "@/components/ask/AskProvider";
import { Button, Chip } from "@/components/ui";

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

export function AskPanel() {
  const router = useRouter();
  const {
    open,
    closeAsk,
    draft,
    setDraft,
    status,
    result,
    errorMessage,
    submitAsk,
    retryLast,
    clearAsk,
  } = useAsk();

  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAsk();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAsk]);

  const title = useMemo(() => {
    if (status === "loading") return "Thinking…";
    if (status === "error") return "Ask Life CFO";
    if (result) return toneLabel(result.tone, result.verdict);
    return "Ask Life CFO";
  }, [status, result]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/20" onClick={closeAsk} />

      <div className="fixed inset-x-0 bottom-0 z-[80] max-h-[88vh] rounded-t-3xl border border-zinc-200 bg-white shadow-2xl md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[420px] md:rounded-none md:rounded-l-3xl">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">{title}</div>
              <div className="text-xs text-zinc-500">Available anywhere in the app.</div>
            </div>

            <div className="flex items-center gap-2">
              <Chip onClick={clearAsk}>Clear</Chip>
              <Chip onClick={closeAsk}>Close</Chip>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-medium text-zinc-700">Question</div>
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask anything about money, decisions, pressure points, or what to do next…"
                  className="mt-2 min-h-[120px] w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                  onKeyDown={(e) => {
                    const isMac =
                      typeof navigator !== "undefined" &&
                      /Mac|iPhone|iPad|iPod/.test(navigator.platform);
                    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

                    if (cmdOrCtrl && e.key === "Enter") {
                      e.preventDefault();
                      void submitAsk();
                    }
                  }}
                />

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-500">Answer-first. Save later.</div>
                  <Button onClick={() => void submitAsk()} disabled={!draft.trim() || status === "loading"} className="rounded-2xl">
                    {status === "loading" ? "Thinking…" : "Get answer"}
                  </Button>
                </div>
              </div>

              {status === "error" ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
                  <div className="text-sm font-medium text-rose-900">Couldn’t answer</div>
                  <div className="mt-1 text-sm text-rose-800">{errorMessage || "Something went wrong."}</div>
                  <div className="mt-3 flex gap-2">
                    <Chip onClick={() => void retryLast()}>Try again</Chip>
                  </div>
                </div>
              ) : null}

              {result ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-medium text-zinc-700">Latest answer</div>
                  <div className="mt-2 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-600">Question:</span> {result.question}
                  </div>

                  <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-800">
                    {cleanAnswer(result.answer)}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.actionHref ? (
                      <Chip
                        onClick={() => {
                          router.push(result.actionHref!);
                        }}
                      >
                        Open relevant page
                      </Chip>
                    ) : null}

                    <Chip
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(result.answer || "");
                        } catch {}
                      }}
                    >
                      Copy
                    </Chip>
                  </div>
                </div>
              ) : null}

              {!result && status !== "loading" && status !== "error" ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-sm text-zinc-700">
                    Ask things like:
                  </div>
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
        </div>
      </div>
    </>
  );
}