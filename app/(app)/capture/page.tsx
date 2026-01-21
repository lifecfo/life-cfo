// app/(app)/capture/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { useCaptureSubmit } from "@/lib/capture/useCaptureSubmit";

export const dynamic = "force-dynamic";

export default function CapturePage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [affirmation, setAffirmation] = useState<"Saved." | "Held." | null>(null);

  const affirmationTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

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

  const capture = useCaptureSubmit({ userId });

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

  const onPickFiles = (picked: FileList | null) => {
    if (!picked) return;
    setFiles((prev) => [...prev, ...Array.from(picked)]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    const raw = text.trim();
    const hasFiles = files.length > 0;

    if (!raw && !hasFiles) return;

    // Release moment: clear immediately
    setText("");
    setFiles([]);
    flashAffirmation("Saved.");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    await capture.submit({ text: raw, files });
  };

  return (
    <Page title="Capture">
      <div className="mx-auto w-full max-w-[680px] space-y-6">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Drop anything you want safely held."
          className="w-full min-h-[180px] resize-y rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          aria-label="Capture"
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 hover:border-zinc-300">
              Add files
              <input type="file" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
            </label>

            {files.length > 0 ? (
              <div className="text-sm text-zinc-600">{files.length} attached</div>
            ) : (
              <div className="text-sm text-zinc-500">Optional.</div>
            )}
          </div>

          {files.length > 0 ? (
            <div className="space-y-2">
              {files.map((f, idx) => (
                <div
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-900">{f.name}</div>
                    <div className="text-xs text-zinc-500">{Math.max(1, Math.round(f.size / 1024))} KB</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:border-zinc-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {affirmation ? (
          <div className="text-sm text-zinc-600" aria-live="polite">
            {affirmation}
          </div>
        ) : (
          <div className="h-5" aria-hidden="true" />
        )}
      </div>
    </Page>
  );
}
