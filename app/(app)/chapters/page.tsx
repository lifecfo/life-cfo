// app/(app)/chapters/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button, Badge } from "@/components/ui";
import { AssistedSearch } from "@/components/AssistedSearch";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string | null;
  chaptered_at: string | null;
  created_at: string | null;
  decided_at: string | null;
  status: string | null;
  context: string | null;
};

function softDate(iso?: string | null) {
  const s = (iso || "").trim();
  const ms = Date.parse(s);
  if (!s || Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleDateString();
}

export default function ChaptersPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("Loading…");
  const [rows, setRows] = useState<Row[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const DEFAULT_LIMIT = 5;
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setUserId(data?.user?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function load(uid: string) {
    setStatusLine("Loading…");
    const { data, error } = await supabase
      .from("decisions")
      .select("id,title,chaptered_at,created_at,decided_at,status,context")
      .eq("user_id", uid)
      .eq("status", "chapter")
      .order("chaptered_at", { ascending: false })
      .order("decided_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      setRows([]);
      setStatusLine(`Error: ${error.message}`);
      return;
    }

    const list = (data ?? []) as Row[];
    setRows(list);
    setStatusLine(list.length === 0 ? "Nothing in Chapters yet." : `Loaded ${list.length}.`);
  }

  useEffect(() => {
    if (!userId) return;
    void load(userId);
  }, [userId]);

  const visible = useMemo(() => (showAll ? rows : rows.slice(0, DEFAULT_LIMIT)), [rows, showAll]);
  const hasMore = rows.length > DEFAULT_LIMIT;

  async function restore(id: string) {
    if (!userId) return;
    const { error } = await supabase
      .from("decisions")
      .update({ status: "decided", chaptered_at: null })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "chapter");

    if (error) {
      setStatusLine(`Couldn’t restore: ${error.message}`);
      return;
    }

    setStatusLine("Restored to Decisions.");
    await load(userId);
  }

  return (
    <Page
      title="Chapters"
      subtitle="Finished decisions you don’t want resurfacing."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/money")}>Money</Chip>
          <Chip onClick={() => router.push("/decisions?tab=active")}>Decisions</Chip>
          <Button onClick={() => router.push("/decisions?tab=new")} className="rounded-2xl">
            New decision
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <AssistedSearch scope="chapters" placeholder="Search chapters…" />
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {hasMore ? (
          <div className="flex items-center gap-2">
            <Chip onClick={() => setShowAll((v) => !v)}>{showAll ? "Show less" : "Show all"}</Chip>
            {!showAll ? <div className="text-xs text-zinc-500">Showing {DEFAULT_LIMIT} of {rows.length}</div> : null}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing here yet.</div>
                <div className="text-sm text-zinc-600">When a decision is truly finished, move it here.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visible.map((r) => {
              const isOpen = openId === r.id;
              const title = (r.title || "").trim() || "Untitled decision";
              const when = r.chaptered_at ? softDate(r.chaptered_at) : softDate(r.decided_at || r.created_at);

              return (
                <Card key={r.id} className="border-zinc-200 bg-white">
                  <CardContent>
                    <button type="button" onClick={() => setOpenId(isOpen ? null : r.id)} className="w-full text-left">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-semibold text-zinc-900">{title}</div>
                          <div className="mt-1 text-xs text-zinc-500">Chaptered: {when}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge>{isOpen ? "Open" : "Closed"}</Badge>
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-4 space-y-3">
                        {r.context ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{r.context}</div>
                        ) : (
                          <div className="text-sm text-zinc-600">No extra context saved.</div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Chip onClick={() => void restore(r.id)} title="Move back to Decisions">
                            Restore
                          </Chip>
                          <Chip onClick={() => setOpenId(null)} title="Close">
                            Done
                          </Chip>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}
