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

  // If it looks like JSON, try parse
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

  // Plain text fallback
  return { text: trimmed, attachments: [] };
}

function softKB(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function softDate(iso: string | null) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString();
}

function snippetFromText(text: string, max = 120) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
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

  // Signed URL cache
  const [signed, setSigned] = useState<Record<string, string>>({});
  const signingRef = useRef<Record<string, boolean>>({});

  // ✅ User-directed selection (calm, optional)
  const [chooseOpen, setChooseOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<InboxItem[]>([]);
  const searchTimerRef = useRef<number | null>(null);

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

  const applyItemToEditor = (next: InboxItem | null) => {
    setItem(next);

    if (!next) {
      setDecisionTitle("");
      setDecisionStatement("");
      return;
    }

    const p = tryParseCaptureBody(next.body);
    const base = (p.text || next.title || "").trim();

    setDecisionTitle((next.title || safeTitleFromText(base)).slice(0, 120));
    setDecisionStatement(base.slice(0, 1000));

    window.setTimeout(() => titleRef.current?.focus(), 0);
  };

  const loadNext = async (uid: string) => {
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

    if (!next) {
      setStatusLine("Nothing to frame right now.");
      return;
    }

    setStatusLine("Ready.");
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

  const searchOpenCaptures = async (uid: string, q: string) => {
    const term = q.trim();
    if (!term) {
      // calm default: show a few newest open items as “choices”
      const { data, error } = await supabase
        .from("decision_inbox")
        .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
        .eq("user_id", uid)
        .is("framed_decision_id", null)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      return (data ?? []) as InboxItem[];
    }

    // Search by title (cheap) + show a small set.
    // (We avoid body search here to keep it simple + predictable for V1.)
    const { data, error } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .is("framed_decision_id", null)
      .eq("status", "open")
      .ilike("title", `%${term}%`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    // If title search returns nothing, do a fallback “recent open” so it never feels dead.
    const list = (data ?? []) as InboxItem[];
    if (list.length > 0) return list;

    const { data: recent, error: recentErr } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .is("framed_decision_id", null)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(6);

    if (recentErr) throw recentErr;
    return (recent ?? []) as InboxItem[];
  };

  // Boot
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        applyItemToEditor(null);
        setStatusLine("Not signed in.");
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);
      await loadNext(uid);
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ When chooser opens, preload a calm list
  useEffect(() => {
    if (!chooseOpen) return;
    if (!userId) return;

    setSearching(true);
    void searchOpenCaptures(userId, "")
      .then((r) => setResults(r))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chooseOpen, userId]);

  // ✅ Debounced search
  useEffect(() => {
    if (!chooseOpen) return;
    if (!userId) return;

    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

    searchTimerRef.current = window.setTimeout(() => {
      setSearching(true);
      void searchOpenCaptures(userId, searchQ)
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);

    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    };
  }, [chooseOpen, userId, searchQ]);

  const canSend = useMemo(() => {
    return !!userId && !!item && decisionTitle.trim().length > 0 && !working;
  }, [userId, item, decisionTitle, working]);

  const sendToThinking = async () => {
    if (!canSend || !userId || !item) return;

    setWorking(true);

    const title = decisionTitle.trim();
    const statement = decisionStatement.trim();
    const attachments = parsed.attachments ?? [];

    // Compose context: statement + original captured text (if different)
    const contextPieces: string[] = [];
    if (statement) contextPieces.push(statement);
    if (parsed.text && parsed.text.trim() && parsed.text.trim() !== statement) {
      contextPieces.push(`\n---\nCaptured:\n${parsed.text.trim()}`);
    }
    const context = contextPieces.length ? contextPieces.join("\n") : null;

    try {
      // 1) Create draft decision (attachments travel forward)
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

      // 2) Mark inbox as framed + done (keeps audit trail)
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
            message: "Sent to Thinking.",
            undoLabel: "Open",
            onUndo: () => router.push(`/thinking?open=${decisionId}`),
          },
          7000
        );
      }

      // after sending, return to gentle default
      setChooseOpen(false);
      setSearchQ("");
      setResults([]);

      await loadNext(userId);
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
        .update({ status: "done" })
        .eq("id", item.id)
        .eq("user_id", userId)
        .eq("status", "open");

      if (error) throw error;

      showToast({ message: "Okay — not a decision." }, 2200);

      setChooseOpen(false);
      setSearchQ("");
      setResults([]);

      await loadNext(userId);
    } catch (e: any) {
      showToast({ message: e?.message ? String(e.message) : "Couldn’t update." }, 3500);
    } finally {
      setWorking(false);
    }
  };

  const chooseThis = async (picked: InboxItem) => {
    if (!userId) return;

    setChooseOpen(false);
    setSearchQ("");
    setResults([]);

    await loadById(userId, picked.id);
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

        {/* ✅ Calm agency: choose what to frame */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Choose what to frame</div>
                <div className="text-sm text-zinc-600">
                  Start with what’s suggested — or pick something specific you want to shape right now.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Chip
                  onClick={() => setChooseOpen((v) => !v)}
                  title={chooseOpen ? "Hide chooser" : "Search and select a different capture"}
                >
                  {chooseOpen ? "Hide chooser" : "Choose…"}
                </Chip>
                <Chip
                  onClick={() => {
                    if (!userId) return;
                    setChooseOpen(false);
                    setSearchQ("");
                    setResults([]);
                    void loadNext(userId);
                  }}
                  title="Return to the next suggested capture"
                >
                  Suggested
                </Chip>
              </div>
            </div>

            {chooseOpen ? (
              <div className="mt-4 space-y-3">
                <input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Search open captures…"
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                />

                <div className="text-xs text-zinc-500">{searching ? "Searching…" : results.length === 0 ? "No matches." : ""}</div>

                {results.length > 0 ? (
                  <div className="grid gap-2">
                    {results.map((r) => {
                      const p = tryParseCaptureBody(r.body);
                      const text = (p.text || "").trim();
                      const title = (r.title || safeTitleFromText(text)).trim();
                      const meta = r.created_at ? softDate(r.created_at) : "";
                      const hasAtts = (p.attachments?.length ?? 0) > 0;

                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => void chooseThis(r)}
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-300"
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
                              <Chip>Open</Chip>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {!item ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing to frame.</div>
                <div className="text-sm text-zinc-600">When you capture something that needs shaping, it will wait here quietly.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
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
                          <Chip key={a.path} onClick={() => void openAttachment(a)} title={`${a.type}${a.size ? ` • ${softKB(a.size)}` : ""}`}>
                            {a.name}
                          </Chip>
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
                  <div className="text-xs font-semibold text-zinc-700">Decision statement</div>
                  <textarea
                    value={decisionStatement}
                    onChange={(e) => setDecisionStatement(e.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                    placeholder="What are you deciding, exactly?"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Chip onClick={() => void sendToThinking()} title="Create a draft in Thinking">
                    {working ? "Working…" : "Send to Thinking"}
                  </Chip>

                  <Chip onClick={() => void notADecision()} title="Close as not-a-decision">
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
