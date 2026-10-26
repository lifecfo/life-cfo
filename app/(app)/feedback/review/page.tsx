// app/(app)/feedback/review/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";

type FeedbackRow = {
  id: string;
  path: string;
  message: string;
  created_at: string;
  email: string;
};

function softDate(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default function FeedbackReviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<FeedbackRow[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/feedback/review", { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as { ok?: boolean; feedback?: FeedbackRow[]; error?: string };
      if (!response.ok || !json.ok) {
        setError(json.error || "Couldn't load feedback.");
        return;
      }
      setRows(json.feedback ?? []);
    } catch {
      setError("Couldn't load feedback.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <Page title="Feedback review" subtitle="Developer-only. Every household's feedback, newest first.">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Chip onClick={() => void load()}>Refresh</Chip>

        {error ? <div className="text-sm text-rose-600">{error}</div> : null}
        {loading ? <div className="text-sm text-zinc-600">Loading…</div> : null}

        {!loading && rows.length === 0 && !error ? (
          <div className="text-sm text-zinc-600">No feedback submitted yet.</div>
        ) : null}

        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id} className="border-zinc-200 bg-white">
              <CardContent className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>{row.email}</span>
                  <span>
                    {row.path} · {softDate(row.created_at)}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-zinc-800">{row.message}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Page>
  );
}
