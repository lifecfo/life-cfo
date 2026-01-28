// components/FeedbackPrompt.tsx
"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type Props = {
  pageTitle?: string;
};

export function FeedbackPrompt({ pageTitle }: Props) {
  const { toast } = useToast();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const canSend = useMemo(() => text.trim().length >= 3 && !sending, [text, sending]);

  const send = async () => {
    if (!canSend) return;

    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        toast({ title: "Not signed in", description: "Please sign in first." });
        return;
      }

      const payload = {
        user_id: user.id,
        page_path: pathname ?? null,
        message: text.trim(),
        metadata: {
          pageTitle: pageTitle ?? null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      };

      const { error } = await supabase.from("feedback").insert(payload);
      if (error) throw error;

      setText("");
      setOpen(false);

      toast({ title: "Thank you", description: "Feedback sent." });
    } catch (e: any) {
      toast({ title: "Couldn’t send feedback", description: e?.message ?? "Please try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pt-6">
      {!open ? (
        <div className="flex justify-end">
          <Chip
            onClick={() => setOpen(true)}
            title="Optional: send feedback for this page"
            className="border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            Feedback
          </Chip>
        </div>
      ) : (
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Feedback</div>
                <div className="text-xs text-zinc-500">Optional. One note is enough.</div>
              </div>

              <div className="flex items-center gap-2">
                <Chip onClick={() => setOpen(false)} title="Close">
                  Close
                </Chip>
              </div>
            </div>

            <textarea
              className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What felt confusing, heavy, missing, or delightful?"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-zinc-500">{pathname}</div>
              <Chip
                onClick={() => void send()}
                title={canSend ? "Send feedback" : "Write a little more"}
                className={!canSend ? "opacity-50 pointer-events-none" : ""}
              >
                {sending ? "Sending…" : "Send"}
              </Chip>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
