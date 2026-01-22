// app/(app)/framing/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string | null;
};

function extractCaptureText(body: unknown, fallbackTitle: string) {
  if (body == null) return (fallbackTitle ?? "").trim();

  // If body is an object already (some clients may send JSON directly)
  if (typeof body === "object") {
    const anyBody = body as any;
    const t = typeof anyBody?.text === "string" ? anyBody.text : "";
    return (t || fallbackTitle || "").trim();
  }

  // If body is a string: could be plain text OR JSON stringified { text, ... }
  if (typeof body === "string") {
    const raw = body.trim();
    if (!raw) return (fallbackTitle ?? "").trim();

    // Only attempt JSON parse when it looks like JSON
    const looksJson = (raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"));
    if (!looksJson) return raw;

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const t = typeof (parsed as any)?.text === "string" ? String((parsed as any).text) : "";
        return (t || raw).trim();
      }
      return raw;
    } catch {
      return raw;
    }
  }

  return (fallbackTitle ?? "").trim();
}

export default function FramingPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [item, setItem] = useState<InboxItem | null>(null);

  const [decisionTitle, setDecisionTitle] = useState<string>("");
  const [decisionStatement, setDecisionStatement] = useState<string>("");

  const [working, setWorking] = useState<boolean>(false);

  const titleRef = useRef<HTMLInputElement | null>(null);

  // --- Auth + load next capture ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setItem(null);
        setStatusLine("Not signed in.");
        return;
      }

      setUserId(auth.user.id);

      const { data, error } = await supabase
        .from("decision_inbox")
        .select("id,user_id,type,title,body,status,created_at")
        .eq("user_id", auth.user.id)
        .eq("type", "capture")
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(1);

      if (!mounted) return;

      if (error) {
        setItem(null);
        setStatusLine(`Error: ${error.message}`);
        return;
      }

      const next = (data?.[0] ?? null) as InboxItem | null;
      setItem(next);

      if (!next) {
        setStatusLine("All framed.");
        return;
      }

      setStatusLine("Ready.");
      setDecisionTitle(next.title ?? "");
      setDecisionStatement(extractCaptureText(next.body, next.title ?? ""));

      window.setTimeout(() => titleRef.current?.focus(), 0);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const canSend = useMemo(() => {
    return !!userId && !!item && decisionTitle.trim().length > 0;
  }, [userId, item, decisionTitle]);

  const reloadNext = async () => {
    if (!userId) return;

    setStatusLine("Loading…");

    const { data, error } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at")
      .eq("user_id", userId)
      .eq("type", "capture")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      setItem(null);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const next = (data?.[0] ?? null) as InboxItem | null;
    setItem(next);

    if (!next) {
      setDecisionTitle("");
      setDecisionStatement("");
      setStatusLine("All framed.");
      return;
    }

    setDecisionTitle(next.title ?? "");
    setDecisionStatement(extractCaptureText(next.body, next.title ?? ""));
    setStatusLine("Ready.");
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const sendToThinking = async () => {
    if (!canSend || working || !userId || !item) return;

    setWorking(true);
    setStatusLine("");

    const title = decisionTitle.trim();
    const statement = decisionStatement.trim();

    try {
      // 1) Create draft decision
      const { data: created, error: createErr } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          title,
          context: statement || null,
          status: "draft",
          origin: "framing",
          framed_at: new Date().toISOString(),
          // If your schema includes inbox_item_id, uncomment:
          // inbox_item_id: item.id,
        })
        .select("id")
        .single();

      if (createErr) throw createErr;

      const decisionId = created?.id as string | undefined;

      // 2) Close the capture item (so it doesn’t keep showing up)
      const { error: closeErr } = await supabase
        .from("decision_inbox")
        .update({ status: "closed" })
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("status", "open");

      // One toast only
      if (closeErr) {
        showToast({ message: `Sent to Thinking, but couldn’t close capture: ${closeErr.message}` }, 4500);
      } else {
        showToast(
          {
            message: "Sent to Thinking.",
            undoLabel: "Open",
            onUndo: () => {
              if (decisionId) router.push(`/thinking?open=${decisionId}`);
            },
          },
          7000
        );
      }

      // 3) Load next
      await reloadNext();
    } catch (e: any) {
      showToast({ message: e?.message ? String(e.message) : "Couldn’t send to Thinking." }, 4000);
    } finally {
      setWorking(false);
    }
  };

  const notADecision = async () => {
    if (!userId || !item || working) return;

    setWorking(true);
    try {
      const { error } = await supabase
        .from("decision_inbox")
        .update({ status: "closed" })
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("status", "open");

      if (error) throw error;

      showToast({ message: "Okay — put aside." }, 2200);
      await reloadNext();
    } catch (e: any) {
      showToast({ message: e?.message ? String(e.message) : "Couldn’t update." }, 3500);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page
      title="Framing"
      subtitle="Turn raw capture into a clear draft — only if it’s truly a decision."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          <Chip onClick={() => router.push("/thinking")}>Go to Thinking</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {!item ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing to frame.</div>
                <div className="text-sm text-zinc-600">Capture will show up here when it needs shaping.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-700">Captured</div>
                  <div className="text-sm text-zinc-900">{item.title}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Decision title</div>
                  <input
                    ref={titleRef}
                    value={decisionTitle}
                    onChange={(e) => setDecisionTitle(e.target.value)}
                    className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    placeholder="A short, clear title"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Decision statement (optional)</div>
                  <textarea
                    value={decisionStatement}
                    onChange={(e) => setDecisionStatement(e.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    placeholder="What are you deciding, exactly?"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip onClick={sendToThinking} title="Create a draft in Thinking">
                    {working ? "Working…" : "Send to Thinking"}
                  </Chip>

                  <Chip onClick={notADecision} title="Close as not-a-decision">
                    Not a decision
                  </Chip>

                  <Chip onClick={() => router.push("/home")} title="Return to Home">
                    Put this down
                  </Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}
