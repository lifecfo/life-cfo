"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

type RecurringBill = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_due_at: string;
  autopay: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type RecurringIncome = {
  id: string;
  user_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  cadence: Cadence;
  next_pay_at: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

function formatMoneyFromCents(cents: number, currency = "AUD") {
  const value = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function sumCents(items: { amount_cents: number }[]) {
  return items.reduce((acc, x) => acc + (x.amount_cents || 0), 0);
}

type ComputedTotals = {
  balance: number;

  bills7: RecurringBill[];
  bills14: RecurringBill[];
  bills30: RecurringBill[];

  income7: RecurringIncome[];
  income14: RecurringIncome[];
  income30: RecurringIncome[];

  bills7Total: number;
  bills14Total: number;
  bills30Total: number;

  income7Total: number;
  income14Total: number;
  income30Total: number;

  safeToSpendWeek: number;
};

function computeTotals(accounts: Account[], bills: RecurringBill[], income: RecurringIncome[]): ComputedTotals {
  const activeBills = bills.filter((b) => b.active);
  const activeIncome = income.filter((i) => i.active);

  const balance = accounts.reduce((acc, a) => acc + (a.current_balance_cents || 0), 0);

  const now = new Date();
  const t7 = daysFromNow(7).getTime();
  const t14 = daysFromNow(14).getTime();
  const t30 = daysFromNow(30).getTime();

  const dueIn = (iso: string, toMs: number) => {
    const ms = new Date(iso).getTime();
    return ms >= now.getTime() && ms <= toMs;
  };

  const bills7 = activeBills.filter((b) => dueIn(b.next_due_at, t7));
  const bills14 = activeBills.filter((b) => dueIn(b.next_due_at, t14));
  const bills30 = activeBills.filter((b) => dueIn(b.next_due_at, t30));

  const income7 = activeIncome.filter((i) => dueIn(i.next_pay_at, t7));
  const income14 = activeIncome.filter((i) => dueIn(i.next_pay_at, t14));
  const income30 = activeIncome.filter((i) => dueIn(i.next_pay_at, t30));

  const bills7Total = sumCents(bills7);
  const bills14Total = sumCents(bills14);
  const bills30Total = sumCents(bills30);

  const income7Total = sumCents(income7);
  const income14Total = sumCents(income14);
  const income30Total = sumCents(income30);

  // v1 safe-to-spend: simple + truthful, no forecasting
  const safeToSpendWeek = Math.max(0, balance + income7Total - bills7Total);

  return {
    balance,
    bills7,
    bills14,
    bills30,
    income7,
    income14,
    income30,
    bills7Total,
    bills14Total,
    bills30Total,
    income7Total,
    income14Total,
    income30Total,
    safeToSpendWeek,
  };
}

export default function EnginePage() {
  const { showToast } = useToast();

  const notify = (opts: { title?: string; description?: string }) => {
    const msg = [opts.title, opts.description].filter(Boolean).join(" — ");
    showToast({ message: msg || "Done." });
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<RecurringBill[]>([]);
  const [income, setIncome] = useState<RecurringIncome[]>([]);

  // Step 1: last ran indicator (local-only)
  const [lastRanAt, setLastRanAt] = useState<string | null>(null);

  // Step 2: cooldown (local-only)
  const COOLDOWN_MS = 10_000;
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr || !data.user) {
        setError("Not signed in.");
        setLoading(false);
        return;
      }

      setUserId(data.user.id);
      await loadAll(data.user.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll(uid: string) {
    const [aRes, bRes, iRes] = await Promise.all([
      supabase.from("accounts").select("*").eq("user_id", uid).order("created_at", { ascending: true }),
      supabase
        .from("recurring_bills")
        .select("*")
        .eq("user_id", uid)
        .order("active", { ascending: false })
        .order("next_due_at", { ascending: true }),
      supabase
        .from("recurring_income")
        .select("*")
        .eq("user_id", uid)
        .order("active", { ascending: false })
        .order("next_pay_at", { ascending: true }),
    ]);

    if (aRes.error) setError(aRes.error.message);
    if (bRes.error) setError(bRes.error.message);
    if (iRes.error) setError(iRes.error.message);

    const a = (aRes.data || []) as Account[];
    const b = (bRes.data || []) as RecurringBill[];
    const i = (iRes.data || []) as RecurringIncome[];

    setAccounts(a);
    setBills(b);
    setIncome(i);

    return { accounts: a, bills: b, income: i };
  }

  const activeBills = useMemo(() => bills.filter((b) => b.active), [bills]);
  const activeIncome = useMemo(() => income.filter((i) => i.active), [income]);

  const totals = useMemo(() => computeTotals(accounts, bills, income), [accounts, bills, income]);

  function buildUpcomingBillsBody(t: ComputedTotals) {
    if (t.bills14.length === 0) {
      return [
        "No bills due in the next 14 days.",
        "",
        `Balance: ${formatMoneyFromCents(t.balance)}`,
        `Bills (7d): ${formatMoneyFromCents(t.bills7Total)}`,
        `Bills (14d): ${formatMoneyFromCents(t.bills14Total)}`,
        `Bills (30d): ${formatMoneyFromCents(t.bills30Total)}`,
      ].join("\n");
    }

    const lines = t.bills14.map((b) => {
      const flags = [b.autopay ? "autopay" : null].filter(Boolean).join(", ");
      const flagText = flags ? ` (${flags})` : "";
      return `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(
        b.next_due_at
      )}${flagText}`;
    });

    return [
      `Bills due in the next 14 days (${t.bills14.length}):`,
      ...lines,
      "",
      `Total (14d): ${formatMoneyFromCents(t.bills14Total)}`,
      `Balance now: ${formatMoneyFromCents(t.balance)}`,
    ].join("\n");
  }

  function buildUpcomingIncomeBody(t: ComputedTotals) {
    if (t.income14.length === 0) {
      return [
        "No income due in the next 14 days.",
        "",
        `Balance: ${formatMoneyFromCents(t.balance)}`,
        `Income (7d): ${formatMoneyFromCents(t.income7Total)}`,
        `Income (14d): ${formatMoneyFromCents(t.income14Total)}`,
        `Income (30d): ${formatMoneyFromCents(t.income30Total)}`,
      ].join("\n");
    }

    const lines = t.income14.map((i) => {
      return `• ${i.name}: ${formatMoneyFromCents(i.amount_cents, i.currency)} — next pay ${fmtDateTime(i.next_pay_at)}`;
    });

    return [
      `Income due in the next 14 days (${t.income14.length}):`,
      ...lines,
      "",
      `Total (14d): ${formatMoneyFromCents(t.income14Total)}`,
      `Balance now: ${formatMoneyFromCents(t.balance)}`,
    ].join("\n");
  }

  function severityForSafeToSpend(t: ComputedTotals) {
    const dollars = t.safeToSpendWeek / 100;
    if (dollars <= 0) return 3;
    if (dollars < 200) return 2;
    return 1;
  }

  function severityForUpcomingBills(t: ComputedTotals) {
    if (t.bills14Total > t.balance) return 3;
    if (t.bills14Total > 0) return 2;
    return 1;
  }

  function severityForUpcomingIncome(t: ComputedTotals) {
    // income is usually a reassurance, not an alarm
    if (t.income14Total > 0) return 1;
    return 2;
  }

  async function writeSingleReminder(opts: {
    runId: string;
    dedupe_key: string;
    title: string;
    body: string;
    severity: number;
  }) {
    if (!userId) return;

    const { error: upErr } = await supabase.from("decision_inbox").upsert(
      [
        {
          user_id: userId,
          run_id: opts.runId,
          type: "engine",
          title: opts.title,
          body: opts.body,
          severity: opts.severity,
          status: "open",
          snoozed_until: null, // Step 3: always clear snooze on engine refresh
          dedupe_key: opts.dedupe_key,
        },
      ],
      { onConflict: "user_id,dedupe_key" }
    );

    if (upErr) throw upErr;
  }

  async function runEngineV1() {
    if (!userId) return;

    // Step 2: cooldown
    const now = Date.now();
    if (cooldownUntil && now < cooldownUntil) {
      const secs = Math.ceil((cooldownUntil - now) / 1000);
      notify({ title: "Please wait", description: `Engine cooldown: ${secs}s` });
      return;
    }

    setRunning(true);
    setCooldownUntil(now + COOLDOWN_MS);

    try {
      // refresh right before writing, and compute totals from fresh data
      const fresh = await loadAll(userId);
      const freshTotals = computeTotals(fresh.accounts, fresh.bills, fresh.income);

      const runId = crypto.randomUUID();

      // Step 5: missing inputs nudges (truthful + deduped)
      if (fresh.bills.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_bills",
          title: "Add bills so Keystone can remind you",
          severity: 2,
          body: [
            "Keystone can’t remind you about upcoming bills yet because there are no bills.",
            "",
            "Next step:",
            "Go to Bills and add your recurring obligations (rent, internet, insurance…).",
          ].join("\n"),
        });
      }

      if (fresh.income.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_income",
          title: "Add income so safe-to-spend can be truthful",
          severity: 2,
          body: [
            "Keystone can’t include income in safe-to-spend yet because there is no recurring income.",
            "",
            "Next step:",
            "Go to Income and add your recurring pay / benefits / transfers (if applicable).",
          ].join("\n"),
        });
      }

      // SAFEGUARD: if no accounts, write missing-accounts reminder and stop
      if (fresh.accounts.length === 0) {
        await writeSingleReminder({
          runId,
          dedupe_key: "engine_missing_accounts",
          title: "Add accounts to compute safe-to-spend",
          severity: 1,
          body: [
            "Keystone can’t compute safe-to-spend yet because there are no accounts.",
            "",
            "Truth reminder:",
            "Safe-to-spend is based on your account balances + income due - bills due.",
            "",
            "Next step:",
            "Go to Accounts and add at least one account balance.",
          ].join("\n"),
        });

        setLastRanAt(new Date().toLocaleString());
        notify({ title: "Engine v1 ran", description: "Missing accounts reminder written to Inbox." });
        return;
      }

      // Clear missing-accounts reminder if it exists and we now have accounts
      await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("user_id", userId)
        .eq("dedupe_key", "engine_missing_accounts");

      const safeTitle = "Safe to spend this week";
      const billsTitle = "Upcoming bills (next 14 days)";
      const incomeTitle = "Upcoming income (next 14 days)";

      const safeBody = [
        `Balance now: ${formatMoneyFromCents(freshTotals.balance)}`,
        `Income (7d): ${formatMoneyFromCents(freshTotals.income7Total)}`,
        `Bills (7d): ${formatMoneyFromCents(freshTotals.bills7Total)}`,
        "",
        `Safe-to-spend (7d): ${formatMoneyFromCents(freshTotals.safeToSpendWeek)}`,
        "",
        "Truth reminder:",
        "safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0).",
      ].join("\n");

      const billsBody = buildUpcomingBillsBody(freshTotals);
      const incomeBody = buildUpcomingIncomeBody(freshTotals);

      // Step 3: always write "open" and clear snooze
      const rows: any[] = [
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: safeTitle,
          body: safeBody,
          severity: severityForSafeToSpend(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_safe_to_spend_week",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: billsTitle,
          body: billsBody,
          severity: severityForUpcomingBills(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_upcoming_bills_14d",
        },
        // Step 4: upcoming income (14d)
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: incomeTitle,
          body: incomeBody,
          severity: severityForUpcomingIncome(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_upcoming_income_14d",
        },
      ];

      const { error: upErr } = await supabase.from("decision_inbox").upsert(rows, {
        onConflict: "user_id,dedupe_key",
      });

      if (upErr) throw upErr;

      // If income/bills now exist, close the "missing" reminders if they exist
      await supabase
        .from("decision_inbox")
        .update({ status: "done", snoozed_until: null })
        .eq("user_id", userId)
        .in("dedupe_key", ["engine_missing_bills", "engine_missing_income"]);

      setLastRanAt(new Date().toLocaleString());
      notify({
        title: "Engine v1 ran",
        description: "Wrote Safe-to-spend + Upcoming bills + Upcoming income into Inbox (dedupe-safe).",
      });
    } catch (e: any) {
      notify({ title: "Engine error", description: e?.message ?? "Failed to run engine." });
    } finally {
      setRunning(false);
    }
  }

  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

  return (
    <Page title="Engine" subtitle="Manual simulation harness. Engine v1 reads your truths and writes reminders to Inbox.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {loading ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {error ? <Chip>{error}</Chip> : null}
                {lastRanAt ? <Chip>Last ran: {lastRanAt}</Chip> : <Chip>Last ran: —</Chip>}
                {cooldownSeconds > 0 ? <Chip>Cooldown: {cooldownSeconds}s</Chip> : null}
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={() => userId && loadAll(userId)} disabled={!userId || loading || running}>
                  Refresh inputs
                </Button>
                <Button onClick={runEngineV1} disabled={!userId || loading || running || cooldownSeconds > 0}>
                  {running ? "Running…" : "Run Engine v1"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Inputs</div>
            <div className="flex flex-wrap gap-2">
              <Badge>Accounts: {accounts.length}</Badge>
              <Badge>Bills (active): {activeBills.length}</Badge>
              <Badge>Income (active): {activeIncome.length}</Badge>
              <Chip>Balance: {formatMoneyFromCents(totals.balance)}</Chip>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Obligations snapshot</div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 7 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills7Total)} ({totals.bills7.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income7Total)} ({totals.income7.length})
                </div>
                <div className="text-sm opacity-75 mt-2">
                  Safe-to-spend: <span className="font-semibold">{formatMoneyFromCents(totals.safeToSpendWeek)}</span>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 14 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills14Total)} ({totals.bills14.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income14Total)} ({totals.income14.length})
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="font-semibold">Next 30 days</div>
                <div className="text-sm opacity-75 mt-1">
                  Bills: {formatMoneyFromCents(totals.bills30Total)} ({totals.bills30.length})
                </div>
                <div className="text-sm opacity-75">
                  Income: {formatMoneyFromCents(totals.income30Total)} ({totals.income30.length})
                </div>
              </div>
            </div>

            <div className="text-sm opacity-70 mt-3">
              Engine v1 writes deduped truth reminders to Inbox. No graphs. No guessing. Cooldown prevents spam runs.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
