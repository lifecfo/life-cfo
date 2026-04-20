// lib/home/useHomeOrientation.ts
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type NoteItem = {
  text: string;
  href: string;
  key: string; // stable-ish for dedupe
  priority: number; // higher = more likely to be shown
};

type Result = {
  loading: boolean;
  items: Array<{ text: string; href: string }>;
};

/**
 * Home Notes (V1)
 * - Pull from multiple sources
 * - Curate to top 3
 * - Calm, human language
 * - Linkable to where user can act (if they choose)
 * - No dashboards, no lists beyond 3
 */
export function useHomeOrientation({ userId }: { userId: string | null }): Result {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NoteItem[]>([]);
  const refreshTimer = useRef<number | null>(null);

  // --- helpers ---
  const safeMs = (iso: string | null | undefined) => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  };

  const isWithinDays = (iso: string, days: number) => {
    const ms = safeMs(iso);
    if (!ms) return false;
    const now = Date.now();
    const until = now + days * 24 * 60 * 60 * 1000;
    return ms >= now && ms <= until;
  };

  const dedupePush = (arr: NoteItem[], item: NoteItem) => {
    if (!item.text?.trim()) return;
    if (!item.href?.trim()) return;
    if (arr.some((x) => x.key === item.key)) return;
    arr.push(item);
  };

  const build = async () => {
    if (!userId) {
      setItems([]);
      return;
    }

    setLoading(true);

    try {
      const next: NoteItem[] = [];

      // 1) Bills intel (recurring_bills)
      // Prioritise autopay risk within 14 days; otherwise due soon.
      try {
        const { data, error } = await supabase
          .from("recurring_bills")
          .select("next_due_at,autopay,active")
          .eq("user_id", userId)
          .eq("active", true);

        if (!error) {
          const rows = (data ?? []) as any[];
          let due7 = 0;
          let due14 = 0;
          let autopayRisk = 0;

          for (const r of rows) {
            const next_due_at = typeof r.next_due_at === "string" ? (r.next_due_at as string) : null;
            const autopay = !!r.autopay;
            if (!next_due_at) continue;

            const in7 = isWithinDays(next_due_at, 7);
            const in14 = isWithinDays(next_due_at, 14);

            if (in7) due7 += 1;
            if (in14) due14 += 1;
            if (in14 && !autopay) autopayRisk += 1;
          }

          if (autopayRisk > 0) {
            dedupePush(next, {
              key: "bills_autopay_risk",
              href: "/money",
              priority: 90,
              text:
                autopayRisk === 1
                  ? "One bill may need attention in the next two weeks."
                  : `${autopayRisk} bills may need attention in the next two weeks.`,
            });
          } else if (due7 > 0) {
            dedupePush(next, {
              key: "bills_due_7",
              href: "/money",
              priority: 70,
              text: due7 === 1 ? "One bill is due in the next 7 days." : `${due7} bills are due in the next 7 days.`,
            });
          } else if (due14 > 0) {
            dedupePush(next, {
              key: "bills_due_14",
              href: "/money",
              priority: 60,
              text: due14 === 1 ? "One bill is due in the next two weeks." : `${due14} bills are due in the next two weeks.`,
            });
          }
        }
      } catch {
        // silent
      }

      // 2) Review intel (decisions with review_at due)
      // Link to active Decisions.
      try {
        const nowIso = new Date().toISOString();

        const { data, error } = await supabase
          .from("decisions")
          .select("id,review_at,status")
          .eq("user_id", userId)
          .not("review_at", "is", null)
          .lte("review_at", nowIso)
          .limit(50);

        if (!error) {
          const rows = (data ?? []) as any[];
          // avoid counting "chaptered"/finished if you use that status; keep it tolerant
          const due = rows.filter((r) => String(r.status ?? "") !== "chaptered").length;

          if (due > 0) {
            dedupePush(next, {
              key: "review_due",
              href: "/decisions?tab=active",
              priority: 95,
              text: due === 1 ? "One decision is ready for a check-in." : `${due} decisions are ready for a check-in.`,
            });
          }
        }
      } catch {
        // silent
      }

      // 3) Inbox intel (decision_inbox)
      // Link to active Decisions.
      try {
        const nowIso = new Date().toISOString();

        const { data, error } = await supabase
          .from("decision_inbox")
          .select("id,status,snoozed_until")
          .eq("user_id", userId)
          .eq("status", "open")
          .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
          .limit(50);

        if (!error) {
          const openCount = (data ?? []).length;
          if (openCount > 0) {
            dedupePush(next, {
              key: "captures_open",
              href: "/decisions?tab=active",
              priority: 80,
              text: openCount === 1 ? "One item is waiting to be shaped into a decision." : `${openCount} items are waiting to be shaped into decisions.`,
            });
          }
        }
      } catch {
        // silent
      }

      // 4) Engine insights (optional; tolerant)
      // If you have a table that stores “digest” style insights, hook it here.
      // We keep it very calm: one note max, link to wherever you show it.
      // If the table doesn’t exist, it silently does nothing.
      try {
        const { data, error } = await supabase
          .from("engine_insights")
          .select("id,summary,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!error) {
          const row = (data ?? [])[0] as any;
          const summary = typeof row?.summary === "string" ? row.summary.trim() : "";
          if (summary) {
            dedupePush(next, {
              key: "engine_latest",
              href: "/home", // change later if you add a dedicated “insights” surface
              priority: 40,
              text: summary,
            });
          }
        }
      } catch {
        // silent
      }

      // Curate top 3 (priority desc), then return only text+href
      const curated = next
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 3)
        .map((n) => ({ text: n.text, href: n.href }));

      setItems(next); // keep full list for future debugging if needed
      // Store curated in derived memo below
      setCurated(curated);
    } finally {
      setLoading(false);
    }
  };

  // Store curated separately (stable output)
  const [curated, setCurated] = useState<Array<{ text: string; href: string }>>([]);

  const scheduleRefresh = () => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void build();
    }, 600);
  };

  useEffect(() => {
    if (!userId) {
      setCurated([]);
      setItems([]);
      return;
    }

    void build();

    // Optional: lightweight realtime nudge (no polling)
    // If any of these tables update, refresh notes (debounced).
    const ch = supabase
      .channel(`home-notes-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "recurring_bills", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decision_inbox", filter: `user_id=eq.${userId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Output: curated top 3 only (calm)
  return useMemo(() => {
    return { loading, items: curated };
  }, [loading, curated]);
}
