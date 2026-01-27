// app/(app)/demo/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

function safeUUID() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {}
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toIsoLocalPlusDays(days: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

type DemoStatus = "loading" | "ready" | "signed_out" | "working" | "done" | "error";

type Counts = {
  accounts: number;
  bills: number;
  income: number;
  inbox: number;
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

  const [counts, setCounts] = useState<Counts>({ accounts: 0, bills: 0, income: 0, inbox: 0 });

  const [confirmText, setConfirmText] = useState("");
  const resetAllowed = useMemo(() => confirmText.trim().toUpperCase() === "RESET", [confirmText]);

  const hasAnyData = useMemo(() => {
    return counts.accounts + counts.bills + counts.income + counts.inbox > 0;
  }, [counts]);

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
    })();

    return () => {
      alive = false;
    };
  }, []);

  async function refreshCounts(uid: string) {
    // Light, safe-ish: best-effort counts. If any fail, we just keep what we have.
    try {
      const [a, b, i, d] = await Promise.all([
        supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("recurring_bills").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("recurring_income").select("id", { count: "exact", head: true }).eq("user_id", uid),
        supabase.from("decision_inbox").select("id", { count: "exact", head: true }).eq("user_id", uid),
      ]);

      setCounts({
        accounts: a.count ?? 0,
        bills: b.count ?? 0,
        income: i.count ?? 0,
        inbox: d.count ?? 0,
      });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!userId) return;
    void refreshCounts(userId);
  }, [userId]);

  async function loadSampleData() {
    if (!userId) return;

    setStatus("working");
    setStatusLine("Loading sample data…");

    const runId = safeUUID();

    try {
      // 1) Accounts
      setStatusLine("Creating accounts…");
      const accountsPayload = [
        {
          user_id: userId,
          name: "Everyday Spending",
          provider: "manual",
          type: "cash",
          status: "active",
          archived: false,
          current_balance_cents: 1250_00,
          currency: "AUD",
        },
        {
          user_id: userId,
          name: "Bills Buffer",
          provider: "manual",
          type: "cash",
          status: "active",
          archived: false,
          current_balance_cents: 600_00,
          currency: "AUD",
        },
      ];
      const aRes = await supabase.from("accounts").insert(accountsPayload as any);
      if (aRes.error) throw aRes.error;

      // 2) Income
      setStatusLine("Creating income…");
      const incomePayload = [
        {
          user_id: userId,
          name: "Wages",
          amount_cents: 2400_00,
          currency: "AUD",
          cadence: "fortnightly",
          next_pay_at: toIsoLocalPlusDays(3, 9, 0),
          active: true,
        },
      ];
      const iRes = await supabase.from("recurring_income").insert(incomePayload as any);
      if (iRes.error) throw iRes.error;

      // 3) Bills
      setStatusLine("Creating bills…");
      const billsPayload = [
        {
          user_id: userId,
          name: "Internet",
          amount_cents: 89_00,
          currency: "AUD",
          cadence: "monthly",
          next_due_at: toIsoLocalPlusDays(4, 9, 0),
          autopay: true,
          active: true,
        },
        {
          user_id: userId,
          name: "Electricity",
          amount_cents: 210_00,
          currency: "AUD",
          cadence: "monthly",
          next_due_at: toIsoLocalPlusDays(9, 9, 0),
          autopay: false,
          active: true,
        },
        {
          user_id: userId,
          name: "Car rego (example)",
          amount_cents: 780_00,
          currency: "AUD",
          cadence: "yearly",
          next_due_at: toIsoLocalPlusDays(20, 9, 0),
          autopay: false,
          active: true,
        },
      ];
      const bRes = await supabase.from("recurring_bills").insert(billsPayload as any);
      if (bRes.error) throw bRes.error;

      // 4) Inbox items
      setStatusLine("Creating a couple of starter items…");
      const inboxPayload = [
        {
          user_id: userId,
          run_id: runId,
          type: "manual",
          title: "Call insurance about renewal",
          body: "Ask about coverage changes + price. Capture the new premium in Bills if it changed.",
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key: `demo:${runId}:manual:1`,
          action_label: null,
          action_href: null,
        },
        {
          user_id: userId,
          run_id: runId,
          type: "manual",
          title: "Review bills due soon",
          body: "Quick check: autopay vs manual. Mark paid where needed.",
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key: `demo:${runId}:manual:2`,
          action_label: "Open Bills",
          action_href: "/bills",
        },
      ];
      const inboxRes = await supabase.from("decision_inbox").insert(inboxPayload as any);
      if (inboxRes.error) throw inboxRes.error;

      setStatus("done");
      setStatusLine("Sample data is ready ✅");
      notify({ title: "Loaded", description: "Sample data added. You can explore now." });

      await refreshCounts(userId);

      // Take them somewhere “alive”
      router.push("/home");
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "Couldn’t load sample data.";
      setStatus("error");
      setStatusLine(msg);
      notify({ title: "Couldn’t load", description: msg });
    } finally {
      // if error, allow retry
      if (status !== "done") setStatus("ready");
    }
  }

  async function clearMyData() {
    if (!userId) return;

    if (!resetAllowed) {
      notify({ title: "Confirmation required", description: 'Type "RESET" to enable.' });
      return;
    }

    setStatus("working");
    setStatusLine("Clearing your data…");

    const steps: { label: string; fn: () => Promise<void> }[] = [
      { label: "Delete bill_payments", fn: async () => void (await supabase.from("bill_payments").delete().eq("user_id", userId)) },
      { label: "Delete recurring_bills", fn: async () => void (await supabase.from("recurring_bills").delete().eq("user_id", userId)) },
      { label: "Delete recurring_income", fn: async () => void (await supabase.from("recurring_income").delete().eq("user_id", userId)) },
      { label: "Delete accounts", fn: async () => void (await supabase.from("accounts").delete().eq("user_id", userId)) },
      {
        label: "Delete decisions (best effort)",
        fn: async () => {
          try {
            await supabase.from("decisions").delete().eq("user_id", userId);
          } catch {}
        },
      },
      { label: "Delete decision_inbox", fn: async () => void (await supabase.from("decision_inbox").delete().eq("user_id", userId)) },
    ];

    try {
      for (const s of steps) {
        setStatusLine(`${s.label}…`);
        await s.fn();
      }

      setConfirmText("");
      setStatus("done");
      setStatusLine("All cleared ✅");
      notify({ title: "Cleared", description: "Your data was removed (user-scoped)." });

      await refreshCounts(userId);
    } catch (e: any) {
      const msg = e?.message ?? "Couldn’t clear data.";
      setStatus("error");
      setStatusLine(msg);
      notify({ title: "Clear failed", description: msg });
    } finally {
      // Allow next action
      setStatus("ready");
    }
  }

  const statusChip =
    status === "working" ? <Chip>Working…</Chip> : status === "done" ? <Chip>Done</Chip> : status === "error" ? <Chip>Error</Chip> : <Chip>Ready</Chip>;

  return (
    <Page title="Demo" subtitle="Load a small, realistic sample so you can explore without typing everything in.">
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
                Current data: {counts.accounts} accounts • {counts.bills} bills • {counts.income} income • {counts.inbox} inbox items
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="font-semibold mb-2">Load sample data</div>
            <div className="text-sm text-zinc-600">
              Adds a small set of accounts, bills, income, and a couple of starter Inbox items. It’s safe, user-scoped, and you can clear it later.
            </div>

            {hasAnyData ? (
              <div className="mt-2 text-xs text-zinc-500">Note: You already have some data. Loading again will add more rows.</div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={loadSampleData} disabled={!userId || status === "working" || status === "loading"}>
                Load sample data
              </Button>
              <Button variant="secondary" onClick={() => router.push("/home")} disabled={!userId}>
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 bg-white">
          <CardContent>
            <div className="font-semibold mb-2">Clear my data</div>
            <div className="text-sm text-zinc-600">
              Deletes only rows belonging to your <code>user_id</code>. Requires explicit confirmation.
            </div>

            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-sm mb-1 opacity-70">Type RESET to enable</div>
                <input
                  className="w-full max-w-[320px] rounded-md border border-zinc-200 px-3 py-2 bg-transparent"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESET"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={clearMyData} disabled={!userId || status === "working" || !resetAllowed}>
                  Clear my data
                </Button>
                {!resetAllowed ? <Chip>Confirmation required</Chip> : <Chip>Enabled</Chip>}
              </div>

              <div className="text-xs text-zinc-500">
                Delete order is chosen to respect likely foreign keys (payments → bills → income → accounts → decisions → inbox).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
