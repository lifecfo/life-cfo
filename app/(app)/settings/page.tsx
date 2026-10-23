// app/(app)/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Chip, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export default function SettingsPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [aiOptIn, setAiOptIn] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setEmail("");
        setLoaded(true);
        return;
      }

      setEmail(safeStr(data.user.email));
      setLoaded(true);
      const ai = await fetch("/api/settings/ai", { cache: "no-store" });
      const aiJson = (await ai.json().catch(() => null)) as { opted_in?: boolean } | null;
      if (alive) setAiOptIn(aiJson?.opted_in === true);
    })();

    return () => {
      alive = false;
    };
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
    <Page title="Settings" subtitle="Manage your account and important information.">
      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-zinc-900">Account</div>
                <div className="text-sm text-zinc-700">
                  {email ? (
                    <>
                      Signed in as <span className="font-medium text-zinc-900">{email}</span>
                    </>
                  ) : loaded ? (
                    "Not signed in."
                  ) : (
                    "Loading…"
                  )}
                </div>
              </div>
              <div>
                <Button onClick={() => void signOut()} disabled={working || !email}>
                  {working ? "Signing out…" : "Sign out"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Household</div>
              <div className="text-sm text-zinc-700">
                Some information may be shared with people in your household.
              </div>
              <div>
                <Chip onClick={() => router.push("/household")}>Open household</Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Information</div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip onClick={() => router.push("/fine-print")}>Important information</Chip>
                <Chip onClick={() => router.push("/privacy")}>Privacy Policy</Chip>
                <Chip onClick={() => router.push("/terms")}>Terms</Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">AI Ask</div>
              <div className="text-sm leading-6 text-zinc-700">
                AI Ask is off. Life CFO can still list figures, dates, and items you typed without sending them to an AI provider.
                If you turn this on, your question and selected household figures are sent to OpenAI or Anthropic, which may process them outside Australia.
              </div>
              <label className="flex items-start gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={aiOptIn}
                  disabled={aiWorking || !email}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setAiWorking(true);
                    setAiMessage("");
                    void fetch("/api/settings/ai", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ opt_in: next }),
                    })
                      .then(async (response) => {
                        const json = (await response.json().catch(() => ({}))) as { error?: string; opted_in?: boolean };
                        if (!response.ok) throw new Error(json.error || "Couldn't save that choice.");
                        setAiOptIn(json.opted_in === true);
                      })
                      .catch((error: unknown) => {
                        setAiMessage(error instanceof Error ? error.message : "Couldn't save that choice.");
                      })
                      .finally(() => setAiWorking(false));
                  }}
                />
                <span>Turn on AI Ask. I understand this sends information outside Australia.</span>
              </label>
              {aiMessage ? <div className="text-sm text-zinc-600">{aiMessage}</div> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Data and account</div>
              <div className="text-sm text-zinc-700">
                Download a copy of the data your account can read, or delete the account.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  className="inline-flex rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  href="/api/settings/export"
                >
                  Download my data
                </a>
              </div>
              <div>
                <Chip
                  className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                  onClick={() => router.push("/settings/delete")}
                >
                  Delete account
                </Chip>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
