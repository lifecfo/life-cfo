// lib/capture/useCaptureSubmit.ts
"use client";

import { useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

export type CaptureSubmitPayload = {
  text: string;
  files: File[];
};

export type UseCaptureSubmitOptions = {
  userId: string | null;
};

/**
 * Capture is raw intake (material), not thinking.
 * V1: we store the text + file metadata in decision_inbox.
 * File upload (Supabase Storage) can be added later without changing the page contract.
 */
export function useCaptureSubmit(opts: UseCaptureSubmitOptions) {
  const { userId } = opts;

  const submit = useCallback(
    async ({ text, files }: CaptureSubmitPayload) => {
      if (!userId) return;

      const cleaned = (text ?? "").trim();

      const attachments = (files ?? []).map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type || null,
      }));

      // Title: calm + neutral, derived, not user-facing on Capture
      const title =
        cleaned.length > 0
          ? cleaned.split("\n")[0].slice(0, 80) + (cleaned.split("\n")[0].length > 80 ? "…" : "")
          : attachments.length > 0
            ? "Capture (files)"
            : "Capture";

      // Body: store text + attachment metadata (upload comes later)
      const bodyObj = {
        text: cleaned || null,
        attachments: attachments.length ? attachments : [],
      };

      await supabase.from("decision_inbox").insert({
        user_id: userId,
        type: "capture",
        title,
        body: JSON.stringify(bodyObj),
        severity: null,
        status: "open",
        snoozed_until: null,
        dedupe_key: `capture_${Date.now()}`,
        action_label: null,
        action_href: null,
      });
    },
    [userId]
  );

  return useMemo(() => ({ submit }), [submit]);
}
