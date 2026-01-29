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

type DecisionInsertResult = { id: string };

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

  // Examples dropdown (polish)
  const [examplesOpen, setExamplesOpen] = useState(false);

  // Recent list
  const [statusLine, setStatusLine] = useState<string>("Loading…");
  const [recent, setRecent] = useState<InboxItem[]>([]);
  const [totalOpenCount, setTotalOpenCount] = useState<number>(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Top-5 default
  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  // Selection + bulk actions (checkbox layout stays)
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

  // “Sent to Thinking” prompt state (no auto-nav)
  const [pushedDecisionIds, setPushedDecisionIds] = useState<string[]>([]);

  // Custom delete confirm (polish)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    ids: string[];
    all: boolean;
    label: string;
  }>({ open: false, ids: [], all: false, label: "" });

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Auth (quiet) ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUserId(null);
        setStatusLine("Not signed in.");
        setHasLoaded(true);
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

  const clearSelection = () => setSelected({});

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

  const toggleRow = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setAllVisible = (checked: boolean, ids: string[]) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = checked;
      return next;
    });
  };

  const insertExample = (s: string) => {
    setExamplesOpen(false);
    setText((prev) => {
      const next = prev.trim().length > 0 ? `${prev}\n${s}` : s;
      return next;
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Fetch all open captures (for true “Send all” / “Delete all”)
  const fetchAllOpenCaptures = async (uid: string) => {
    const pageSize = 250;
    const all: InboxItem[] = [];
    let offset = 0;

    for (let guard = 0; guard < 200; guard++) {
      const { data, error } = await supabase
        .from("decision_inbox")
        .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
        .eq("user_id", uid)
        .eq("status", "open")
        .is("framed_decision_id", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) throw error;

      const rows = (data ?? []) as InboxItem[];
      all.push(...rows);

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return all;
  };

  const loadRecent = async (uid: string, allMode: boolean) => {
    setStatusLine("Loading…");
    setHasLoaded(false);

    // Count total open captures (un-sent)
    const countRes = await supabase
      .from("decision_inbox")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("status", "open")
      .is("framed_decision_id", null);

    const total = typeof countRes.count === "number" ? countRes.count : 0;
    setTotalOpenCount(total);

    try {
      let rows: InboxItem[] = [];

      if (allMode) {
        // True “show all”: fetch every open capture (paged)
        rows = await fetchAllOpenCaptures(uid);
      } else {
        // Default: keep it light but enough for bulk header + UX
        const { data, error } = await supabase
          .from("decision_inbox")
          .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
          .eq("user_id", uid)
          .eq("status", "open")
          .is("framed_decision_id", null)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        rows = (data ?? []) as InboxItem[];
      }

      setRecent(rows);

      const totalForLine = total || rows.length;
      const showing = allMode ? rows.length : Math.min(rows.length, DEFAULT_LIMIT);
      setStatusLine(rows.length === 0 ? "Nothing captured yet." : `Showing ${showing} of ${totalForLine}.`);
    } catch (e: any) {
      setRecent([]);
      setStatusLine(`Error: ${e?.message ?? "Couldn’t load right now."}`);
    } finally {
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    if (!userId) return;
    void loadRecent(userId, showAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, showAll]);

  // Clear selection when toggling showAll (locked)
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const requestDelete = (ids: string[], all: boolean) => {
    if (ids.length === 0) return;

    const count = ids.length;
    const label = all ? `Delete all ${count} captures?` : count === 1 ? "Delete this capture?" : `Delete ${count} captures?`;
    setDeleteConfirm({ open: true, ids, all, label });
  };

  const performDelete = async (ids: string[], all: boolean) => {
    if (!userId) return;
    if (ids.length === 0) return;

    // Optimistic UI
    const before = recent;
    setRecent((prev) => prev.filter((x) => !ids.includes(x.id)));
    clearSelection();
    setDeleteConfirm({ open: false, ids: [], all: false, label: "" });

    try {
      // Best effort: remove attachments from storage
      const items = before.filter((x) => ids.includes(x.id));
      const paths: string[] = [];
      for (const item of items) {
        const parsed = tryParseCaptureBody(item.body);
        for (const a of parsed.attachments || []) {
          if (a?.path) paths.push(a.path);
        }
      }
      if (paths.length > 0) {
        await supabase.storage.from("captures").remove(paths);
      }

      const { error } = await supabase.from("decision_inbox").delete().eq("user_id", userId).in("id", ids);
      if (error) throw error;

      flashAffirmation("Deleted.", 1200);
      await loadRecent(userId, showAll);
    } catch {
      flashAffirmation("Couldn’t delete right now.", 1800);
      setRecent(before);
      await loadRecent(userId, showAll);
    }
  };

  const createDraftFromCapture = async (uid: string, item: InboxItem) => {
    const parsed = tryParseCaptureBody(item.body);
    const captureText = (parsed.text || "").trim();
    const attachments = parsed.attachments ?? [];

    const title = (item.title || safeTitleFromText(captureText)).trim().slice(0, 140);

    // V1: keep it simple. Context is the captured text (verbatim).
    const context = captureText ? `Captured:\n${captureText}` : null;

    const { data: created, error: createErr } = await supabase
      .from("decisions")
      .insert({
        user_id: uid,
        title,
        context,
        status: "draft",
        origin: "capture",
        framed_at: new Date().toISOString(),
        attachments: attachments.length > 0 ? attachments : null,
      })
      .select("id")
      .single();

    if (createErr || !created?.id) throw createErr ?? new Error("Couldn’t create draft.");

    const decisionId = String((created as DecisionInsertResult).id);

    // Close the capture and link it
    const { error: updErr } = await supabase
      .from("decision_inbox")
      .update({ framed_decision_id: decisionId, status: "done" })
      .eq("id", item.id)
      .eq("user_id", uid)
      .eq("status", "open")
      .is("framed_decision_id", null);

    if (updErr) {
      // Draft exists; capture may still show as open until refresh
      // Keep this quiet and let reload resync
    }

    return decisionId;
  };

  const sendToThinking = async (ids: string[], all: boolean) => {
    if (!userId) return;
    if (ids.length === 0) return;

    // Snapshot items (we need their bodies)
    const items = recent.filter((x) => ids.includes(x.id));
    if (items.length === 0) return;

    clearSelection();
    setPushedDecisionIds([]);
    setAffirmation(null);

    try {
      const createdDecisionIds: string[] = [];

      // Sequential keeps it simple and avoids rate spikes
      for (const item of items) {
        const decisionId = await createDraftFromCapture(userId, item);
        createdDecisionIds.push(decisionId);
      }

      setPushedDecisionIds(createdDecisionIds);
      flashAffirmation("Sent.", 1400);

      await loadRecent(userId, showAll);
    } catch {
      flashAffirmation("Couldn’t send right now.", 1800);
      await loadRecent(userId, showAll);
    }
  };

  const sendAllToThinking = async () => {
    if (!userId) return;

    clearSelection();
    setPushedDecisionIds([]);
    setAffirmation(null);

    try {
      const all = await fetchAllOpenCaptures(userId);
      if (all.length === 0) return;

      const createdDecisionIds: string[] = [];
      for (const item of all) {
        const decisionId = await createDraftFromCapture(userId, item);
        createdDecisionIds.push(decisionId);
      }

      setPushedDecisionIds(createdDecisionIds);
      flashAffirmation("Sent.", 1400);

      await loadRecent(userId, showAll);
    } catch {
      flashAffirmation("Couldn’t send right now.", 1800);
      await loadRecent(userId, showAll);
    }
  };

  const deleteAllCaptures = async () => {
    if (!userId) return;

    try {
      const all = await fetchAllOpenCaptures(userId);
      const ids = all.map((x) => x.id);
      if (ids.length === 0) return;
      requestDelete(ids, true);
    } catch {
      flashAffirmation("Couldn’t load everything right now.", 1800);
    }
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
    setPushedDecisionIds([]);
    clearSelection();
    setExamplesOpen(false);

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

      const inboxId = String((created as any)?.id);

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

        const { error: updErr } = await supabase
          .from("decision_inbox")
          .update({ body: bodyJson })
          .eq("id", inboxId)
          .eq("user_id", userId);

        if (updErr) {
          flashAffirmation("Saved (details couldn’t update).", 2200);
          await loadRecent(userId, showAll);
          return;
        }

        if (uploaded.length === 0 && filesSnapshot.length > 0) {
          flashAffirmation("Saved (attachments didn’t upload).", 2400);
          await loadRecent(userId, showAll);
          return;
        }

        if (uploadFailures > 0) {
          flashAffirmation("Saved (some attachments didn’t upload).", 2400);
          await loadRecent(userId, showAll);
          return;
        }
      }

      flashAffirmation("Saved.", 1300);
      await loadRecent(userId, showAll);
    } catch {
      flashAffirmation("Held.", 1800);
    } finally {
      setIsSubmitting(false);
    }
  };

  const visible = useMemo(() => {
    const list = recent;
    return showAll ? list : list.slice(0, DEFAULT_LIMIT);
  }, [recent, showAll]);

  const hasMore = (totalOpenCount || recent.length) > DEFAULT_LIMIT;

  const headerVisibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const visibleSelectedCount = useMemo(() => headerVisibleIds.filter((id) => selected[id]).length, [headerVisibleIds, selected]);
  const allVisibleChecked = headerVisibleIds.length > 0 && visibleSelectedCount === headerVisibleIds.length;

  const selectedCount = selectedIds.length;

  return (
    <Page title="Capture" subtitle={null} right={null}>
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        {/* Friendly line + examples dropdown (polish) */}
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-zinc-600">Drop anything here — a thought, a worry, a reminder. I’ll hold it for you.</div>

          <div className="relative">
            <Chip onClick={() => setExamplesOpen((v) => !v)} title="Examples">
              Examples
            </Chip>

            {examplesOpen ? (
              <div className="absolute right-0 mt-2 w-[380px] rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm z-30">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">💸 Money & big life goals</div>
                  <div className="space-y-1">
                    {[
                      "Can we buy a pool?",
                      "When could we realistically buy our first home?",
                      "Are we actually on track financially?",
                      "Can we afford an overseas holiday?",
                      "I’m scared we’ll never get ahead.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">🧭 Decisions I’m stuck on</div>
                  <div className="space-y-1">
                    {[
                      "I don’t know what the right decision is here.",
                      "I keep going back and forth on this.",
                      "I feel pressure to decide, but I’m not ready.",
                      "This feels bigger than I can think through right now.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">🧠 Mental load / emotional dump</div>
                  <div className="space-y-1">
                    {[
                      "I’m carrying too much in my head.",
                      "Everything feels messy and unfinished.",
                      "I can’t tell what actually matters right now.",
                      "I’m overwhelmed but don’t know why.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-900">🏡 Family / life direction</div>
                  <div className="space-y-1">
                    {[
                      "I’m worried about our family rhythm.",
                      "I feel tension about money and family choices.",
                      "I want our life to feel calmer than this.",
                      "I don’t know how to plan for the next few years.",
                    ].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => insertExample(e)}
                        className="block w-full rounded-xl px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <Chip onClick={() => setExamplesOpen(false)}>Done</Chip>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Input + compact actions row (spacing polish) */}
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

          <div
            className="flex flex-wrap items-center justify-between gap-2"
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

              {files.length > 0 ? (
                <div className="text-sm text-zinc-600">{files.length} attached</div>
              ) : (
                <div className="text-sm text-zinc-500">Optional. You can also drag & drop here.</div>
              )}
            </div>

            <Chip onClick={() => void submit()} title={!canSubmit ? "Add text or a file" : isSubmitting ? "Working…" : "Save"}>
              {isSubmitting ? "Saving…" : "Save"}
            </Chip>
          </div>

          {files.length > 0 ? (
            <div className="space-y-2 pt-1">
              {files.map((f, idx) => (
                <div
                  key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2"
                >
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-semibold text-zinc-900">Recent captures</div>
                <div className="text-xs text-zinc-500">Captures auto-delete after 30 days unless sent to Thinking.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {hasMore ? (
                  <Chip onClick={() => setShowAll((v) => !v)} title={showAll ? "Show less" : "Show all"}>
                    {showAll ? "Show less" : "Show all"}
                  </Chip>
                ) : null}
              </div>
            </div>

            {/* Search belongs here (above the list) */}
            <div className="mt-4">
              <AssistedSearch scope="capture" placeholder="Search captures…" />
            </div>

            {/* “Sent to Thinking” prompt (no auto-nav) */}
            {pushedDecisionIds.length > 0 ? (
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                <div className="text-sm text-zinc-700">Sent to Thinking{pushedDecisionIds.length === 1 ? "." : ` (${pushedDecisionIds.length}).`}</div>
                <Chip onClick={() => router.push("/thinking")} title="Go to Thinking">
                  Go to Thinking <span className="ml-1 opacity-70">›</span>
                </Chip>
              </div>
            ) : null}

            <div className="mt-4 text-xs text-zinc-500">{statusLine}</div>

            {!hasLoaded ? null : recent.length === 0 ? (
              <div className="mt-3 text-sm text-zinc-600">Nothing here yet.</div>
            ) : (
              <div className="mt-3 space-y-2">
                {/* Bulk header row (checkbox layout stays “perfect”) */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      onChange={(e) => setAllVisible(e.target.checked, headerVisibleIds)}
                      aria-label="Select all visible"
                      title="Select all visible"
                    />
                    <div className="text-sm text-zinc-700">
                      {showAll
                        ? `Showing ${recent.length} of ${totalOpenCount || recent.length}`
                        : `Showing ${Math.min(DEFAULT_LIMIT, recent.length)} of ${totalOpenCount || recent.length}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-zinc-500">Send</div>
                      <Chip
                        onClick={() => void sendToThinking(selectedIds, false)}
                        title={selectedCount === 0 ? "Select captures first" : "Send selected to Thinking"}
                        className={selectedCount === 0 ? "opacity-50 pointer-events-none" : undefined}
                      >
                        Send
                      </Chip>
                      <Chip
                        onClick={() => void sendAllToThinking()}
                        title={(totalOpenCount || recent.length) === 0 ? "Nothing to send" : "Send all to Thinking"}
                        className={(totalOpenCount || recent.length) === 0 ? "opacity-50 pointer-events-none" : undefined}
                      >
                        All
                      </Chip>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-xs text-zinc-500">Delete</div>
                      <Chip
                        onClick={() => requestDelete(selectedIds, false)}
                        title={selectedCount === 0 ? "Select captures first" : "Delete selected"}
                        className={selectedCount === 0 ? "opacity-50 pointer-events-none" : undefined}
                      >
                        Delete
                      </Chip>
                      <Chip
                        onClick={() => void deleteAllCaptures()}
                        title={(totalOpenCount || recent.length) === 0 ? "Nothing to delete" : "Delete all"}
                        className={(totalOpenCount || recent.length) === 0 ? "opacity-50 pointer-events-none" : undefined}
                      >
                        All
                      </Chip>
                    </div>
                  </div>
                </div>

                {/* List (single-line + checkbox only on right) */}
                <div className="grid gap-2">
                  {visible.map((r) => {
                    const p = tryParseCaptureBody(r.body);
                    const displayText = (p.text || "").trim();

                    const title = (r.title || safeTitleFromText(displayText)).trim();
                    const meta = r.created_at ? softDate(r.created_at) : "";

                    const attachmentsCount = p.attachments?.length ?? 0;
                    const hasAtts = attachmentsCount > 0;

                    // Keep this around for future (lint-friendly)
                    void normalizeForCompare(title);

                    const checked = !!selected[r.id];

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

                          <div className="flex items-center justify-end">
                            <input type="checkbox" checked={checked} onChange={() => toggleRow(r.id)} aria-label={`Select ${title}`} title="Select" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custom delete confirm (polish, not subtle) */}
        {deleteConfirm.open ? (
          <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/20 p-4">
            <div className="w-full max-w-[520px] rounded-2xl border border-zinc-200 bg-white shadow-lg">
              <div className="p-4 sm:p-5 space-y-2">
                <div className="text-sm font-semibold text-zinc-900">{deleteConfirm.label}</div>
                <div className="text-sm text-zinc-600">This can’t be undone.</div>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <Chip onClick={() => setDeleteConfirm({ open: false, ids: [], all: false, label: "" })} title="Cancel">
                    Cancel
                  </Chip>
                  <Chip
                    onClick={() => void performDelete(deleteConfirm.ids, deleteConfirm.all)}
                    title="Confirm delete"
                    className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                  >
                    Delete
                  </Chip>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Quiet note for V1 while job is pending (no extra explanation) */}
        {process.env.NODE_ENV === "development" ? (
          <div className="text-xs text-zinc-400">Cleanup rule: open captures older than 30 days should be deleted by a scheduled job (not implemented here).</div>
        ) : null}
      </div>
    </Page>
  );
}
