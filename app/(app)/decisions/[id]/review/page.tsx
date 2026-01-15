"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Button, Card, CardContent } from "@/components/ui";

type Decision = {
  id: string;
  title: string;
  context: string | null;
  review_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  review_history: any; // jsonb
};

const OUTCOMES = [
  { value: "better_than_expected", label: "Better than expected" },
  { value: "as_expected", label: "As expected" },
  { value: "worse_than_expected", label: "Worse than expected" },
  { value: "mixed", label: "Mixed / unclear" },
];

export default function DecisionReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<string>("as_expected");
  const [notes, setNotes] = useState<string>("");
  const [confidence, setConfidence] = useState<string>(""); // store as string for easy input

  const confidenceInt = useMemo(() => {
    if (!confidence.trim()) return null;
    const n = Number(confidence);
    if (!Number.isFinite(n)) return null;
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    return clamped;
  }, [confidence]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) return;
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("decisions")
        .select("id,title,context,review_at,reviewed_at,review_notes,review_history")
        .eq("id", id)
        .single();

      if (cancelled) return;

      if (error) {
        setError(error.message || "Could not load decision.");
        setDecision(null);
      } else {
        setDecision(data as Decision);
        setNotes("");
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submitReview() {
    if (!decision) return;

    setSaving(true);
    setError(null);

    const { error } = await supabase.rpc("append_decision_review", {
      p_decision_id: decision.id,
      p_outcome: outcome,
      p_notes: notes,
      p_confidence_level: confidenceInt,
    });

    if (error) {
      setSaving(false);
      setError(error.message || "Could not save review.");
      return;
    }

    router.push("/decisions");
    router.refresh();
  }

  return (
    <Page
      title="Review decision"
      subtitle={
        decision ? (
          <span className="text-zinc-600">
            Reviewing: <span className="font-medium text-zinc-900">{decision.title}</span>
          </span>
        ) : (
          <span className="text-zinc-600">
            Capture what you learned so Keystone gets smarter over time.
          </span>
        )
      }
    >
      <div className="max-w-2xl">
        {loading ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-zinc-600">Loading…</div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-red-600 font-medium">Couldn’t load decision</div>
              <div className="text-zinc-600 mt-1">{error}</div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => router.push("/decisions")}>Back to Decisions</Button>
              </div>
            </CardContent>
          </Card>
        ) : !decision ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-zinc-600">Decision not found.</div>
              <div className="mt-4">
                <Button onClick={() => router.push("/decisions")}>Back to Decisions</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-900">Outcome</label>
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                >
                  {OUTCOMES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-900">
                  Confidence now (0–100) <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <input
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 80"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                />
                <div className="text-xs text-zinc-500">
                  Tip: This helps Keystone learn what “good instincts” look like for you.
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-zinc-900">What did you learn?</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    decision.review_notes
                      ? `Last notes: ${decision.review_notes}`
                      : "Be honest. A few sentences is enough."
                  }
                  className="min-h-[140px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => router.push("/decisions")} disabled={saving}>
                  Cancel
                </Button>

                <Button onClick={submitReview} disabled={saving}>
                  {saving ? "Saving…" : "Save review"}
                </Button>
              </div>

              <div className="text-xs text-zinc-500">
                Reviews are append-only. Keystone keeps your history so patterns can emerge over time.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}
