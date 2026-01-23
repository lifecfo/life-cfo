// app/(app)/framing/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type AttachmentMeta = {
  name: string;
  path: string; // storage path inside bucket
  type: string;
  size: number;
};

type CaptureBody =
  | string
  | {
      text?: string;
      attachments?: AttachmentMeta[];
    };

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string | null;
};

function safeTitleFromText(text: string) {
  const firstLine =
    (text || "")
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  const t = firstLine.slice(0, 80);
  return t || "Captured";
}

function tryParseCaptureBody(raw: string | null): { text: string; attachments: AttachmentMeta[] } {
  if (!raw) return { text: "", attachments: [] };

  const trimmed = raw.trim();
  if (!trimmed) return { text: "", attachments: [] };

  // If it looks like JSON, try parse
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as CaptureBody;
      if (parsed && typeof parsed === "object") {
        const text = typeof (parsed as any).text === "string" ? String((parsed as any).text) : "";
        const attsRaw = (parsed as any).attachments;
        const attachments: AttachmentMeta[] = Array.isArray(attsRaw)
          ? attsRaw
              .filter((a) => a && typeof a.path === "string")
              .map((a) => ({
                name: typeof a.name === "string" ? a.name : "Attachment",
                path: String(a.path),
                type: typeof a.type === "string" ? a.type : "application/octet-stream",
                size: typeof a.size === "number" ? a.size : 0,
              }))
          : [];
        return { text, attachments };
      }
    } catch {
      // fall through to plain text
    }
  }

  // Plain text fallback
  return { text: trimmed, attachments: [] };
}

function kb(n: number) {
  const v = Math.max(1, Math.round((n || 0) / 1024));
  return `${v} KB`;
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

  // attachment open cache (signed urls)
  const [signed, setSigned] = useState<Record<string, string>>({});
  const signingRef = useRef<Record<string, boolean>>({});

  const parsed = useMemo(() => {
    if (!item) return { text: "", attachments: [] as AttachmentMeta[] };
    return tryParseCaptureBody(item.body);
  }, [item?.id, item?.body]);

  const ensureSignedUrl = async (path: string) => {
    if (!path) return null;
    if (signed[path]) return signed[path];
    if (signingRef.current[path]) return null;

    signingRef.current[path] = true;
    try {
      const { data, error } = await supabase.storage.from("captures").createSignedUrl(path, 60 * 10);
      if (error || !data?.signedUrl) return null;

      setSigned((prev) => ({ ...prev, [path]: data.signedUrl }));
      return data.signedUrl;
    } finally {
      signingRef.current[path] = false;
    }
  };

  const openAttachment = async (a: AttachmentMeta) => {
    const url = await ensureSignedUrl(a.path);
    if (!url) {
      showToast({ message: "Couldn’t open attachment." }, 2500);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

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

      const p = tryParseCaptureBody(next.body);
      const base = (p.text || next.title || "").trim();

      setStatusLine("Ready.");
      setDecisionTitle(next.title ?? safeTitleFromText(base));
      setDecisionStatement(base);

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

    const p = tryParseCaptureBody(next.body);
    const base = (p.text || next.title || "").trim();

    setDecisionTitle(next.title ?? safeTitleFromText(base));
    setDecisionStatement(base);
    setStatusLine("Ready.");
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const sendToThinking = async () => {
    if (!canSend || working || !userId || !item) return;

    setWorking(true);
    setStatusLine("");

    const title = decisionTitle.trim();
    const statement = decisionStatement.trim();

    const attachments = parsed.attachments ?? [];

    try {
      // 1) Create draft decision (attachments travel forward)
      const { data: created, error: createErr } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          title,
          context: statement || null,
          status: "draft",
          origin: "framing",
          framed_at: new Date().toISOString(),
          attachments: attachments.length > 0 ? attachments : null,
          // inbox_item_id: undefined, (optional if you later add it)
        })
        .select("id")
        .single();

      if (createErr) throw createErr;

      const decisionId = created?.id as string | undefined;

      // 2) Close the capture item
      const { error: closeErr } = await supabase
        .from("decision_inbox")
        .update({ status: "closed" })
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("status", "open");

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
                  <div className="text-sm text-zinc-900">{parsed.text || item.title}</div>

                  {parsed.attachments.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-semibold text-zinc-700">Attachments</div>
                      <div className="space-y-2">
                        {parsed.attachments.map((a) => (
                          <div
                            key={a.path}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm text-zinc-900">{a.name}</div>
                              <div className="text-xs text-zinc-500">{kb(a.size)}</div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Chip onClick={() => void openAttachment(a)} title="Open attachment">
                                Open
                              </Chip>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
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
