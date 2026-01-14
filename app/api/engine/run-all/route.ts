import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Cadence = "weekly" | "fortnightly" | "monthly" | "yearly";

type Account = {
  id: string;
  user_id: string;
  name: string;
  current_balance_cents: number;
  currency: string;
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

function computeTotals(accounts: Account[], bills: RecurringBill[], income: RecurringIncome[]) {
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

  const income7 = activeIncome.filter((i) => dueIn(i.next_pay_at, t7));
  const income14 = activeIncome.filter((i) => dueIn(i.next_pay_at, t14));

  const bills7Total = sumCents(bills7);
  const bills14Total = sumCents(bills14);

  const income7Total = sumCents(income7);
  const income14Total = sumCents(income14);

  const safeToSpendWeek = Math.max(0, balance + income7Total - bills7Total);

  return {
    balance,
    bills14,
    income14,
    bills7Total,
    bills14Total,
    income7Total,
    income14Total,
    safeToSpendWeek,
  };
}

function buildUpcomingBillsBody(t: any) {
  if (t.bills14.length === 0) {
    return [
      "No bills due in the next 14 days.",
      "",
      `Balance: ${formatMoneyFromCents(t.balance)}`,
      `Bills (7d): ${formatMoneyFromCents(t.bills7Total)}`,
      `Bills (14d): ${formatMoneyFromCents(t.bills14Total)}`,
    ].join("\n");
  }

  const lines = t.bills14.map((b: RecurringBill) => {
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

function buildUpcomingIncomeBody(t: any) {
  if (t.income14.length === 0) {
    return [
      "No income due in the next 14 days.",
      "",
      `Balance: ${formatMoneyFromCents(t.balance)}`,
      `Income (7d): ${formatMoneyFromCents(t.income7Total)}`,
      `Income (14d): ${formatMoneyFromCents(t.income14Total)}`,
    ].join("\n");
  }

  const lines = t.income14.map((i: RecurringIncome) => {
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

function severityForSafeToSpend(t: any) {
  const dollars = t.safeToSpendWeek / 100;
  if (dollars <= 0) return 3;
  if (dollars < 200) return 2;
  return 1;
}

function severityForUpcomingBills(t: any) {
  if (t.bills14Total > t.balance) return 3;
  if (t.bills14Total > 0) return 2;
  return 1;
}

function severityForUpcomingIncome(t: any) {
  if (t.income14Total > 0) return 1;
  return 2;
}

async function runForUser(admin: any, userId: string) {
  const [aRes, bRes, iRes] = await Promise.all([
    admin.from("accounts").select("*").eq("user_id", userId),
    admin.from("recurring_bills").select("*").eq("user_id", userId),
    admin.from("recurring_income").select("*").eq("user_id", userId),
  ]);

  if (aRes.error) throw aRes.error;
  if (bRes.error) throw bRes.error;
  if (iRes.error) throw iRes.error;

  const accounts = (aRes.data || []) as Account[];
  const bills = (bRes.data || []) as RecurringBill[];
  const income = (iRes.data || []) as RecurringIncome[];

  const runId = crypto.randomUUID();

  if (accounts.length === 0) {
    await admin.from("decision_inbox").upsert(
      [
        {
          user_id: userId,
          run_id: runId,
          type: "engine",
          title: "Add accounts to compute safe-to-spend",
          body: [
            "Keystone can’t compute safe-to-spend yet because there are no accounts.",
            "",
            "Next step:",
            "Go to Accounts and add at least one account balance.",
          ].join("\n"),
          severity: 1,
          status: "open",
          snoozed_until: null,
          dedupe_key: "engine_missing_accounts",
        },
      ],
      { onConflict: "user_id,dedupe_key" }
    );

    await admin.from("engine_runs").insert({
      user_id: userId,
      status: "ok",
      message: "Missing accounts reminder written (cron)",
      meta_json: { wrote: ["engine_missing_accounts"] },
    });

    return { userId, wrote: ["engine_missing_accounts"] };
  }

  const t = computeTotals(accounts, bills, income);

  const safeBody = [
    `Balance now: ${formatMoneyFromCents(t.balance)}`,
    `Income (7d): ${formatMoneyFromCents(t.income7Total)}`,
    `Bills (7d): ${formatMoneyFromCents(t.bills7Total)}`,
    "",
    `Safe-to-spend (7d): ${formatMoneyFromCents(t.safeToSpendWeek)}`,
    "",
    "Truth reminder:",
    "safe_to_spend = balance + income_due_7d - bills_due_7d (floored at 0).",
  ].join("\n");

  const rows = [
    {
      user_id: userId,
      run_id: runId,
      type: "engine",
      title: "Safe to spend this week",
      body: safeBody,
      severity: severityForSafeToSpend(t),
      status: "open",
      snoozed_until: null,
      dedupe_key: "engine_safe_to_spend_week",
    },
    {
      user_id: userId,
      run_id: runId,
      type: "engine",
      title: "Upcoming bills (next 14 days)",
      body: buildUpcomingBillsBody(t),
      severity: severityForUpcomingBills(t),
      status: "open",
      snoozed_until: null,
      dedupe_key: "engine_upcoming_bills_14d",
    },
    {
      user_id: userId,
      run_id: runId,
      type: "engine",
      title: "Upcoming income (next 14 days)",
      body: buildUpcomingIncomeBody(t),
      severity: severityForUpcomingIncome(t),
      status: "open",
      snoozed_until: null,
      dedupe_key: "engine_upcoming_income_14d",
    },
  ];

  const { error: upErr } = await admin.from("decision_inbox").upsert(rows, {
    onConflict: "user_id,dedupe_key",
  });
  if (upErr) throw upErr;

  await admin
    .from("decision_inbox")
    .update({ status: "done", snoozed_until: null })
    .eq("user_id", userId)
    .eq("dedupe_key", "engine_missing_accounts");

  await admin.from("engine_runs").insert({
    user_id: userId,
    status: "ok",
    message: "Cron engine wrote core reminders",
    meta_json: { wrote: ["engine_safe_to_spend_week", "engine_upcoming_bills_14d", "engine_upcoming_income_14d"] },
  });

  return { userId, wrote: ["engine_safe_to_spend_week", "engine_upcoming_bills_14d", "engine_upcoming_income_14d"] };
}

export async function POST(req: Request) {
  try {
    const secret = process.env.ENGINE_CRON_SECRET;
    if (!secret) return NextResponse.json({ error: "Missing ENGINE_CRON_SECRET" }, { status: 500 });

    const sent = req.headers.get("x-engine-secret");
    if (sent !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // users = union of anyone who has data in at least one input table
    const [u1, u2, u3] = await Promise.all([
      admin.from("accounts").select("user_id"),
      admin.from("recurring_bills").select("user_id"),
      admin.from("recurring_income").select("user_id"),
    ]);

    if (u1.error) throw u1.error;
    if (u2.error) throw u2.error;
    if (u3.error) throw u3.error;

    const ids = new Set<string>();
    (u1.data || []).forEach((r: any) => r.user_id && ids.add(r.user_id));
    (u2.data || []).forEach((r: any) => r.user_id && ids.add(r.user_id));
    (u3.data || []).forEach((r: any) => r.user_id && ids.add(r.user_id));

    const userIds = Array.from(ids);

    const results: any[] = [];
    for (const uid of userIds) {
      try {
        results.push(await runForUser(admin, uid));
      } catch (e: any) {
        await admin.from("engine_runs").insert({
          user_id: uid,
          status: "error",
          message: e?.message ?? "Cron run failed",
          meta_json: null,
        });
        results.push({ userId: uid, error: e?.message ?? "failed" });
      }
    }

    return NextResponse.json({ ok: true, users: userIds.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "run-all failed" }, { status: 500 });
  }
}
