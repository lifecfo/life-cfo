"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Chip } from "@/components/ui";
import { softKB, type AttachmentMeta } from "@/lib/attachments";

function safeFileName(name: string) {
  return name.replace(/[^\w.\-()+ ]/g, "_");
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

export function AttachmentsBlock(props: {
  userId: string | null;
  decisionId: string;
  // Optional: if the parent already has attachments, pass them to avoid a refetch
  initial?: AttachmentMeta[] | null;
  title?: string; // e.g. "Attachments"
  bucket?: string; // default "captures" for fastest V1

  // ✅ NEW: allows parent to show imported-from-capture count in the subtitle
  extraImportedCount?: number;
}) {
  const { userId, decisionId, initial, title = "Attachments", bucket = "captures", extraImportedCount = 0 } = props;

  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  // Local cached attachments from DB
  const [attachments, setAttachments] = useState<AttachmentMeta[]>(() => normalizeAttachments(initial));

  // ✅ NEW: keep local attachments in sync when parent initial changes
  // (prevents "No attachments" getting stuck when initial arrives after mount)
  useEffect(() => {
    // Don’t clobber while user is staging files; just update the saved list.
    setAttachments(normalizeAttachments(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initial ?? null)]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasChanges = files.length > 0;

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

  const removePickedFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeSavedAttachment = async (idx: number) => {
    if (!userId) return;
    if (saving) return;

    const next = attachments.filter((_, i) => i !== idx);
    setAttachments(next);

    // Persist immediately (keep it simple for V1)
    const { error } = await supabase
      .from("decisions")
      .update({ attachments: next })
      .eq("id", decisionId)
      .eq("user_id", userId);

    // If it fails, silently revert (no nagging)
    if (error) setAttachments(attachments);
  };

  const saveUploads = async () => {
    if (!userId) return;
    if (!hasChanges) return;
    if (saving) return;

    setSaving(true);

    // Clear picked files early (release moment)
    const filesSnapshot = [...files];
    setFiles([]);

    try {
      const storage = supabase.storage.from(bucket);

      const uploaded: AttachmentMeta[] = [];
      for (const f of filesSnapshot) {
        const safeName = safeFileName(f.name);
        const stamp = Date.now();
        const path = `${userId}/decisions/${decisionId}/${stamp}-${safeName}`;

        const { error: upErr } = await storage.upload(path, f, {
          upsert: false,
          contentType: f.type || undefined,
        });

        if (upErr) continue;

        uploaded.push({
          name: f.name,
          path,
          type: f.type || "application/octet-stream",
          size: f.size,
        });
      }

      if (uploaded.length === 0) return;

      const merged = [...attachments, ...uploaded];

      setAttachments(merged);

      const { error: updErr } = await supabase
        .from("decisions")
        .update({ attachments: merged })
        .eq("id", decisionId)
        .eq("user_id", userId);

      // silent failure: revert local merge
      if (updErr) setAttachments(attachments);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = useMemo(() => {
    // While files are staged, that status takes priority
    if (files.length > 0) return `${files.length} ready to upload`;

    const savedCount = attachments.length;
    const importedCount = Math.max(0, extraImportedCount);

    if (savedCount === 0 && importedCount === 0) return "No attachments.";
    if (savedCount === 0 && importedCount > 0) return `${importedCount} imported`;
    if (savedCount > 0 && importedCount === 0) return `${savedCount} attached`;

    return `${savedCount} attached • ${importedCount} imported`;
  }, [attachments.length, files.length, extraImportedCount]);

  return (
    <div
      className="space-y-2"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addPickedFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-sm text-zinc-600">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
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

          {hasChanges ? (
            <Chip onClick={() => void saveUploads()} title={saving ? "Working…" : "Upload"}>
              {saving ? "Uploading…" : "Upload"}
            </Chip>
          ) : null}
        </div>
      </div>

      {files.length > 0 ? (
        <div className="space-y-2">
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
                onClick={() => removePickedFile(idx)}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-zinc-300"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="space-y-2">
          {attachments.map((a, idx) => (
            <div
              key={`${a.path}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-900">{a.name}</div>
                <div className="text-xs text-zinc-500">{softKB(a.size)}</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void removeSavedAttachment(idx)}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-zinc-300"
                  title="Remove"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="text-xs text-zinc-500">Optional. You can also drag & drop files here.</div>
    </div>
  );
}
