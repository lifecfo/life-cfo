// app/(app)/home/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { useHomeUnload } from "@/lib/home/useHomeUnload";
import { useHomeOrientation } from "@/lib/home/useHomeOrientation";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

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
        return;
      }

      setUserId(data.user.id);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // --- Hooks (contracts) ---
  const unload = useHomeUnload({ userId });
  const orientation = useHomeOrientation({ userId });

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

    // Release moment (critical): clear immediately.
    setText("");
    flashAffirmation("Saved.");

    // Keep focus available for continued unloading
    window.setTimeout(() => inputRef.current?.focus(), 0);

    // Persist + optional silent inference
    await unload.submit(raw);
  };

  // Orientation click: navigate away (no inline expansion)
  const onOrientationClick = () => {
    if (!orientation.item?.href) return;
    router.push(orientation.item.href);
  };

  return (
    <Page title="Home">
      <div className="mx-auto w-full max-w-[680px] space-y-8">
        {/* Unload (primary) */}
        <div className="space-y-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What’s on your mind?"
            className="w-full min-h-[140px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
            onKeyDown={(e) => {
              // No mode UI. Natural: Enter submits; Shift+Enter creates a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            aria-label="Unload"
          />

          {/* Soft confirmation (brief, fades) */}
          {affirmation ? (
            <div className="text-sm text-zinc-600" aria-live="polite">
              {affirmation}
            </div>
          ) : (
            <div className="h-5" aria-hidden="true" />
          )}

          {/* Optional, conditional AI response (rare; may be empty) */}
          {unload.response ? (
            <div className="text-[15px] leading-relaxed text-zinc-800">{unload.response}</div>
          ) : null}
        </div>

        {/* Orientation (AI conclusions) — separate; never competes with input */}
        {orientation.item?.text ? (
          <button
            type="button"
            onClick={onOrientationClick}
            className={`w-full text-left text-[15px] leading-relaxed text-zinc-800 ${
              orientation.item.href ? "cursor-pointer hover:text-zinc-900" : "cursor-default"
            }`}
            aria-label="Orientation"
          >
            {orientation.item.text}
          </button>
        ) : null}
      </div>
    </Page>
  );
}
