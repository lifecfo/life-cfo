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

type EngineInsight = {
  key: string; // used for dedupe_key
  title: string;
  body: string;
  severity: 1 | 2 | 3;
};

// -------------------- Helper bodies + severities (MODULE SCOPE) --------------------
// IMPORTANT: keep these OUTSIDE EnginePage so both v1 and v2 code can call them.

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
    return `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(b.next_due_at)}${flagText}`;
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

// NEW: cashflow 30d
function buildCashflow30Body(t: ComputedTotals) {
  const outlook = t.balance + t.income30Total - t.bills30Total;

  return [
    "30-day cashflow outlook (truth-based):",
    "",
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
    `Income due (30d): ${formatMoneyFromCents(t.income30Total)}`,
    `Bills due (30d): ${formatMoneyFromCents(t.bills30Total)}`,
    "",
    `Outlook (30d): ${formatMoneyFromCents(outlook)}`,
    "",
    "Truth reminder:",
    "outlook_30d = balance + income_due_30d - bills_due_30d",
  ].join("\n");
}

function severityForCashflow30(t: ComputedTotals) {
  const outlook = t.balance + t.income30Total - t.bills30Total;
  if (outlook < 0) return 3; // high urgency
  if (outlook < 200_00) return 2; // under $200 buffer
  return 1;
}

// NEW: largest bill 14d
function buildLargestBill14dBody(t: ComputedTotals) {
  if (t.bills14.length === 0) {
    return ["No bills due in the next 14 days.", "", `Balance: ${formatMoneyFromCents(t.balance)}`].join("\n");
  }

  const largest = [...t.bills14].sort((a, b) => (b.amount_cents || 0) - (a.amount_cents || 0))[0];

  return [
    "Largest upcoming bill (next 14 days):",
    "",
    `• ${largest.name}: ${formatMoneyFromCents(largest.amount_cents, largest.currency)} — due ${fmtDateTime(
      largest.next_due_at
    )}${largest.autopay ? " (autopay)" : " (NOT autopay)"}`,
    "",
    `Bills due (14d): ${formatMoneyFromCents(t.bills14Total)}`,
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
  ].join("\n");
}

function severityForLargestBill14d(t: ComputedTotals) {
  if (t.bills14.length === 0) return 1;
  const largest = t.bills14.reduce((max, b) => Math.max(max, b.amount_cents || 0), 0);
  if (largest > t.balance) return 3;
  if (largest > 300_00) return 2;
  return 1;
}

// NEW: autopay risk 7d
function buildAutopayRiskBody(t: ComputedTotals) {
  const due7NoAutopay = t.bills7.filter((b) => !b.autopay);
  if (due7NoAutopay.length === 0) {
    return [
      "No near-term autopay risks.",
      "",
      "All bills due in the next 7 days are marked autopay (or there are no bills due).",
    ].join("\n");
  }

  const lines = due7NoAutopay.map(
    (b) => `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(b.next_due_at)}`
  );

  return [
    `Autopay risk: ${due7NoAutopay.length} bill(s) due in 7 days are NOT autopay:`,
    ...lines,
    "",
    "Next step:",
    "Either enable autopay or set a manual reminder.",
  ].join("\n");
}

