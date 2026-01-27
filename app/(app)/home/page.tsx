// app/(app)/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { useHomeUnload } from "@/lib/home/useHomeUnload";
import { useHomeOrientation } from "@/lib/home/useHomeOrientation";

export const dynamic = "force-dynamic";

type BillsOrientation = {
  due7: number;
  due14: number;
  autopayRisk: number;
};

function safeMs(iso: string | null | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function isWithinDays(iso: string, days: number) {
  const ms = safeMs(iso);
  if (!ms) return false;
  const now = Date.now();
  const until = now + days * 24 * 60 * 60 * 1000;
  return ms >= now && ms <= until;
}

function billsOrientationSentence(o: BillsOrientation) {
  // One sentence. Calm. No urgency language.
  if (o.autopayRisk > 0) {
    return o.autopayRisk === 1
      ? "One bill may need attention in the next two weeks."
      : `${o.autopayRisk} bills may need attention in the next two weeks.`;
  }

  if (o.due7 > 0) {
    return o.due7 === 1 ? "One bill is due in the next 7 days." : `${o.due7} bills are due in the next 7 days.`;
  }

  if (o.due14 > 0) {
    return o.due14 === 1 ? "One bill is due in the next two weeks." : `${o.due14} bills are due in the next two weeks.`;
  }

  return "Bills look quiet for now.";
}

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");

  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

  const [billsLine, setBillsLine] = useState<string>("");

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // --- Auth (quiet) ---
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;

      if (error || !data?.user) {
        setUserId(null);
        setAuthStatus("signed_out");
        return;
      }

      setUserId(data.user.id);
      setAuthStatus("signed_in");
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- Hooks (contracts) ---
  const unload = useHomeUnload({ userId });
  const orientation = useHomeOrientation({ userId });

  // --- Bills -> Home Orientation (one calm sentence) ---
  useEffect(() => {
    if (!userId) {
      setBillsLine("");
      return;
    }

    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("recurring_bills")
        .select("next_due_at,autopay,active")
        .eq("user_id", userId)
        .eq("active", true);

      if (!alive) return;

      if (error) {
        setBillsLine("");
        return;
      }

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

      setBillsLine(billsOrientationSentence({ due7, due14, autopayRisk }));
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  // --- Helpers ---
  const flashAffirmation = (v: "Saved." | "Held.") => {
    setAffirmation(v);
    if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
    affirmationTimerRef.current = window.setTimeout(() => setAffirmation(null), 1300);
  };

  useEffect(() => {
    return () => {
      if (affirmationTimerRef.current) window.clearTimeout(affirmationTimerRef.current);
      affirmationTimerRef.current = null;
    };
  }, []);

  const submit = async () => {
    const raw = text.trim();
    if (!raw) return;

    // Release moment: clear immediately.
    setText("");
    flashAffirmation("Saved.");

    // Keep focus available for continued unloading
    window.setTimeout(() => inputRef.current?.focus(), 0);

    // Persist + optional silent inference
    await unload.submit(raw);
  };

  // Orientation click: navigate away (no inline expansion)
  const onOrientationClick = () => {
    const href = orientation.item?.href;
    if (!href) return;
    router.push(href);
  };

  const hasOrientation = Boolean(orientation.item?.text || billsLine);
  const canOpenOrientation = Boolean(orientation.item?.href);

  return (
    <Page
      title="Home"
      subtitle="Keystone Money helps you make everyday money decisions — simply and safely."
      right={
        <div className="flex items-center gap-2">
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[680px] space-y-8">
        {/* Unload (primary) */}
        <div className="space-y-3">
          <div className="text-xs text-zinc-500">Keystone Money can be used for household and small-business finances.</div>

          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you want to figure out about money?"
            className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            onKeyDown={(e) => {
              // Natural: Enter submits; Shift+Enter creates a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            aria-label="What do you want to figure out about money?"
            disabled={authStatus !== "signed_in"}
          />

          {/* Friendly helper + examples (only when empty) */}
          <div className="space-y-2">
            <div className="text-xs text-zinc-500">Type what you’re trying to decide — we’ll help you make it clear.</div>

            {text.trim().length === 0 ? (
              <div className="text-xs text-zinc-500">
                <div className="font-medium text-zinc-600">Examples</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>“What bills should we pay first this week?”</li>
                  <li>“How much can we spend on groceries?”</li>
                  <li>“Can we afford this purchase?”</li>
                  <li>“What’s a simple plan for debt and savings?”</li>
                  <li>“Are we on track this month?”</li>
                  <li>“How much should we set aside for tax, insurance, and yearly bills?”</li>
                  <li>“What should our buffer be before we book something?”</li>
                  <li>“Which account should this come from?”</li>
                </ul>
              </div>
            ) : null}
          </div>

          {/* ✅ Tiny role clarity (Home ≠ Capture) */}
          <div className="text-xs text-zinc-500">Capture is for raw thoughts. Framing helps turn them into a clear decision.</div>

          {/* Soft confirmation (brief, fades) */}
          {affirmation ? (
            <div className="text-sm text-zinc-600" aria-live="polite">
              {affirmation}
            </div>
          ) : (
            <div className="h-5" aria-hidden="true" />
          )}

          {/* Optional, conditional AI response (rare; may be empty) */}
          {unload.response ? <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div> : null}

          {authStatus === "signed_out" ? <div className="text-sm text-zinc-600">Sign in to use Home.</div> : null}
        </div>

        {/* Orientation (separate; never competes with input) */}
        {hasOrientation ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-600">Orientation</div>

                  {orientation.item?.text ? (
                    <div className="mt-2 text-[15px] leading-relaxed text-zinc-800">{orientation.item?.text}</div>
                  ) : null}

                  {billsLine ? <div className="mt-2 text-[15px] leading-relaxed text-zinc-800">{billsLine}</div> : null}
                </div>

                {canOpenOrientation ? (
                  <div className="shrink-0">
                    <Chip onClick={onOrientationClick} title="Open">
                      Open
                    </Chip>
                  </div>
                ) : null}
              </div>

              {/* If it has no href, it stays as a calm signal only */}
              {!canOpenOrientation ? <div className="mt-2 text-xs text-zinc-500">No action needed.</div> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  );
}
