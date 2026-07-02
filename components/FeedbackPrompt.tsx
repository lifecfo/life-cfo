// components/FeedbackPrompt.tsx
"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabaseClient";
import { Button, Chip } from "@/components/ui";

type Props = {
  className?: string;
  pageTitle?: string; // ✅ allow Page.tsx to pass this
};

type FeedbackState = "idle" | "detail" | "sending" | "sent" | "error";

export default function FeedbackPrompt({ className, pageTitle }: Props) {
  const pathname = usePathname();
  const [state, setState] = useState<FeedbackState>("idle");
  const [detail, setDetail] = useState("");

  async function saveFeedback(message: string) {
    setState("sending");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user?.id) {
        setState("error");
        return;
      }

      const { error } = await supabase.from("feedback").insert({
        user_id: user.id,
        path: pathname || pageTitle || "unknown",
        message,
      });

      if (error) {
        setState("error");
        return;
      }

      setDetail("");
      setState("sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className={cn("text-sm text-zinc-600", className)} role="status">
        Thanks. That helps us improve Life CFO.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-700">Did this page feel clear and grounded?</div>
        <div className="flex items-center gap-2">
          <Chip title="Yes" disabled={state === "sending"} onClick={() => void saveFeedback("Yes")}>
            Yes
          </Chip>
          <Chip title="Not quite" disabled={state === "sending"} onClick={() => setState("detail")}>
            Not quite
          </Chip>
        </div>
      </div>

      {state === "detail" || state === "sending" || state === "error" ? (
        <div className="max-w-xl space-y-2">
          <label htmlFor="page-feedback-detail" className="text-sm text-zinc-700">
            What could be clearer? (optional)
          </label>
          <textarea
            id="page-feedback-detail"
            value={detail}
            maxLength={500}
            onChange={(event) => setDetail(event.target.value)}
            placeholder="Please do not include private financial details."
            className="min-h-24 w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            disabled={state === "sending"}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="rounded-2xl"
              disabled={state === "sending"}
              onClick={() => void saveFeedback(detail.trim() ? `Not quite: ${detail.trim()}` : "Not quite")}
            >
              {state === "sending" ? "Sending..." : "Send feedback"}
            </Button>
            <Chip
              title="Cancel"
              disabled={state === "sending"}
              onClick={() => {
                setDetail("");
                setState("idle");
              }}
            >
              Cancel
            </Chip>
            {state === "error" ? (
              <span className="text-sm text-zinc-600" role="alert">
                We couldn&apos;t save that yet. Please try again.
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

