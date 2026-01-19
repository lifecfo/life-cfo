// app/(app)/capture/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type Severity = 1 | 2 | 3;

function safeUUID() {
  try {
    // modern browsers
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {
    // ignore
  }
  // fallback
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function CapturePage() {
  const toastApi: any = useToast();
  const showToast =
    toastApi?.showToast ??
    ((args: any) => {
      if (toastApi?.toast) {
        toastApi.toast({
          title: args?.title ?? "Done",
          description: args?.description ?? args?.message ?? "",
          variant: args?.variant,
          action: args?.action,
        });
      }
    });

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<Severity>(2);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        setError("Not signed in.");
        setUserId(null);
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      setLoading(false);
    })();
  }, []);

  const canSave = useMemo(() => {
    return !!userId && title.trim().length > 0 && !saving;
  }, [userId, title, saving]);

  async function createInboxItem() {
    if (!userId) return;

    const t = title.trim();
    const b = body.trim();
    if (!t) {
      notify({ title: "Capture", description: "Please enter a title." });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const runId = safeUUID();

      // IMPORTANT: your schema has dedupe_key NOT NULL.
      // For manual items we use a unique dedupe key that will never collide with Engine.
      const dedupe_key = `manual:${runId}`;

      const { error: insErr } = await supabase.from("decision_inbox").insert({
        user_id: userId,
        run_id: runId,
        type: "manual",
        title: t,
        body: b ? b : null,
        severity,
        status: "open",
        snoozed_until: null,

        dedupe_key,

        action_label: null,
        action_href: null,
      } as any);

      if (insErr) throw insErr;

      setTitle("");
      setBody("");
      setSeverity(2);

      notify({ title: "Captured", description: "Added to Inbox." });
    } catch (e: any) {
      const msg = e?.message ?? "Failed to capture.";
      setError(msg);
      notify({ title: "Error", description: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Capture" subtitle="A calm place to record something for your Inbox. No nudges, no loops.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {userId ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
                {error ? <Chip>{error}</Chip> : null}
              </div>
              <div className="flex items-center gap-2">
                <Chip>Manual capture</Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">New Inbox item</div>

            <div className="grid gap-3">
              <div>
                <div className="text-sm mb-1 opacity-70">Title</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  placeholder="What needs attention?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm mb-1 opacity-70">Notes (optional)</div>
                <textarea
                  className="w-full min-h-[120px] rounded-md border px-3 py-2 bg-transparent"
                  placeholder="Context you don’t want to lose."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm opacity-70">Severity</div>
                  <select
                    className="rounded-md border px-3 py-2 bg-transparent"
                    value={String(severity)}
                    onChange={(e) => setSeverity(Number(e.target.value) as Severity)}
                  >
                    <option value="1">1 — Low</option>
                    <option value="2">2 — Normal</option>
                    <option value="3">3 — High</option>
                  </select>
                  <Chip>{severity === 3 ? "High signal" : severity === 2 ? "Normal" : "Low signal"}</Chip>
                </div>

                <Button onClick={createInboxItem} disabled={!canSave}>
                  {saving ? "Saving…" : "Add to Inbox"}
                </Button>
              </div>

              <div className="text-xs text-zinc-500">
                Tip: capture fast here, then decide in Inbox. Manual items use unique dedupe keys (never collide with Engine).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
