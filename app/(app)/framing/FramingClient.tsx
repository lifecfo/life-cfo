"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type InboxItem = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string | null;
  framed_decision_id: string | null;
};

export default function FramingClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<string>("Loading…");

  const [items, setItems] = useState<InboxItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(() => items.find((x) => x.id === activeId) ?? null, [items, activeId]);

  const [decisionTitle, setDecisionTitle] = useState<string>("");
  const [decisionStatement, setDecisionStatement] = useState<string>("");

  // Load unframed captured items
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!mounted) return;

      if (authError || !auth?.user) {
        setUserId(null);
        setItems([]);
        setStatusLine("Not signed in.");
        return;
      }

      setUserId(auth.user.id);

      // Pull only unframed captured items (Capture/Home/Engine can all feed here)
      const { data, error } = await supabase
        .from("decision_inbox")
        .select("id,user_id,type,title,body,status,created_at,framed_decision_id")
        .eq("user_id", auth.user.id)
        .is("framed_decision_id", null)
        .neq("status", "done")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!mounted) return;

      if (error) {
        setItems([]);
        setStatusLine(`Error: ${error.message}`);
        return;
      }

      const list = (data ?? []) as InboxItem[];
      setItems(list);
      setStatusLine(list.length === 0 ? "Nothing to frame right now." : "Ready.");

      const first = list[0]?.id ?? null;
      setActiveId(first);

      const firstItem = list[0] ?? null;
      const seed = firstItem?.title?.trim() || firstItem?.body?.trim() || "";
      setDecisionTitle(seed.slice(0, 120));
      setDecisionStatement(seed.slice(0, 200));
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // When active item changes, seed fields
  useEffect(() => {
    if (!active) return;
    const seed = active.title?.trim() || active.body?.trim() || "";
    setDecisionTitle(seed.slice(0, 120));
    setDecisionStatement(seed.slice(0, 200));
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const markIgnored = async (it: InboxItem) => {
    if (!userId) return;

    // Minimal: mark as done so it stops resurfacing (you can introduce a better status later)
    const { error } = await supabase
      .from("decision_inbox")
      .update({ status: "done" })
      .eq("id", it.id)
      .eq("user_id", userId);

    if (error) {
      showToast({ message: `Couldn’t update: ${error.message}` }, 3500);
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== it.id));
    setActiveId((cur) => {
      if (cur !== it.id) return cur;
      const next = items.find((x) => x.id !== it.id)?.id ?? null;
      return next;
    });

    showToast({ message: "Okay — not a decision." }, 2500);
  };

  const sendToThinking = async (it: InboxItem) => {
    if (!userId) return;

    const t = decisionTitle.trim();
    if (!t) {
      showToast({ message: "Add a short decision title first." }, 3000);
      return;
    }

    const contextPieces: string[] = [];
    if (decisionStatement.trim() && decisionStatement.trim() !== t) {
      contextPieces.push(`Decision statement:\n${decisionStatement.trim()}`);
    }
    if (it.body?.trim()) {
      contextPieces.push(`Captured:\n${it.body.trim()}`);
    }

    const context = contextPieces.length ? contextPieces.join("\n\n") : null;

    // 1) Create draft decision
    const { data: created, error: createErr } = await supabase
      .from("decisions")
      .insert({
        user_id: userId,
        title: t,
        context,
        status: "draft",
        // Optional: keep origin link if you already have this column in decisions
        // inbox_item_id: it.id,
      })
      .select("id")
      .single();

    if (createErr || !created?.id) {
      showToast({ message: `Couldn’t create draft: ${createErr?.message ?? "Unknown error"}` }, 4000);
      return;
    }

    // 2) Mark inbox item as framed + linked
    const { error: linkErr } = await supabase
      .from("decision_inbox")
      .update({ framed_decision_id: created.id, status: "done" })
      .eq("id", it.id)
      .eq("user_id", userId);

    if (linkErr) {
      showToast({ message: `Draft created, but couldn’t link: ${linkErr.message}` }, 4500);
      return;
    }

    // Local UI remove + advance
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    setActiveId((cur) => {
      if (cur !== it.id) return cur;
      const remaining = items.filter((x) => x.id !== it.id);
      return remaining[0]?.id ?? null;
    });

    showToast({ message: "Sent to Thinking." }, 2500);
  };

  return (
    <Page
      title="Framing"
      subtitle="Turn raw capture into a clear draft — only if it’s truly a decision."
      right={
        <div className="flex items-center gap-2">
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
          <Chip onClick={() => router.push("/thinking")}>Go to Thinking</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {!active ? (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Nothing to frame.</div>
                <div className="text-sm text-zinc-600">When you capture something that needs shaping, it will wait here quietly.</div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-zinc-200 bg-white">
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-700">Captured</div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
                    {active.body ?? active.title}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Decision title</div>
                  <input
                    value={decisionTitle}
                    onChange={(e) => setDecisionTitle(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    placeholder="What decision is this, really?"
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-zinc-700">Decision statement (optional)</div>
                  <textarea
                    value={decisionStatement}
                    onChange={(e) => setDecisionStatement(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
                    placeholder="Make it crisp (you can refine later in Thinking)…"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Chip onClick={() => sendToThinking(active)} title="Create a draft decision in Thinking">
                    Send to Thinking
                  </Chip>
                  <Chip onClick={() => markIgnored(active)} title="This isn’t a decision; stop resurfacing it">
                    Not a decision
                  </Chip>
                  <Chip onClick={() => router.push("/home")} title="Put this down for now">
                    Put this down
                  </Chip>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Page>
  );
}
