// app/(app)/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

type LiveState = "checking" | "ready" | "offline";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

function shortId(id: string) {
  if (!id) return "";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function SettingsPage() {
  const router = useRouter();

  const [live, setLive] = useState<LiveState>("checking");
  const [statusLine, setStatusLine] = useState("Loading…");
  const [email, setEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLive("checking");
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setLive("offline");
        setStatusLine("Not signed in.");
        setEmail("");
        setUserId("");
        return;
      }

      setEmail(safeStr(data.user.email));
      setUserId(safeStr(data.user.id));
      setLive("ready");
      setStatusLine("Loaded.");
    })();

    return () => {
      alive = false;
    };
  }, []);

  const liveChipClass =
    live === "ready"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
      : live === "offline"
      ? "border border-rose-200 bg-rose-50 text-rose-700"
      : "border border-zinc-200 bg-zinc-50 text-zinc-700";

  const versionLabel = useMemo(() => {
    // Client-safe: NEXT_PUBLIC_* is baked into the bundle at build time
    return process.env.NEXT_PUBLIC_APP_VERSION || "—";
  }, []);

  const signOut = async () => {
    if (working) return;
    setWorking(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Page
      title="Settings"
      subtitle="Quiet controls and trust."
      right={
        <div className="flex items-center gap-2">
          <Chip className={liveChipClass}>{live === "ready" ? "Online" : live === "offline" ? "Offline" : "Checking"}</Chip>
          <Chip onClick={() => router.push("/home")}>Back to Home</Chip>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <div className="text-xs text-zinc-500">{statusLine}</div>

        {/* Account */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Account</div>

                <div className="text-sm text-zinc-700">
                  {email ? (
                    <>
                      Signed in as <span className="font-medium text-zinc-900">{email}</span>
                    </>
                  ) : (
                    "Not signed in."
                  )}
                </div>

                {userId ? (
                  <div className="text-xs text-zinc-500">
                    User ID: <span className="font-mono">{shortId(userId)}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void signOut()} disabled={working || live !== "ready"}>
                  {working ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trust & boundaries */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Trust</div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">What Keystone stores</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                    <li>Decisions you save</li>
                    <li>Inputs you enter (accounts, bills, income, budget)</li>
                    <li>Attachments you upload</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <div className="text-xs font-semibold text-zinc-700">What Keystone never does</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                    <li>No auto-decisions</li>
                    <li>No saving without your action</li>
                    <li>No sharing your data with other users</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="text-xs font-semibold text-zinc-700">AI boundaries</div>
                <div className="mt-1 text-sm text-zinc-700">
                  AI helps when you ask. It doesn’t act on your behalf, make decisions, or save anything unless you choose.
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  V1 stays intentionally quiet. Advanced controls only ship if they reduce cognitive load.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Chip onClick={() => router.push("/how-keystone-works")} title="How Keystone works">
                  How it works
                </Chip>
                <Chip onClick={() => router.push("/fine-print")} title="Read the fine print">
                  Fine print
                </Chip>

                <Chip
                  className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  onClick={() => router.push("/settings/delete")}
                  title="Permanently delete your account"
                >
                  Delete account
                </Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-zinc-500">Version: {versionLabel}</div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip onClick={() => router.push("/home")}>Home</Chip>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
