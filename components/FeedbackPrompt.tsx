// components/FeedbackPrompt.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type Props = {
  pageTitle?: string;
};

type Rating = "yes" | "mostly" | "not_yet";

type FeedbackRow = {
  id?: string;
  user_id: string;
  page_path: string | null;
  rating: Rating | null;
  message: string;
  metadata: any;
  created_at?: string;
  updated_at?: string;
};

function isMoneyPath(path: string) {
  return (
    path.startsWith("/accounts") ||
    path.startsWith("/bills") ||
    path.startsWith("/income") ||
    path.startsWith("/investments") ||
    path.startsWith("/budget") ||
    path.startsWith("/transactions") ||
    path.startsWith("/net-worth") ||
    path.startsWith("/liabilities")
  );
}

function questionForPath(path: string) {
  // Money pages share one question in V1 (keeps signal clean + consistent)
  if (isMoneyPath(path)) return "Did this feel clear without becoming overwhelming?";

  const map: Record<string, string> = {
    "/home": "After using Home, do you feel more settled?",
    "/capture": "Was it easy to put this down here?",
    "/framing": "Did the decision feel clearer after Framing?",
    "/thinking": "Did this help you think without overwhelm?",
    "/decisions": "Did this feel like a safe place to record what you decided?",
    "/revisit": "Did Review show the right amount—no more, no less?",
    "/chapters": "Did this page help you feel finished?",
    "/family": "Does this capture who Keystone should keep in mind?",
    "/how-keystone-works": "Do you understand what Keystone is for now?",
    "/planned-upgrades": "Did this set expectations clearly?",
    "/settings": "Was this straightforward?",
    "/fine-print": "Did this feel clear and fair?",
    "/feedback": "Is it easy to share feedback here?",
    "/demo": "Did this give you a clear sense of Keystone?",
  };

  return map[path] ?? "Did this page feel calm and clear?";
}

function softWhen(iso?: string | null) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleString();
}

function labelForRating(r: Rating) {
  if (r === "yes") return "Yes";
  if (r === "mostly") return "Mostly";
  return "Not yet";
}

export function FeedbackPrompt({ pageTitle }: Props) {
  const { toast } = useToast();
  const pathname = usePathname() ?? "";

  const question = useMemo(() => questionForPath(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const [existing, setExisting] = useState<FeedbackRow | null>(null);

  const [rating, setRating] = useState<Rating | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // Reveal notes once they choose a rating (or if they already have saved feedback)
  const existingNote = String((existing?.metadata as any)?.note ?? "");
  const showNotes = open && (rating !== null || existingNote.trim().length > 0);

  const canSend = useMemo(() => {
    if (sending) return false;
    // Require a rating. Notes optional.
    return rating !== null;
  }, [rating, sending]);

  const loadExisting = async () => {
    setLoadingExisting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        setExisting(null);
        return;
      }

      const { data, error } = await supabase
        .from("feedback")
        .select("id,user_id,page_path,rating,message,metadata,created_at,updated_at")
        .eq("user_id", user.id)
        .eq("page_path", pathname)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      const row = (data ?? [])[0] as FeedbackRow | undefined;
      if (!row) {
        setExisting(null);
        return;
      }

      setExisting(row);
      setRating((row.rating as Rating) ?? null);
      setText(String((row.metadata as any)?.note ?? ""));
    } catch (e: any) {
      // keep silent-ish, don’t nag testers
      setExisting(null);
    } finally {
      setLoadingExisting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pathname]);

  const resetDraftToExisting = () => {
    setRating((existing?.rating as Rating) ?? null);
    setText(String((existing?.metadata as any)?.note ?? ""));
  };

  const send = async () => {
    if (!canSend) return;

    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        toast({ title: "Not signed in", description: "Please sign in first." });
        return;
      }

const trimmed = text.trim();

const payload = {
  user_id: user.id,
  page_path: pathname || null,
  path: pathname || null, // ✅ keep legacy column aligned
  rating,
  // ✅ DB requires message NOT NULL — store compact summary
  message: `${labelForRating(rating as Rating)} — ${question}`,
  metadata: {
    pageTitle: pageTitle ?? null,
    question,
    note: trimmed.length ? trimmed : null, // ✅ optional notes live here
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  },
};

      // Prefer upsert (editable per page). If unique constraint isn’t present yet,
      // this may error; we fallback to insert.
      let upsertError: any = null;
      const up = await supabase.from("feedback").upsert(payload, { onConflict: "user_id,page_path" }).select().single();
      if (up.error) upsertError = up.error;

      if (upsertError) {
        const ins = await supabase.from("feedback").insert(payload).select().single();
        if (ins.error) throw ins.error;
        setExisting(ins.data as FeedbackRow);
      } else {
        setExisting(up.data as FeedbackRow);
      }

      toast({ title: "Thank you", description: "Saved." });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Couldn’t save feedback", description: e?.message ?? "Please try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pt-6">
      {!open ? (
        <div className="flex justify-end">
          <Chip
            onClick={() => setOpen(true)}
            title="Optional: share feedback for this page"
            className="border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          >
            Feedback
          </Chip>
        </div>
      ) : (
        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-zinc-900">Feedback</div>
                <div className="text-xs text-zinc-500">Optional. A quick tap is enough.</div>
              </div>

              <div className="flex items-center gap-2">
                <Chip
                  onClick={() => {
                    setOpen(false);
                  }}
                  title="Close"
                >
                  Close
                </Chip>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-zinc-800">{question}</div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  active={rating === "yes"}
                  onClick={() => setRating("yes")}
                  title="Yes"
                >
                  Yes
                </Chip>
                <Chip
                  active={rating === "mostly"}
                  onClick={() => setRating("mostly")}
                  title="Mostly"
                >
                  Mostly
                </Chip>
                <Chip
                  active={rating === "not_yet"}
                  onClick={() => setRating("not_yet")}
                  title="Not yet"
                >
                  Not yet
                </Chip>
              </div>
            </div>

            {showNotes ? (
              <div className="space-y-2">
                <textarea
                  className="min-h-[96px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="If you chose ‘Mostly’ or ‘Not yet’, what made it feel that way? (Optional)"
                />
                <div className="text-xs text-zinc-500">Short notes are perfect.</div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-xs text-zinc-500">
                {loadingExisting ? (
                  <span>Loading…</span>
                ) : existing ? (
                  <span className="truncate">
                    Last saved: {labelForRating((existing.rating as Rating) ?? "mostly")}
                    {existing.updated_at ? ` • ${softWhen(existing.updated_at)}` : ""}
                  </span>
                ) : (
                  <span className="truncate">{pathname}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {existing ? (
                  <Chip onClick={resetDraftToExisting} title="Revert to saved">
                    Reset
                  </Chip>
                ) : null}

                <Chip
                  onClick={() => void send()}
                  title={canSend ? "Save feedback" : "Pick an option first"}
                  className={!canSend ? "opacity-50 pointer-events-none" : ""}
                >
                  {sending ? "Saving…" : "Save"}
                </Chip>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
