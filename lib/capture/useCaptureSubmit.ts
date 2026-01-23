// lib/capture/useCaptureSubmit.ts
"use client";

import { supabase } from "@/lib/supabaseClient";

type SubmitArgs = {
  text: string;
  files: File[];
};

type AttachmentMeta = {
  name: string;
  size: number;
  type: string;
  path: string; // storage object path (bucket-relative)
};

function isDev() {
  return process.env.NODE_ENV === "development";
}

function safeFirstLine(text: string) {
  const t = (text || "").trim();
  if (!t) return "";
  return t.split("\n")[0].trim();
}

function fallbackId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uid() {
  // Browser crypto UUID when available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : fallbackId();
}

function sanitizeFilename(name: string) {
  return (name || "file")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140);
}

/**
 * Capture submit contract:
 * - Writes ONLY to decision_inbox
 * - Does NOT create decisions
 * - Does NOT route
 * - Stores body as { text, attachments: [...] } (JSON string)
 */
export function useCaptureSubmit({ userId }: { userId: string | null }) {
  const submit = async ({ text, files }: SubmitArgs) => {
    if (!userId) throw new Error("Not signed in.");

    const trimmed = (text || "").trim();
    const hasFiles = Array.isArray(files) && files.length > 0;

    if (!trimmed && !hasFiles) return;

    // Title: first line of text, else a gentle fallback
    const title =
      safeFirstLine(trimmed) ||
      (hasFiles ? `Captured with ${files.length} attachment${files.length === 1 ? "" : "s"}` : "Captured");

    // 1) Create inbox row first to get an ID (needed to namespace uploads)
    const initialBody = {
      text: trimmed,
      attachments: [] as AttachmentMeta[],
    };

    const { data: created, error: insertErr } = await supabase
      .from("decision_inbox")
      .insert({
        user_id: userId,
        type: "capture",
        status: "open",
        title,
        body: JSON.stringify(initialBody),
      })
      .select("id")
      .single();

    if (insertErr || !created?.id) {
      if (isDev()) console.error("[capture] insert decision_inbox failed", insertErr);
      throw insertErr ?? new Error("Capture insert failed.");
    }

    const inboxId = String(created.id);

    // 2) Upload attachments (if any)
    const attachments: AttachmentMeta[] = [];
    if (hasFiles) {
      for (const f of files) {
        try {
          const objectPath = `${userId}/${inboxId}/${uid()}-${sanitizeFilename(f.name)}`;

          const { error: upErr } = await supabase.storage
            .from("captures")
            .upload(objectPath, f, {
              cacheControl: "3600",
              upsert: false,
              contentType: f.type || undefined,
            });

          if (upErr) {
            if (isDev()) console.error("[capture] storage upload failed", { file: f?.name, error: upErr });
            // Keep going: we still want the text capture to exist
            continue;
          }

          attachments.push({
            name: f.name,
            size: f.size,
            type: f.type || "",
            path: objectPath,
          });
        } catch (e) {
          if (isDev()) console.error("[capture] storage upload exception", e);
          // Keep going
        }
      }
    }

    // 3) Update inbox row body with attachments metadata (and keep text)
    const finalBody = {
      text: trimmed,
      attachments,
    };

    const { error: updateErr } = await supabase
      .from("decision_inbox")
      .update({ body: JSON.stringify(finalBody) })
      .eq("id", inboxId)
      .eq("user_id", userId);

    if (updateErr) {
      // Not fatal for capture; text row exists. But log in dev.
      if (isDev()) console.error("[capture] update decision_inbox body failed", updateErr);
    }

    return { inboxId, attachmentsCount: attachments.length };
  };

  return { submit };
}
