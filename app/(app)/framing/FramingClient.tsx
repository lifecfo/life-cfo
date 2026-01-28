// app/(app)/framing/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

export const dynamic = "force-dynamic";

type AttachmentMeta = {
  name: string;
  path: string;
  type: string;
  size: number;
};

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string | null;
  framed_decision_id: string | null;
};

type CaptureBodyParsed = { text: string; attachments: AttachmentMeta[] };

function safeTitleFromText(text: string) {
  const firstLine =
    (text || "")
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  const t = firstLine.slice(0, 80);
  return t || "Captured";
}

function normalizeAttachments(raw: any): AttachmentMeta[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a.path === "string")
    .map((a) => ({
      name: typeof a.name === "string" ? a.name : "Attachment",
      path: String(a.path),
      type: typeof a.type === "string" ? a.type : "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
    }));
}

function tryParseCaptureBody(raw: string | null): CaptureBodyParsed {
  if (!raw) return { text: "", attachments: [] };
  const trimmed = raw.trim();
  if (!trimmed) return { text: "", attachments: [] };

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as any;
      if (parsed && typeof parsed === "object") {
        const text = typeof parsed.text === "string" ? String(parsed.text) : "";
        const attachments = normalizeAttachments(parsed.attachments);
        return { text, attachments };
      }
    } catch {
      // fall through
    }
  }

  return { text: trimmed, attachments: [] };
}

function softKB(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function safeMs(iso: string | null) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function softDate(iso: string | null) {
  const ms = safeMs(iso);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString();
}

function snippetFromText(text: string, max = 120) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
}

/**
 * V1 heuristic: turn capture text/title into a neutral "decision statement"
 * without calling AI (fast + reliable).
 */
function suggestDecisionStatement(args: { title: string; captureText: string }) {
  const raw = `${args.title}\n${args.captureText}`.trim();
  const line =
    raw
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";

  const t = line.replace(/\s+/g, " ").trim();

  if (!t) return "Decide what to do next.";

  // If user already wrote a question/decision, keep it.
  if (/[?]$/.test(t)) return t;

  const lower = t.toLowerCase();

  // If it starts like a decision already
  if (
    lower.startsWith("should ") ||
    lower.startsWith("do i ") ||
    lower.startsWith("do we ") ||
    lower.startsWith("can i ") ||
    lower.startsWith("can we ") ||
    lower.startsWith("whether ")
  ) {
    return /[?]$/.test(t) ? t : `${t}?`;
  }

  // Otherwise: neutral wrapper.
  const short = t.length > 120 ? `${t.slice(0, 120).trim()}…` : t;
  return `Decide whether to ${short.replace(/[.]+$/, "")}.`;
}

/**
 * ✅ IMPORTANT
 * Next.js needs a Suspense boundary if anything in the tree uses useSearchParams().
 * Keeping this wrapper prevents the prerender build error.
 */
export default function FramingPage() {
  return (
    <Suspense fallback={null}>
      <FramingClient />
    </Suspense>
  );
}

function FramingClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  // current capture being framed
  const [item, setItem] = useState<InboxItem | null>(null);

  // list (top 5 default, show all optional)
  const [openItems, setOpenItems] = useState<InboxItem[]>([]);
  const [showAll, setShowAll] = useState(false);

  const [decisionTitle, setDecisionTitle] = useState<string>("");
  const [decisionStatement, setDecisionStatement] = useState<string>("");
  const [framingNote, setFramingNote] = useState<string>("");

  const [working, setWorking] = useState(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Editor scroll anchor (fixes “selected capture appears at bottom”)
  const editorTopRef = useRef<HTMLDivElement | null>(null);

  // Signed URL cache
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

  const scrollEditorIntoView = () => {
    window.setTimeout(() => {
      editorTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const applyItemToEditor = (next: InboxItem | null) => {
    setItem(next);

    if (!next) {
      setDecisionTitle("");
      setDecisionStatement("");
      setFramingNote("");
      return;
    }

    const p = tryParseCaptureBody(next.body);
    const captureText = (p.text || "").trim();
    const baseForTitle = (captureText || next.title || "").trim();

    const title = (next.title || safeTitleFromText(baseForTitle)).slice(0, 120);
    setDecisionTitle(title);

    // Default decision statement is NOT the capture text
    const suggested = suggestDecisionStatement({ title, captureText });
    setDecisionStatement(suggested.slice(0, 1000));

    setFramingNote("");

    scrollEditorIntoView();
    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const loadOpenList = async (uid: string) => {
    const { data, error } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .is("framed_decision_id", null)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setOpenItems([]);
      return;
    }

    setOpenItems((data ?? []) as InboxItem[]);
  };

  const loadNextSuggested = async (uid: string) => {
    setStatusLine("Loading…");

    const { data, error } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .is("framed_decision_id", null)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      applyItemToEditor(null);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const next = (data?.[0] ?? null) as InboxItem | null;
    applyItemToEditor(next);

    setStatusLine(next ? "Ready." : "Nothing to frame right now.");
  };

  const loadById = async (uid: string, inboxId: string) => {
    setStatusLine("Loading…");

    const { data, error } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .eq("id", inboxId)
      .single();

    if (error || !data) {
      setStatusLine(error?.message ? `Error: ${error.message}` : "Couldn’t load that capture.");
      return;
    }

    applyItemToEditor(data as InboxItem);
    setStatusLine("Ready.");
  };

  // boot
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        applyItemToEditor(null);
        setOpenItems([]);
        setStatusLine("Not signed in.");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);

      await Promise.all([loadOpenList(uid), loadNextSuggested(uid)]);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const visibleOpen = useMemo(() => {
    return showAll ? openItems : openItems.slice(0, 5);
  }, [openItems, showAll]);

  const canSend = useMemo(() => {
    return !!userId && !!item && decisionTitle.trim().length > 0 && !working;
  }, [userId, item, decisionTitle, working]);

  const sendToThinking = async () => {
    if (!canSend || !userId || !item) return;

    setWorking(true);

    const title = decisionTitle.trim();
    const statement = decisionStatement.trim();
    const attachments = parsed.attachments ?? [];
    const note = framingNote.trim();

    // Context keeps the original capture without duplicating statement
    const contextPieces: string[] = [];
    if (statement) contextPieces.push(`Decision (framed):\n${statement}`);
    if (parsed.text && parsed.text.trim()) {
      contextPieces.push(`\n---\nCaptured:\n${parsed.text.trim()}`);
    }
    const context = contextPieces.length ? contextPieces.join("\n") : null;

    try {
      const { data: created, error: createErr } = await supabase
        .from("decisions")
        .insert({
          user_id: userId,
          title,
          context,
          status: "draft",
          origin: "framing",
          framed_at: new Date().toISOString(),
          attachments: attachments.length > 0 ? attachments : null,
        })
        .select("id")
        .single();

      if (createErr || !created?.id) throw createErr ?? new Error("Couldn’t create draft.");

      const decisionId = String(created.id);

      if (note.length > 0) {
        await supabase
          .from("decision_notes")
          .upsert(
            { user_id: userId, decision_id: decisionId, kind: "framing", body: note },
            { onConflict: "user_id,decision_id,kind" }
          );
      }

      const { error: updErr } = await supabase
        .from("decision_inbox")
        .update({ framed_decision_id: decisionId, status: "done" })
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("status", "open");

      if (updErr) {
        showToast({ message: `Draft created, but couldn’t close capture: ${updErr.message}` }, 4500);
      } else {
        showToast(
          {
            message: "Draft created in Thinking.",
            undoLabel: "Open",
            onUndo: () => router.push(`/thinking?open=${decisionId}`),
          },
          7000
        );
      }

      await Promise.all([loadOpenList(userId), loadNextSuggested(userId)]);
    } catch (e: any) {
      showToast({ message: e?.message ? String(e.message) : "Couldn’t send to Thinking." }, 4000);
    } finally {
      setWorking(false);
    }
  };

  const closeAsNotADecision = async () => {
    if (!userId || !item || working) return;

    setWorking(true);
    try {
      const { error } = await supabase
        .from("decision_inbox")
        .update({ status: "done" })
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("status", "open");

      if (error) throw error;

      showToast({ message: "Closed. Kept as a capture only." }, 4500);
      await Promise.all([loadOpenList(userId), loadNextSuggested(userId)]);
    } catch (e: any) {
      showToast({ message: e?.message ? String(e.message) : "Couldn’t update." }, 3500);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page title="Framing" subtitle="Turn one capture into a clear decision." right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Flow controls (consistent, top-of-page) */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">Step 2 of 3</div>

          <div className="flex items-center gap-2">
            <Chip onClick={() => router.push("/capture")} title="Back: Capture">
              <span className="mr-1 opacity-70">‹</span> Back: Capture
            </Chip>

            <Chip onClick={() => router.push("/thinking")} title="Next: Thinking">
              Next: Thinking <span className="ml-1 opacity-70">›</span>
            </Chip>
          </div>
        </div>

        {/* Assisted retrieval */}
        <AssistedSearch scope="framing" placeholder="Search captures…" />

        <div className="text-xs text-zinc-500">{statusLine}</div>

        {/* Open captures list */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Open captures</div>
                <div className="text-sm text-zinc-600">Pick one to frame, or use the suggested one.</div>
              </div>

              <div className="flex items-center gap-2">
                {openItems.length > 5 ? (
                  <Chip onClick={() => setShowAll((v) => !v)} title={showAll ? "Show less" : "Show all"}>
                    {showAll ? "Show less" : "Show all"}
                  </Chip>
                ) : null}

                <Chip
                  onClick={() => {
                    if (!userId) return;
                    void loadNextSuggested(userId);
                  }}
                  title="Load the next suggested capture"
                >
                  Suggested
                </Chip>
              </div>
            </div>

            {openItems.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-600">No open captures.</div>
            ) : (
              <div className="mt-4 grid gap-2">
                {visibleOpen.map((r) => {
                  const p = tryParseCaptureBody(r.body);
                  const text = (p.text || "").trim();
                  const title = (r.title || safeTitleFromText(text)).trim();
                  const meta = r.created_at ? softDate(r.created_at) : "";
                  const hasAtts = (p.attachments?.length ?? 0) > 0;
                  const isActive = item?.id === r.id;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        if (!userId) return;
                        void loadById(userId, r.id);
                      }}
                      className={`w-full rounded-2xl border bg-white px-4 py-3 text-left transition hover:border-zinc-300 ${
                        isActive ? "border-zinc-400" : "border-zinc-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {meta ? meta : "Open capture"}
                            {hasAtts ? " • Attachments" : ""}
                          </div>
                          {text ? <div className="mt-2 text-sm text-zinc-700">{snippetFromText(text, 140)}</div> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Chip>{isActive ? "Open" : "Select"}</Chip>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editor */}
        {!item ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing to frame.</div>
                <div className="text-sm text-zinc-600">Capture something first — it will appear here when it’s ready.</div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip onClick={() => router.push("/capture")}>Go to Capture</Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div ref={editorTopRef}>
            <Card className="border-zinc-200 bg-white">
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-zinc-700">Captured</div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-900">{parsed.text || item.title}</div>

                    {parsed.attachments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-semibold text-zinc-700">Attachments</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {parsed.attachments.map((a) => (
                            <Chip
                              key={a.path}
                              onClick={() => void openAttachment(a)}
                              title={`${a.type}${a.size ? ` • ${softKB(a.size)}` : ""}`}
                            >
                              {a.name}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700">What you’re deciding</div>
                    <input
                      ref={titleRef}
                      value={decisionTitle}
                      onChange={(e) => setDecisionTitle(e.target.value)}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="Short label for this decision"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700">The choice ahead</div>
                    <textarea
                      value={decisionStatement}
                      onChange={(e) => setDecisionStatement(e.target.value)}
                      rows={4}
                      className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="Decide whether to…"
                    />
                    <div className="text-xs text-zinc-500">Keep it neutral and simple. You can change this later.</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-700">Note (optional)</div>
                    <textarea
                      value={framingNote}
                      onChange={(e) => setFramingNote(e.target.value)}
                      rows={3}
                      className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="Anything that matters: constraints, values, timing, context…"
                    />
                    <div className="text-xs text-zinc-500">Quiet notes, just for you.</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Chip onClick={() => void sendToThinking()} title="Create a draft in Thinking">
                      {working ? "Working…" : "Send to Thinking"}
                    </Chip>

                    <Chip onClick={() => void closeAsNotADecision()} title="Close this capture without creating a decision">
                      Keep as capture
                    </Chip>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Page>
  );
}