function severityForAutopayRisk(t: ComputedTotals) {
  const due7NoAutopay = t.bills7.filter((b) => !b.autopay);
  if (due7NoAutopay.length === 0) return 1;
  if (due7NoAutopay.length >= 3) return 3;
  return 2;
}
// -------------------- End helpers --------------------

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
          snoozed_until: null,
          dedupe_key: opts.dedupe_key,
        },
      ],
      { onConflict: "user_id,dedupe_key" }
    );

    if (upErr) throw upErr;
  }

  async function upsertInsights(runId: string, insights: EngineInsight[]) {
    if (!userId) return;

    const payload = insights.map((x) => ({
      user_id: userId,
      run_id: runId,
      type: "engine",
      title: x.title,
      body: x.body,
      severity: x.severity,
      status: "open",
      snoozed_until: null,
      dedupe_key: x.key,
    }));

    const { error: upErr } = await supabase.from("decision_inbox").upsert(payload, {
      onConflict: "user_id,dedupe_key",
    });

    if (upErr) throw upErr;
  }

  function computeInsights(
    t: ComputedTotals,
    freshBills: RecurringBill[],
    freshIncome: RecurringIncome[],
    freshAccounts: Account[]
  ) {
    const list: EngineInsight[] = [];

    // Missing inputs: we keep these as insights too (in addition to v1 reminders)
    if (freshAccounts.length === 0) {
      list.push({
        key: "engine_v2_missing_accounts",
        title: "Insight: Add accounts to compute safe-to-spend",
        severity: 2,
        body: [
          "Keystone can’t compute safe-to-spend yet because there are no accounts.",
          "",
          "Next step:",
          "Go to Accounts and add at least one account balance.",
        ].join("\n"),
      });
      return list; // if no accounts, other insights are meaningless
    }

    if (freshBills.length === 0) {
      list.push({
        key: "engine_v2_missing_bills",
        title: "Insight: Add bills so reminders are real",
        severity: 2,
        body: [
          "Keystone can’t warn you about upcoming obligations yet because there are no bills.",
          "",
          "Next step:",
          "Go to Bills and add recurring obligations (rent, internet, insurance…).",
        ].join("\n"),
      });
    }

    if (freshIncome.length === 0) {
      list.push({
        key: "engine_v2_missing_income",
        title: "Insight: Add income so safe-to-spend is truthful",
        severity: 2,
        body: [
          "Keystone can’t include income in safe-to-spend yet because there is no recurring income.",
          "",
          "Next step:",
          "Go to Income and add your recurring pay / benefits / transfers (if applicable).",
        ].join("\n"),
      });
    }

    // Insight 1: Safe-to-spend is zero/low
    const safeDollars = t.safeToSpendWeek / 100;
    if (safeDollars <= 0) {
      list.push({
        key: "engine_v2_safe_to_spend_zero",
        title: "Insight: Safe-to-spend is $0 this week",
        severity: 1,
        body: [
          `Balance now: ${formatMoneyFromCents(t.balance)}`,
          `Income due (7d): ${formatMoneyFromCents(t.income7Total)}`,
          `Bills due (7d): ${formatMoneyFromCents(t.bills7Total)}`,
          "",
          `Safe-to-spend (7d): ${formatMoneyFromCents(t.safeToSpendWeek)}`,
          "",
          "Truth reminder:",
          "safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0).",
        ].join("\n"),
      });
    } else if (safeDollars < 200) {
      list.push({
        key: "engine_v2_safe_to_spend_low",
        title: "Insight: Safe-to-spend is low this week",
        severity: 2,
        body: [
          `Safe-to-spend (7d): ${formatMoneyFromCents(t.safeToSpendWeek)}`,
          "",
          "This is not a forecast — it’s just what’s currently true based on your inputs.",
        ].join("\n"),
      });
    }

    // Insight 2: 14d bills exceed balance
    if (t.bills14Total > t.balance) {
      list.push({
        key: "engine_v2_bills_exceed_balance_14d",
        title: "Insight: Bills due in 14 days exceed balance",
        severity: 1,
        body: [
          `Balance now: ${formatMoneyFromCents(t.balance)}`,
          `Bills due (14d): ${formatMoneyFromCents(t.bills14Total)}`,
          "",
          "Bills list:",
          ...t.bills14.map((b) => `• ${b.name}: ${formatMoneyFromCents(b.amount_cents, b.currency)} — due ${fmtDateTime(b.next_due_at)}`),
        ].join("\n"),
      });
    }

    // Insight 3: Autopay OFF on a soon bill (within 7 days)
    const soonManual = t.bills7.filter((b) => !b.autopay);
    if (soonManual.length > 0) {
      const b = soonManual[0];
      list.push({
        key: "engine_v2_autopay_off_bill_due_soon",
        title: "Insight: A bill is due soon and autopay is OFF",
        severity: 2,
        body: [
          `Bill: ${b.name}`,
          `Amount: ${formatMoneyFromCents(b.amount_cents, b.currency)}`,
          `Due: ${fmtDateTime(b.next_due_at)}`,
          "",
          "If this is meant to be manual, ignore.",
          "If it should be autopay, flip it on in Bills so Engine can relax.",
        ].join("\n"),
      });
    }

    return list;
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

      const upsertRows: any[] = [
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
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "30-day cashflow outlook",
          body: buildCashflow30Body(freshTotals),
          severity: severityForCashflow30(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_cashflow_outlook_30d",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "Largest bill (next 14 days)",
          body: buildLargestBill14dBody(freshTotals),
          severity: severityForLargestBill14d(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_largest_bill_14d",
        },
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "Autopay risks (next 7 days)",
          body: buildAutopayRiskBody(freshTotals),
          severity: severityForAutopayRisk(freshTotals),
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_autopay_risk_7d",
        },
      ];

      const { error: upErr } = await supabase.from("decision_inbox").upsert(upsertRows, {
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
        description:
          "Wrote Safe-to-spend + Upcoming bills + Upcoming income + 30d outlook + Largest bill + Autopay risks into Inbox (dedupe-safe).",
      });
    } catch (e: any) {
      notify({ title: "Engine error", description: e?.message ?? "Failed to run engine." });
    } finally {
      setRunning(false);
    }
  }

  async function runEngineV2() {
    if (!userId) return;

    const now = Date.now();
    if (cooldownUntil && now < cooldownUntil) {
      const secs = Math.ceil((cooldownUntil - now) / 1000);
      notify({ title: "Please wait", description: `Engine cooldown: ${secs}s` });
      return;
    }

    setRunning(true);
    setCooldownUntil(now + COOLDOWN_MS);

    try {
      const fresh = await loadAll(userId);
      const freshTotals = computeTotals(fresh.accounts, fresh.bills, fresh.income);
      const runId = crypto.randomUUID();

      const insights = computeInsights(freshTotals, fresh.bills, fresh.income, fresh.accounts);

      if (insights.length === 0) {
        // optional: you can choose to write a "no issues" insight, but we’ll keep it quiet for now
        setLastRanAt(new Date().toLocaleString());
        notify({ title: "Engine v2 ran", description: "No new insights (nice!)." });
        return;
      }

      await upsertInsights(runId, insights);

      setLastRanAt(new Date().toLocaleString());
      notify({ title: "Engine v2 ran", description: `Wrote ${insights.length} insight(s) into Inbox (deduped).` });
    } catch (e: any) {
      notify({ title: "Engine v2 error", description: e?.message ?? "Failed to run Engine v2." });
    } finally {
      setRunning(false);
    }
  }

  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)) : 0;

  const insightsPreview = useMemo(() => {
    // preview computed from current loaded inputs (no writes)
    const list = computeInsights(totals, bills, income, accounts);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, bills, income, accounts]);

  return (
    <Page title="Engine" subtitle="Manual simulation harness. Engine reads your truths and writes reminders/insights to Inbox.">
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

                {/* NOTE: kept your labels exactly as you pasted (Run Engine v2 is actually v1) */}
                <Button onClick={runEngineV1} disabled={!userId || loading || running || cooldownSeconds > 0}>
                  {running ? "Running…" : "Run Engine v2"}
                </Button>

                <Button variant="secondary" onClick={runEngineV2} disabled={!userId || loading || running || cooldownSeconds > 0}>
                  {running ? "Running…" : "Run Engine v2 (Insights)"}
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
            <div className="font-semibold mb-2">Engine v2 insights (preview)</div>

            {insightsPreview.length === 0 ? (
              <div className="text-sm text-zinc-600">No insights right now — looks calm ✅</div>
            ) : (
              <div className="grid gap-2">
                {insightsPreview.map((x) => (
                  <div key={x.key} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{x.title}</div>
                      <div className="text-xs text-zinc-500">severity {x.severity}</div>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{x.body}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-sm opacity-70 mt-3">
              Preview is computed locally from current inputs. Clicking “Run Engine v2” writes these as deduped Inbox items.
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
              Engine v1 writes baseline reminders. Engine v2 writes higher-signal insights. Cooldown prevents spam runs.
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
