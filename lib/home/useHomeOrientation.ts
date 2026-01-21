// lib/home/useHomeOrientation.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type HomeOrientationItem = {
  text: string;
  // Optional navigation away from Home (no inline expansion)
  href?: string | null;
  // Optional stable key for dedupe/updates
  dedupe_key?: string | null;
};

export type UseHomeOrientationOptions = {
  userId: string | null;
};

/**
 * Contract: Home Orientation
 * - AI conclusions about life & money
 * - No raw data, no numbers, no lists
 * - Render only when meaningful
 * - Never stack multiple messages (pick best 1)
 */
export function useHomeOrientation(opts: UseHomeOrientationOptions) {
  const { userId } = opts;

  const [item, setItem] = useState<HomeOrientationItem | null>(null);

  useEffect(() => {
    if (!userId) {
      setItem(null);
      return;
    }

    let mounted = true;

    const load = async () => {
      /**
       * V1 strategy (quiet + minimal):
       * Look for a single, precomputed Engine conclusion row in decision_inbox:
       * - type = 'engine'
       * - dedupe_key = 'home_orientation_v1'
       *
       * If not present, show nothing (silence is valid).
       */
      const { data, error } = await supabase
        .from("decision_inbox")
        .select("title, body, action_href, dedupe_key, created_at")
        .eq("user_id", userId)
        .eq("type", "engine")
        .eq("dedupe_key", "home_orientation_v1")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!mounted) return;

      if (error || !data || data.length === 0) {
        setItem(null);
        return;
      }

      const row = data[0] as any;

      // Orientation should be one calm sentence. Prefer title; fall back to first line of body.
      const textRaw =
        (typeof row.title === "string" && row.title.trim()) ||
        (typeof row.body === "string" && row.body.trim().split("\n")[0]) ||
        "";

      const text = textRaw.trim();
      if (!text) {
        setItem(null);
        return;
      }

      setItem({
        text,
        href: typeof row.action_href === "string" ? row.action_href : null,
        dedupe_key: typeof row.dedupe_key === "string" ? row.dedupe_key : null,
      });
    };

    void load();

    // Optional realtime refresh, but still calm: just replace the one sentence if it changes.
    const channel = supabase
      .channel(`home-orientation-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "decision_inbox",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const next = payload?.new;
          if (next?.type === "engine" && next?.dedupe_key === "home_orientation_v1") {
            void load();
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return useMemo(() => ({ item }), [item]);
}
