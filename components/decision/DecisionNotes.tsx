// components/decision/DecisionNotes.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

export type DecisionNotesKind = "thinking" | "decisions" | "revisit" | "chapters";

type NoteRow = {
  id: string;
  user_id: string;
  decision_id: string;
  body: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function softWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString();
}

export function DecisionNotes(props: {
  decisionId: string;
  kind: DecisionNotesKind;
}) {
  const { decisionId } = props;
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [noteId, setNoteId] = useState<string | null>(null);
  const [body, setBody] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const trimmed = useMemo(() => body.trim(), [body]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authErr || !auth?.user) {
        setUserId(null);
        setNoteId(null);
        setBody("");
        setLoading(false);
        return;
      }

      const uid = auth.user.id;
      setUserId(uid);

      const { data, error } = await supabase
        .from("decision_notes")
        .select("id,user_id,decision_id,body,created_at,updated_at")
        .eq("user_id", uid)
        .eq("decision_id", decisionId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!mounted) return;

      if (error) {
        setNoteId(null);
        setBody("");
        setLoading(false);
        return;
      }

      const row = (data ?? [])[0] as NoteRow | undefined;
      setNoteId(row?.id ?? null);
      setBody(safeStr(row?.body));
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [decisionId]);

  const save = async () => {
    if (!userId) {
      showToast({ message: "Not signed in." }, 2000);
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      // If empty, delete existing note (quiet cleanup)
      if (!trimmed) {
        if (noteId) {
          await supabase.from("decision_notes").delete().eq("user_id", userId).eq("id", noteId);
          setNoteId(null);
        }
        showToast({ message: "Saved." }, 1500);
        return;
      }

      if (!noteId) {
        const { data, error } = await supabase
          .from("decision_notes")
          .insert({ user_id: userId, decision_id: decisionId, body: trimmed })
          .select("id")
          .maybeSingle();

        if (error) throw error;
        setNoteId(data?.id ?? null);
        showToast({ message: "Saved." }, 1500);
        return;
      }

      const { error } = await supabase
        .from("decision_notes")
        .update({ body: trimmed, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", noteId);

      if (error) throw error;
      showToast({ message: "Saved." }, 1500);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t save." }, 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900">Notes</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {loading ? "Loading…" : noteId ? `Last updated ${softWhen(new Date().toISOString())}` : "Quiet notes for this decision."}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Chip onClick={() => void save()} title="Save note">
              {saving ? "Saving…" : "Save"}
            </Chip>
          </div>
        </div>

        <div className="mt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note… (optional)"
            className="w-full min-h-[110px] resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
          />
          <div className="mt-2 text-xs text-zinc-500">
            Tip: clearing this will remove the note.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
