// lib/home/useHomeUnload.ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type HomeUnloadIntent =
  | "offload"
  | "uncertainty"
  | "question"
  | "decision_shaped"
  | "emotional_load"
  | "unknown";

export type HomeUnloadResult = {
  inbox_item_id: string;
  intent: HomeUnloadIntent;
  // Optional, calm, brief. Null = silence (most common, valid).
  response: string | null;
  // Optional: Engine may create draft decisions silently.
  created_draft_decision_id?: string | null;
};

export type UseHomeUnloadOptions = {
  userId: string | null;
};

/**
 * Contract: Home Unload
 * - Always available
 * - No mode selection
 * - Submit clears UI immediately (caller responsibility)
 * - May return a brief reflection/question OR silence
 */
export function useHomeUnload(opts: UseHomeUnloadOptions) {
  const { userId } = opts;

  const [response, setResponse] = useState<string | null>(null);

  const submit = useCallback(
    async (rawText: string): Promise<HomeUnloadResult | null> => {
      if (!userId) {
        // Quiet no-op: Home should remain calm; auth handling belongs elsewhere.
        return null;
      }

      const text = rawText.trim();
      if (!text) return null;

      // 1) Persist the unload as an inbox item (infrastructure, not surfaced on Home)
      // Keep it neutral: it's "captured" without making it a task.
      const title = text.length > 80 ? text.slice(0, 79) + "…" : text;

      const { data, error } = await supabase
        .from("decision_inbox")
        .insert({
          user_id: userId,
          type: "note",
          title,
          body: text,
          severity: null,
          status: "open",
          snoozed_until: null,
          dedupe_key: `home_unload_${Date.now()}`,
          action_label: null,
          action_href: null,
        })
        .select("id")
        .single();

      if (error || !data?.id) {
        // Quiet failure: do not punish the user with noise.
        return null;
      }

      const inboxItemId = data.id as string;

      // 2) Optional inference (silent). If you don't have the API yet, it will fail quietly.
      // Endpoint contract (future): POST /api/home/unload
      // Body: { inbox_item_id, text }
      // Returns: { intent, response, created_draft_decision_id? }
      try {
        const res = await fetch("/api/home/unload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inbox_item_id: inboxItemId, text }),
        });

        const json = await res.json().catch(() => null);

        if (res.ok && json && typeof json === "object") {
          const next: HomeUnloadResult = {
            inbox_item_id: inboxItemId,
            intent: (json.intent as HomeUnloadIntent) ?? "unknown",
            response: typeof json.response === "string" ? json.response : null,
            created_draft_decision_id:
              typeof json.created_draft_decision_id === "string" ? json.created_draft_decision_id : null,
          };

          // Home rule: response is conditional and rare.
          setResponse(next.response ?? null);
          return next;
        }
      } catch {
        // silence
      }

      // Default: silence (valid)
      setResponse(null);
      return { inbox_item_id: inboxItemId, intent: "unknown", response: null };
    },
    [userId]
  );

  return useMemo(
    () => ({
      submit,
      response,
      clearResponse: () => setResponse(null),
    }),
    [submit, response]
  );
}
