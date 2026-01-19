// app/(app)/lab/page.tsx
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

function cents(n: number) {
  return Math.round(n * 100);
}

export default function LabPage() {
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setStatus("");

      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setUserId(null);
        setStatus("Not signed in.");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      setLoading(false);
    })();
  }, []);

  const canReset = useMemo(() => !!userId && confirmText.trim().toUpperCase() === "RESET" && !busy, [userId, confirmText, busy]);
  const canSeed = useMemo(() => !!userId && !busy, [userId, busy]);

  async function resetMyData() {
    if (!userId) return;
    if (confirmText.trim().toUpperCase() !== "RESET") {
      notify({ title: "Reset blocked", description: 'Type "RESET" to confirm.' });
      return;
    }

    setBusy(true);
    setStatus("Resetting…");

    try {
      // Delete in FK-safe order
      // 1) bill_payments depends on recurring_bills
      const p1 = await supabase.from("bill_payments").delete().eq("user_id", userId);
      if (p1.error) throw p1.error;

      // 2) decisions may reference inbox items (inbox_item_id)
      const p2 = await supabase.from("decisions").delete().eq("user_id", userId);
      if (p2.error) throw p2.error;

      // 3) inbox items
      const p3 = await supabase.from("decision_inbox").delete().eq("user_id", userId);
      if (p3.error) throw p3.error;

      // 4) income
      const p4 = await supabase.from("recurring_income").delete().eq("user_id", userId);
      if (p4.error) throw p4.error;

      // 5) bills
      const p5 = await supabase.from("recurring_bills").delete().eq("user_id", userId);
      if (p5.error) throw p5.error;

      // 6) accounts
      const p6 = await supabase.from("accounts").delete().eq("user_id", userId);
      if (p6.error) throw p6.error;

      setConfirmText("");
      setStatus("Reset complete ✅");
      notify({ title: "Reset complete", description: "Your Keystone data has been cleared." });
    } catch (e: any) {
      const msg = e?.message ?? "Reset failed.";
      setStatus(msg);
      notify({ title: "Reset failed", description: msg });
    } finally {
      setBusy(false);
    }
  }

  async function seedDemoData() {
    if (!userId) return;

    setBusy(true);
    setStatus("Seeding demo data…");

    try {
      const now = new Date();
      const isoInDays = (d: number) => {
        const x = new Date(now);
        x.setDate(x.getDate() + d);
        x.setHours(9, 0, 0, 0);
        return x.toISOString();
      };

      // 1) accounts
      const a1 = await supabase.from("accounts").insert([
        { user_id: userId, name: "Everyday Spending", current_balance_cents: cents(1250), currency: "AUD" },
        { user_id: userId, name: "Bills Buffer", current_balance_cents: cents(600), currency: "AUD" },
      ]);
      if (a1.error) throw a1.error;

      // 2) income
      const i1 = await supabase.from("recurring_income").insert([
        { user_id: userId, name: "Wages", amount_cents: cents(2400), currency: "AUD", cadence: "fortnightly", next_pay_at: isoInDays(5), active: true },
        { user_id: userId, name: "Family benefit", amount_cents: cents(320), currency: "AUD", cadence: "fortnightly", next_pay_at: isoInDays(12), active: true },
      ]);
      if (i1.error) throw i1.error;

      // 3) bills
      const b1 = await supabase
        .from("recurring_bills")
        .insert([
          { user_id: userId, name: "Internet", amount_cents: cents(89), currency: "AUD", cadence: "monthly", next_due_at: isoInDays(3), autopay: true, active: true },
          { user_id: userId, name: "Mobile", amount_cents: cents(55), currency: "AUD", cadence: "monthly", next_due_at: isoInDays(8), autopay: false, active: true },
          { user_id: userId, name: "Insurance", amount_cents: cents(140), currency: "AUD", cadence: "monthly", next_due_at: isoInDays(13), autopay: true, active: true },
        ])
        .select("id");
      if (b1.error) throw b1.error;

      // 4) inbox items (manual capture style)
      const runId = safeUUID();
      const inboxRows = [
        {
          user_id: userId,
          run_id: runId,
          type: "manual",
          title: "Confirm credit card repayment cadence",
          body: "Work out minimum repayment vs best cadence to reduce fees/interest. Decide weekly vs fortnightly transfer.",
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key: `manual:${safeUUID()}`,
          action_label: null,
          action_href: null,
        },
        {
          user_id: userId,
          run_id: runId,
          type: "manual",
          title: "Set autopay rule for Mobile if appropriate",
          body: "If it’s safe, turn on autopay. If not, keep manual and set reminder.",
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key: `manual:${safeUUID()}`,
          action_label: "Open Bills",
          action_href: "/bills",
        },
      ];

      const d1 = await supabase.from("decision_inbox").insert(inboxRows as any);
      if (d1.error) throw d1.error;

      setStatus("Seed complete ✅");
      notify({ title: "Seeded", description: "Demo accounts, bills, income, and Inbox items created." });
    } catch (e: any) {
      const msg = e?.message ?? "Seed failed.";
      setStatus(msg);
      notify({ title: "Seed failed", description: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Lab" subtitle="Internal V1 test harness. Seed and reset your own data (explicitly).">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {userId ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
                {status ? <Chip>{status}</Chip> : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => notify({ title: "Tip", description: "Use Reset → Seed → Run Engine → Inbox → Decide → Bills." })}>
                  Testing tip
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Seed demo data</div>
            <div className="text-sm text-zinc-600">
              Creates a small set of accounts, recurring bills, recurring income, and a couple of manual Inbox items.
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Button onClick={seedDemoData} disabled={!canSeed}>
                {busy ? "Working…" : "Seed demo data"}
              </Button>
              <Chip>Safe: user-scoped inserts only</Chip>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Reset my Keystone data</div>
            <div className="text-sm text-zinc-600">
              Deletes only <span className="font-semibold">your</span> rows from Keystone tables. Requires explicit confirmation.
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-6">
              <div className="md:col-span-3">
                <div className="text-sm mb-1 opacity-70">Type RESET to confirm</div>
                <input
                  className="w-full rounded-md border px-3 py-2 bg-transparent"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESET"
                />
              </div>

              <div className="md:col-span-3 flex items-end justify-end gap-2 flex-wrap">
                <Button onClick={resetMyData} disabled={!canReset}>
                  {busy ? "Working…" : "Reset my data"}
                </Button>
                <Chip className="border border-rose-200 bg-rose-50 text-rose-700">Destructive</Chip>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
