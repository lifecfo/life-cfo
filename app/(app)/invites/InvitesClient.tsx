// app/(app)/invites/InvitesClient.tsx
"use client";

import { useEffect, useState } from "react";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, useToast } from "@/components/ui";

type InviteItem = {
  id: string;
  household_id: string;
  household_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

export const dynamic = "force-dynamic";

export default function InvitesClient() {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState("Loading…");
  const [invites, setInvites] = useState<InviteItem[]>([]);

  const load = async () => {
    setLoading(true);
    setStatusLine("Loading…");
    try {
      const res = await fetch("/api/households/invites", { method: "GET" });
      const json = await res.json();

      if (!json?.ok) {
        setInvites([]);
        setStatusLine("Not signed in.");
        return;
      }

      setInvites(Array.isArray(json.invites) ? json.invites : []);
      setStatusLine("Updated.");
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t load invites." }, 2500);
      setStatusLine("Couldn’t load right now.");
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id: string, action: "accept" | "decline") => {
    try {
      const res = await fetch("/api/households/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Update failed");

      if (action === "accept" && json?.household_id) {
        await fetch("/api/households/active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ household_id: json.household_id }),
        }).catch(() => null);
      }

      setStatusLine(action === "accept" ? "Accepted." : "Declined.");
      await load();
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t update invite." }, 2500);
    }
  };

  return (
    <Page title="Invites" subtitle="Accept or decline household invites.">
      <div className="mx-auto w-full max-w-[760px] space-y-6">
        <div className="text-xs text-zinc-500">{loading ? "Loading…" : statusLine}</div>

        <Card className="border-zinc-200 bg-white">
          <CardContent className="space-y-3">
            {invites.length === 0 ? (
              <div className="text-sm text-zinc-600">No invites right now.</div>
            ) : (
              <div className="grid gap-2">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900">{inv.household_name}</div>
                      <div className="text-xs text-zinc-500">Role: {inv.role}</div>
                      <div className="text-xs text-zinc-500">Sent to: {inv.email}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Chip onClick={() => void act(inv.id, "decline")}>Decline</Chip>
                      <Chip
                        className="border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                        onClick={() => void act(inv.id, "accept")}
                      >
                        Accept
                      </Chip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}