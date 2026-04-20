// app/(app)/demo/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type DemoStatus = "loading" | "ready" | "signed_out" | "working" | "done" | "error";

type SeedRunRow = {
  user_id: string;
  dataset_version: string;
  run_id: string;
  created_ids: Record<string, string[]>;
  created_at: string;
  updated_at: string;
};

export const dynamic = "force-dynamic";

export default function DemoPage() {
  const router = useRouter();

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
    showToast({ title: opts.title, description: opts.description });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<DemoStatus>("loading");
  const [statusLine, setStatusLine] = useState<string>("");

  const [seedRun, setSeedRun] = useState<SeedRunRow | null>(null);

  const hasSeeded = useMemo(() => {
    const ids = seedRun?.created_ids ?? {};
    const total = Object.values(ids).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    return total > 0;
  }, [seedRun]);

  const totalSeededCount = useMemo(() => {
    const ids = seedRun?.created_ids ?? {};
    return Object.values(ids).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
  }, [seedRun]);

  async function refreshSeedRun(uid: string) {
    const res = await supabase.from("demo_seed_runs").select("*").eq("user_id", uid).single();
    if (res.error) {
      setSeedRun(null);
      return;
    }
    setSeedRun(res.data as SeedRunRow);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("loading");
      setStatusLine("");

      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        setStatus("signed_out");
        setStatusLine("Please sign in.");
        return;
      }

      setUserId(data.user.id);
      setStatus("ready");
      await refreshSeedRun(data.user.id);
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function goSeedPage() {
    router.push("/seed");
  }

  async function goHome() {
    router.push("/home");
    router.refresh();
  }

  const statusChip =
    status === "working" ? <Chip>Working…</Chip> : status === "done" ? <Chip>Done</Chip> : status === "error" ? <Chip>Error</Chip> : <Chip>Ready</Chip>;

  return (
    <Page title="Demo" subtitle="One place for testers to make Keystone feel alive immediately.">
      <div className="grid gap-4">
        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {statusChip}
                {userId ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
                {statusLine ? <Chip>{statusLine}</Chip> : null}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip>Route: /demo</Chip>
              </div>
            </div>

            {userId ? (
              <div className="mt-3 text-xs text-zinc-600">
                Demo seed: {hasSeeded ? "present" : "none"} • Tracked seeded rows: {totalSeededCount}
              </div>
            ) : (
              <div className="mt-3 text-xs text-zinc-600">Sign in to load demo data.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="font-semibold mb-2">Make the app feel alive</div>
            <div className="text-sm text-zinc-600">
              The full demo dataset lives in <code>/seed</code> so it can be safely reset and never duplicates.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={goSeedPage} disabled={!userId || status === "working" || status === "loading"}>
                Open Seed / Reset
              </Button>
              <Button variant="secondary" onClick={goHome} disabled={!userId}>
                Go to Home
              </Button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              If the seed buttons fail, run the <code>demo_seed_runs</code> SQL (shared in chat) then refresh.
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="font-semibold mb-2">Tester quick-start</div>
            <div className="text-sm text-zinc-600">
              After seeding: explore Money → Accounts/Transactions/Goals/Bills, then Decide → Decisions/Review/Chapters, then Active Decisions.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push("/accounts")} disabled={!userId}>
                Accounts
              </Button>
              <Button variant="secondary" onClick={() => router.push("/transactions")} disabled={!userId}>
                Transactions
              </Button>
              <Button variant="secondary" onClick={() => router.push("/goals")} disabled={!userId}>
                Goals
              </Button>
              <Button variant="secondary" onClick={() => router.push("/bills")} disabled={!userId}>
                Bills
              </Button>
              <Button variant="secondary" onClick={() => router.push("/decisions")} disabled={!userId}>
                Decisions
              </Button>
              <Button variant="secondary" onClick={() => router.push("/review")} disabled={!userId}>
                Review
              </Button>
              <Button variant="secondary" onClick={() => router.push("/chapters")} disabled={!userId}>
                Chapters
              </Button>
              <Button variant="secondary" onClick={() => router.push("/decisions?tab=active")} disabled={!userId}>Active Decisions</Button>
              <Button variant="secondary" onClick={() => router.push("/family")} disabled={!userId}>
                Family
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

