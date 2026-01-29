// app/(app)/capture/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { softKB, type AttachmentMeta } from "@/lib/attachments";
import { AssistedSearch } from "@/components/AssistedSearch";

export const dynamic = "force-dynamic";

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

function safeTitleFromText(text: string) {
  const firstLine =
    (text || "")
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? "";
  const t = firstLine.slice(0, 80);
  return t || "Captured";
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-()+ ]/g, "_");
}

function softDate(iso: string | null) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString();
}

function snippetFromText(text: string, max = 140) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
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

function tryParseCaptureBody(raw: string | null): { text: string; attachments: AttachmentMeta[] } {
  if (!raw) return { text: "", attachments: [] };

  const trimmed = raw.trim();
  if (!trimmed) return { text: "", attachments: [] };

  // JSON format: { text, attachments }
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

function normalizeForCompare(s: string) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export default function CapturePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [affirmation, setAffirmation] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Recent list
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [recent, setRecent] = useState<InboxItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [totalOpenCount, setTotalOpenCount] = useState<number>(0);

  // “Push to Framing” prompt state
  const [pushedHref, setPushedHref] = useState<string | null>(null);

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openItem = useMemo(() => recent.find((r) => r.id === openId) ?? null, [recent, openId]);
  const parsedOpen = useMemo(() => {
    if (!openItem) return { text: "", attachments: [] as AttachmentMeta[] };
    return tryParseCaptureBody(openItem.body);
  }, [openItem?.id, openItem?.body]);

  // --- Auth (quiet) ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        return;
      }
      setUserId(data.user.id);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const flashAffirmation = (msg: string, ms = 1500) => {
    setAffirmation(msg);
    if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
    affirmationTimerRef.current = window.setTimeout(() => setAffirmation(null), ms);
  };

  useEffect(() => {
    return () => {
      if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
      affirmationTimerRef.current = null;
    };
  }, []);

  const loadRecent = async (uid: string) => {
    setStatusLine("Loading…");

    // 1) Count total open captures (unframed)
    const countRes = await supabase
      .from("decision_inbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("status", "open")
      .is("framed_decision_id", null);

    const total = typeof countRes.count === "number" ? countRes.count : 0;
    setTotalOpenCount(total);

    // 2) Load top 5
    const { data, error } = await supabase
      .from("decision_inbox")
      .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
      .eq("user_id", uid)
      .eq("status", "open")
      .is("framed_decision_id", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      setRecent([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as InboxItem[];
    setRecent(rows);

    const loaded = rows.length;
    const totalForLine = total || loaded;
    setStatusLine(loaded === 0 ? "Nothing captured yet." : `Loaded ${loaded} of ${totalForLine}.`);
  };

  useEffect(() => {
    if (!userId) return;
    void loadRecent(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addPickedFiles = (picked: FileList | null) => {
    if (!picked) return;

    const incoming = Array.from(picked);

    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const next = [...prev];

      for (const f of incoming) {
        const k = `${f.name}:${f.size}:${f.lastModified}`;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(f);
      }

      return next;
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = !!userId && (!!text.trim() || files.length > 0);

  const deleteCapture = async (item: InboxItem) => {
    if (!userId) return;

    const ok = window.confirm("Delete this capture?");
    if (!ok) return;

    // Optimistic UI
    setRecent((prev) => prev.filter((x) => x.id !== item.id));
    setOpenId((prev) => (prev === item.id ? null : prev));

    try {
      // Best effort: remove attachments from storage (if any)
      const parsed = tryParseCaptureBody(item.body);
      const paths = (parsed.attachments || []).map((a) => a.path).filter(Boolean);

      if (paths.length > 0) {
        await supabase.storage.from("captures").remove(paths);
      }

      const { error } = await supabase.from("decision_inbox").delete().eq("id", item.id).eq("user_id", userId);
      if (error) throw error;

      flashAffirmation("Deleted.", 1200);
      await loadRecent(userId);
    } catch {
      flashAffirmation("Couldn’t delete right now.", 1800);
      // reload to resync
      await loadRecent(userId);
    }
  };

  const pushToFraming = (inboxId: string) => {
    // No DB change; just create a “go there” affordance.
    const href = `/framing?open=${encodeURIComponent(inboxId)}`;
    setPushedHref(href);
    flashAffirmation("Sent to Framing.", 1600);
  };

  /**
   * Capture submit contract:
   * - Writes ONLY to decision_inbox
   * - Does NOT navigate
   *
   * Attachment contract:
   * - Uploads files to Supabase Storage bucket: "captures"
   * - Writes decision_inbox.body as JSON string: { text, attachments: [...] }
   */
  const submit = async () => {
    if (isSubmitting) return;
    if (!canSubmit) return;

    const raw = text.trim();
    const hasFiles = files.length > 0;

    if (!userId) {
      flashAffirmation("Held.", 1600);
      return;
    }

    // Snapshot values BEFORE clearing UI
    const textSnapshot = raw;
    const filesSnapshot = [...files];

    // Release moment: clear immediately (critical)
    setText("");
    setFiles([]);
    setAffirmation(null);
    setPushedHref(null);

    // Keep focus available for continued capture
    window.setTimeout(() => inputRef.current?.focus(), 0);

    setIsSubmitting(true);

    try {
      // 1) Create inbox row first (so we have an id for attachment paths)
      const title = textSnapshot
        ? safeTitleFromText(textSnapshot)
        : filesSnapshot[0]?.name
          ? `File: ${filesSnapshot[0].name}`
          : "Captured";

      // If no files, keep body as plain text (simple + backward compatible)
      const initialBody = hasFiles ? null : textSnapshot;

      const { data: created, error: createErr } = await supabase
        .from("decision_inbox")
        .insert({
          user_id: userId,
          type: "capture",
          status: "open",
          title,
          body: initialBody,
        })
        .select("id")
        .single();

      if (createErr) throw createErr;

      const inboxId = String(created?.id);

      // 2) Upload attachments (if any)
      let uploaded: AttachmentMeta[] = [];
      let uploadFailures = 0;

      if (hasFiles) {
        const bucket = supabase.storage.from("captures");

        for (const f of filesSnapshot) {
          const safeName = safeFileName(f.name);
          const stamp = Date.now();
          const path = `${userId}/${inboxId}/${stamp}-${safeName}`;

          const { error: upErr } = await bucket.upload(path, f, {
            upsert: false,
            contentType: f.type || undefined,
          });

          if (upErr) {
            uploadFailures += 1;
            continue;
          }

          uploaded.push({
            name: f.name,
            path,
            type: f.type || "application/octet-stream",
            size: f.size,
          });
        }

        // 3) Persist JSON body with text + attachments (even if some failed)
        const bodyJson = JSON.stringify({ text: textSnapshot, attachments: uploaded });

        const { error: updErr } = await supabase.from("decision_inbox").update({ body: bodyJson }).eq("id", inboxId).eq("user_id", userId);

        if (updErr) {
          flashAffirmation("Saved (details couldn’t update).", 2200);
          await loadRecent(userId);
          return;
        }

        if (uploaded.length === 0 && filesSnapshot.length > 0) {
          flashAffirmation("Saved (attachments didn’t upload).", 2400);
          await loadRecent(userId);
          return;
        }

        if (uploadFailures > 0) {
          flashAffirmation("Saved (some attachments didn’t upload).", 2400);
          await loadRecent(userId);
          return;
        }
      }

      flashAffirmation("Saved.", 1300);

      // Refresh the visible “top 5”
      await loadRecent(userId);
    } catch {
      flashAffirmation("Held.", 1800);
    } finally {
      setIsSubmitting(false);
    }
  };

  const showExamples = recent.length === 0 && !text.trim() && files.length === 0;

  return (
    <Page title="Capture" subtitle="Drop raw thoughts here — messy is welcome. Keystone will help shape them into a clear decision when you’re ready." right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Flow controls (consistent, top-of-page) */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">Step 1 of 3</div>

          <div className="flex items-center gap-2">
            <Chip onClick={() => router.push("/framing")} title="Next: Framing">
              Next: Framing <span className="ml-1 opacity-70">›</span>
            </Chip>
          </div>
        </div>

        {/* Input */}
        <div className="space-y-3">
          <div className="text-xs text-zinc-500">No perfect wording needed. We’ll carry the clarity work with you.</div>

          <div className="space-y-2">
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Drop it here."
              className="w-full min-h-[180px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
              onKeyDown={(e) => {
                // Enter submits; Shift+Enter newline
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-label="Capture"
            />

            {/* Save row sits directly under textarea (bottom-right) */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-500">Enter saves • Shift+Enter adds a new line</div>

              <Chip onClick={() => void submit()} title={!canSubmit ? "Add text or a file" : isSubmitting ? "Working…" : "Save capture"}>
                {isSubmitting ? "Saving…" : "Save"}
              </Chip>
            </div>
          </div>

          {showExamples ? (
            <div className="text-xs text-zinc-500">
              <div className="font-medium text-zinc-600">Examples</div>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>I’m stressed about money.</li>
                <li>We need a break but I feel guilty spending.</li>
                <li>I don’t know if we should sell the car.</li>
                <li>Bills feel out of control.</li>
                <li>I want to start homeschool but finances…</li>
              </ul>
            </div>
          ) : null}

          <div className="text-xs text-zinc-500">
            When you want, <span className="font-medium">Next: Framing</span> helps turn this into a clear decision.
          </div>
        </div>

        {/* Files (optional) */}
        <div
          className="space-y-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addPickedFiles(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) fileInputRef.current.value = "";
                fileInputRef.current?.click();
              }}
              className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:border-zinc-300"
            >
              Add files
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addPickedFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />

            {files.length > 0 ? <div className="text-sm text-zinc-600">{files.length} attached</div> : <div className="text-sm text-zinc-500">Optional. You can also drag & drop here.</div>}
          </div>

          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((f, idx) => (
                <div key={`${f.name}-${f.size}-${f.lastModified}-${idx}`} className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-900">{f.name}</div>
                    <div className="text-xs text-zinc-500">{softKB(f.size)}</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-zinc-300"
                    aria-label={`Remove ${f.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Soft confirmation (brief, fades) */}
        {affirmation ? (
          <div className="text-sm text-zinc-600" aria-live="polite">
            {affirmation}
          </div>
        ) : (
          <div className="h-5" aria-hidden="true" />
        )}

        {/* ✅ Recent captures */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-zinc-900">Recent captures</div>
              <div className="text-sm text-zinc-600">These are safely held until you frame them.</div>
            </div>

            {/* Search belongs here (above the list) */}
            <div className="mt-4">
              <AssistedSearch scope="capture" placeholder="Search captures…" />
            </div>

            {/* “Sent to framing” prompt (no auto-nav) */}
            {pushedHref ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="text-sm text-zinc-700">Sent to Framing.</div>
                <Chip onClick={() => router.push(pushedHref)} title="Go to Framing">
                  Go to framing <span className="ml-1 opacity-70">›</span>
                </Chip>
              </div>
            ) : null}

            <div className="mt-4 text-xs text-zinc-500">{statusLine}</div>

            {recent.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600">Nothing here yet.</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {recent.map((r) => {
                  const isOpen = openId === r.id;

                  const p = tryParseCaptureBody(r.body);
                  const displayText = (p.text || "").trim();

                  const title = (r.title || safeTitleFromText(displayText)).trim();
                  const meta = r.created_at ? softDate(r.created_at) : "";

                  const attachmentsCount = p.attachments?.length ?? 0;
                  const hasAtts = attachmentsCount > 0;

                  const titleKey = normalizeForCompare(title);
                  const snippet = snippetFromText(displayText, 140);
                  const snippetKey = normalizeForCompare(snippet);

                  // Details only if there is meaningful extra content
                  const hasExtraText = !!snippet && snippetKey !== titleKey;
                  const hasDetails = hasExtraText || hasAtts;

                  return (
                    <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {meta ? meta : "Open capture"}
                            {hasAtts ? ` • ${attachmentsCount} attachment${attachmentsCount === 1 ? "" : "s"}` : ""}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Chip onClick={() => pushToFraming(r.id)} title="Push to Framing">
                            Push to Framing
                          </Chip>

                          {hasDetails ? (
                            <Chip onClick={() => setOpenId(isOpen ? null : r.id)} title={isOpen ? "Hide details" : "Show details"}>
                              {isOpen ? "Hide" : "Details"}
                            </Chip>
                          ) : null}

                          <Chip onClick={() => void deleteCapture(r)} title="Delete">
                            Delete
                          </Chip>
                        </div>
                      </div>

                      {isOpen && openItem?.id === r.id ? (
                        <div className="mt-3 space-y-3">
                          {parsedOpen.text ? (
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{parsedOpen.text}</div>
                          ) : null}

                          {parsedOpen.attachments?.length ? (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-zinc-600">Attachments</div>
                              <ul className="space-y-1">
                                {parsedOpen.attachments.slice(0, 10).map((a, idx) => (
                                  <li key={`${a.path}-${idx}`} className="text-sm text-zinc-700">
                                    {a.name}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div className="flex items-center gap-2">
                            <Chip onClick={() => setOpenId(null)} title="Done">
                              Done
                            </Chip>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
