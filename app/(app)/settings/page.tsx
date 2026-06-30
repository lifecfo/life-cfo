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
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-zinc-900">Data and account</div>
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
