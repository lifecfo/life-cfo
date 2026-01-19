// app/(app)/seed/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

function safeUUID() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return (crypto as any).randomUUID();
  } catch {
    // ignore
  }
  return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toIsoLocalPlusDays(days: number, hour = 9, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

type SeedStatus = "idle" | "working" | "done" | "error";

export default function SeedPage() {
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

  const [status, setStatus] = useState<SeedStatus>("idle");
  const [statusLine, setStatusLine] = useState<string>("");

  const [confirmText, setConfirmText] = useState("");
  const resetAllowed = useMemo(() => confirmText.trim().toUpperCase() === "RESET", [confirmText]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatusLine("");
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setUserId(null);
        setLoading(false);
        setStatusLine("Not signed in.");
        return;
      }
      setUserId(data.user.id);
      setLoading(false);
    })();
  }, []);

  async function runReset() {
    if (!userId) return;
    if (!resetAllowed) {
      notify({ title: "Reset blocked", description: 'Type "RESET" to enable.' });
      return;
    }

    setStatus("working");
    setStatusLine("Resetting your data…");

    // Order matters if foreign keys exist:
    // bill_payments -> recurring_bills -> recurring_income -> accounts -> decisions -> inbox
    // (We also try decisions, but if your schema blocks, we skip with best-effort.)
    const steps: { label: string; fn: () => Promise<void> }[] = [
      {
        label: "Delete bill_payments",
        fn: async () => {
          await supabase.from("bill_payments").delete().eq("user_id", userId);
        },
      },
      {
        label: "Delete recurring_bills",
        fn: async () => {
          await supabase.from("recurring_bills").delete().eq("user_id", userId);
        },
      },
      {
        label: "Delete recurring_income",
        fn: async () => {
          await supabase.from("recurring_income").delete().eq("user_id", userId);
        },
      },
      {
        label: "Delete accounts",
        fn: async () => {
          await supabase.from("accounts").delete().eq("user_id", userId);
        },
      },
      {
        label: "Delete decisions (best effort)",
        fn: async () => {
          // If decisions table or policies ever block deletes, we won’t fail the whole reset.
          try {
            await supabase.from("decisions").delete().eq("user_id", userId);
          } catch {
            // ignore
          }
        },
      },
      {
        label: "Delete decision_inbox",
        fn: async () => {
          await supabase.from("decision_inbox").delete().eq("user_id", userId);
        },
      },
    ];

    try {
      for (const s of steps) {
        setStatusLine(`${s.label}…`);
        const res = await s.fn();
        void res;
      }

      setConfirmText("");
      setStatus("done");
      setStatusLine("Reset complete ✅");
      notify({ title: "Reset complete", description: "Your test data was cleared." });
    } catch (e: any) {
      const msg = e?.message ?? "Reset failed.";
      setStatus("error");
      setStatusLine(msg);
      notify({ title: "Reset failed", description: msg });
    }
  }

  async function runSeed() {
    if (!userId) return;

    setStatus("working");
    setStatusLine("Seeding demo data…");

    const runId = safeUUID();

    try {
      // 1) Accounts
      setStatusLine("Seeding accounts…");
      const accountsPayload = [
        {
          user_id: userId,
          name: "Everyday Spending",
          current_balance_cents: 1250_00,
          currency: "AUD",
        },
        {
          user_id: userId,
          name: "Bills Buffer",
          current_balance_cents: 600_00,
          currency: "AUD",
        },
      ];

      const aRes = await supabase.from("accounts").insert(accountsPayload as any);
      if (aRes.error) throw aRes.error;

      // 2) Income
      setStatusLine("Seeding income…");
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
      setStatusLine("Seeding bills…");
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

      // 4) Inbox items (manual) — MUST include non-null dedupe_key
      setStatusLine("Seeding inbox items…");
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
          dedupe_key: `seed:${runId}:manual:1`,
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
          dedupe_key: `seed:${runId}:manual:2`,
          action_label: "Open Bills",
          action_href: "/bills",
        },
      ];

      const inboxRes = await supabase.from("decision_inbox").insert(inboxPayload as any);
      if (inboxRes.error) throw inboxRes.error;

      setStatus("done");
      setStatusLine("Seed complete ✅");
      notify({ title: "Seed complete", description: "Demo data added (accounts, income, bills, inbox items)." });
    } catch (e: any) {
      const msg = e?.message ?? "Seed failed.";
      setStatus("error");
      setStatusLine(msg);
      notify({ title: "Seed failed", description: msg });
    }
  }

  async function runSeedThenEngine() {
    if (!userId) return;

    // We keep this page calm and structural — so we don’t run Engine automatically.
    // Instead we seed and then route you to Engine where you can explicitly click Run.
    await runSeed();
    notify({ title: "Next step", description: "Go to Engine and click Run v1 / v2 when you want." });
  }

  const statusChip =
    status === "working" ? (
      <Chip>Working…</Chip>
    ) : status === "done" ? (
      <Chip>Done</Chip>
    ) : status === "error" ? (
      <Chip>Error</Chip>
    ) : (
      <Chip>Idle</Chip>
    );

  return (
    <Page
      title="Seed / Reset"
      subtitle="Testing harness. Creates repeatable demo data or clears only your own rows. Hidden from navigation by default."
    >
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {userId ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
                {statusChip}
                {statusLine ? <Chip>{statusLine}</Chip> : null}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip>Route: /seed</Chip>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Seed demo data</div>
            <div className="text-sm text-zinc-600">
              Adds a small, realistic dataset (accounts, income, bills, and a couple Inbox items). Safe to run multiple
              times (you’ll just get more rows).
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={runSeed} disabled={!userId || loading || status === "working"}>
                Seed demo data
              </Button>
              <Button variant="secondary" onClick={runSeedThenEngine} disabled={!userId || loading || status === "working"}>
                Seed + go run Engine manually
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Reset my data (destructive)</div>
            <div className="text-sm text-zinc-600">
              Deletes only rows belonging to your <code>user_id</code> across the V1 tables. Requires explicit typed
              confirmation.
            </div>

            <div className="mt-3 grid gap-3">
              <div>
                <div className="text-sm mb-1 opacity-70">Type RESET to enable</div>
                <input
                  className="w-full max-w-[320px] rounded-md border px-3 py-2 bg-transparent"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESET"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={runReset} disabled={!userId || loading || status === "working" || !resetAllowed}>
                  Reset my data
                </Button>
                {!resetAllowed ? <Chip>Confirmation required</Chip> : <Chip>Enabled</Chip>}
              </div>

              <div className="text-xs text-zinc-500">
                Note: Reset order is chosen to respect likely foreign keys (payments → bills → income → accounts → decisions → inbox).
                If a table blocks deletion via policy, the reset will stop and show the error.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
