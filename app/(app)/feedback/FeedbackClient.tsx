"use client";

import { useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Button } from "@/components/ui";

export default function FeedbackClient({ originPath }: { originPath: string }) {
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const msg = text.trim();
    if (!msg) return;

    setWorking(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, path: originPath }),
      });
      if (!response.ok) return;

      setText("");
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page title="Feedback" subtitle="Private notes to help improve Life CFO. No replies, no tracking.">
      <div className="mx-auto w-full max-w-[640px] space-y-4">
        <Card>
          <CardContent className="space-y-3">
            <div className="text-sm text-zinc-700">
              Tell us anything that felt confusing, heavy, unnecessary — or unexpectedly helpful.
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type freely…"
              className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            />

            <div className="flex items-center gap-3">
              <Button onClick={submit} disabled={working || !text.trim()}>
                {working ? "Sending…" : "Send feedback"}
              </Button>

              {done ? <div className="text-sm text-zinc-600">Thanks — saved.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
