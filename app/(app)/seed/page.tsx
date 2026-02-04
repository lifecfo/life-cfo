// app/(app)/seed/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Page } from "@/components/Page";
import { Card, CardContent, Button, Chip, Badge, useToast } from "@/components/ui";

export const dynamic = "force-dynamic";

type SeedStatus = "idle" | "working" | "done" | "error";

type SeedRunRow = {
  user_id: string;
  dataset_version: string;
  run_id: string;
  created_ids: Record<string, string[]>;
  created_at: string;
  updated_at: string;
};

const DATASET_VERSION = "v1_family_finance_realistic";

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

function toDatePlusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function todayDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ----- UUID safety: never allow "undefined" into FK inserts -----
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function mustUuid(v: unknown, label: string) {
  const s = typeof v === "string" ? v : "";
  if (!s || s === "undefined" || !isUuid(s)) {
    throw new Error(`Seed failed — missing/invalid ${label} (got: ${String(v)})`);
  }
  return s;
}

async function upsertSeedRun(userId: string, patch: Partial<SeedRunRow> & { created_ids?: Record<string, string[]> }) {
  const base: Partial<SeedRunRow> = {
    user_id: userId,
    dataset_version: DATASET_VERSION,
    run_id: safeUUID(),
    created_ids: {},
    ...patch,
  };

  const res = await (supabase as any)
    .from("demo_seed_runs")
    .upsert(
      {
        user_id: base.user_id,
        dataset_version: base.dataset_version ?? DATASET_VERSION,
        run_id: base.run_id,
        created_ids: base.created_ids ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" } // ✅ demo_seed_runs PK is user_id
    )
    .select("*")
    .single();

  if (res?.error) throw res.error;
  return res.data as SeedRunRow;
}

async function getSeedRun(userId: string) {
  const res = await (supabase as any).from("demo_seed_runs").select("*").eq("user_id", userId).single();
  if (res?.error) return null;
  return res.data as SeedRunRow;
}

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
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [status, setStatus] = useState<SeedStatus>("idle");
  const [statusLine, setStatusLine] = useState<string>("");

  const [confirmText, setConfirmText] = useState("");
  const resetAllowed = useMemo(() => confirmText.trim().toUpperCase() === "RESET", [confirmText]);

  const [seedRun, setSeedRun] = useState<SeedRunRow | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingAuth(true);
      setStatusLine("");

      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;

      if (error || !data?.user) {
        setUserId(null);
        setSeedRun(null);
        setLoadingAuth(false);
        setStatusLine("Not signed in.");
        return;
      }

      setUserId(data.user.id);
      setLoadingAuth(false);

      const sr = await getSeedRun(data.user.id);
      if (!alive) return;
      setSeedRun(sr);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const totalSeededCount = useMemo(() => {
    const ids = seedRun?.created_ids ?? {};
    return Object.values(ids).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
  }, [seedRun]);

  const hasSeeded = totalSeededCount > 0;

  async function refreshSeedRun() {
    if (!userId) return;
    const sr = await getSeedRun(userId);
    setSeedRun(sr);
  }

  // ✅ Fallback cleanup if seed failed before demo_seed_runs was saved:
  // Deletes only known demo rows by signature (name/title), NOT "everything for user".
  async function cleanupKnownDemoRows(dbAny: any, uid: string) {
    // Decisions graph + inbox (signature titles)
    await dbAny.from("decision_links").delete().eq("user_id", uid);
    await dbAny.from("decision_summaries").delete().eq("user_id", uid);
    await dbAny.from("decision_notes").delete().eq("user_id", uid);

    await dbAny
      .from("decisions")
      .delete()
      .eq("user_id", uid)
      .in("title", ["Can we afford private school next year?", "Plan a 3-week overseas holiday (next year)?", "Close out the old subscription bundle"]);

    await dbAny
      .from("decision_inbox")
      .delete()
      .eq("user_id", uid)
      .in("title", ["Are we on track financially?", "Private school: what would it take?", "Overseas holiday: can we do it calmly?", "Bills due soon", "Review goals progress"]);

    // Money (signature names)
    await dbAny.from("money_goal_updates").delete().eq("user_id", uid);
    await dbAny.from("money_goal_accounts").delete().eq("user_id", uid);
    await dbAny.from("money_goals").delete().eq("user_id", uid).in("title", ["Emergency buffer", "Overseas holiday", "Private school buffer"]);

    await dbAny.from("bill_payments").delete().eq("user_id", uid);
    await dbAny
      .from("recurring_bills")
      .delete()
      .eq("user_id", uid)
      .in("name", ["Internet", "Electricity", "Home insurance", "Mortgage repayment", "Tithe (10%)", "Private school fees (est.)"]);

    await dbAny.from("recurring_income").delete().eq("user_id", uid).in("name", ["Primary income", "Secondary income"]);

    await dbAny.from("transactions").delete().eq("user_id", uid);
    await dbAny.from("investment_accounts").delete().eq("user_id", uid).in("name", ["Super (household)", "Long-term shares"]);
    await dbAny.from("liabilities").delete().eq("user_id", uid).in("name", ["Home mortgage", "Car loan", "Credit card"]);

    await dbAny
      .from("budget_items")
      .delete()
      .eq("user_id", uid)
      .in("name", [
        "Groceries",
        "Fuel",
        "Utilities",
        "Kids (general)",
        "Private school sinking fund",
        "Overseas holiday sinking fund",
        "Tithe (10%)",
        "Investing",
      ]);

    await dbAny.from("categories").delete().eq("user_id", uid).in("name", ["Groceries", "Transport", "Bills", "Kids", "Income", "Giving"]);

    // Family + pets (signature names)
    await dbAny.from("pets").delete().eq("user_id", uid).in("name", ["Buddy"]);
    await dbAny.from("family_members").delete().eq("user_id", uid).in("name", ["Alex", "Jordan", "Casey", "Riley", "Taylor"]);

    // Accounts (signature names) last
    await dbAny.from("accounts").delete().eq("user_id", uid).in("name", ["Everyday Spending", "Bills Buffer", "Savings"]);
  }

  async function runReset() {
    if (!userId) return;
    if (!resetAllowed) {
      notify({ title: "Reset blocked", description: 'Type "RESET" to enable.' });
      return;
    }

    setStatus("working");
    setStatusLine("Resetting demo data…");

    try {
      const sr = await getSeedRun(userId);
      const ids = sr?.created_ids ?? {};
      const trackedTotal = Object.values(ids).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

      const dbAny = supabase as any;

      // If no tracked IDs (common when seed failed mid-way), do signature cleanup.
      if (!sr || trackedTotal === 0) {
        setStatusLine("No seed run record — cleaning known demo rows…");
        await cleanupKnownDemoRows(dbAny, userId);

        setConfirmText("");
        setStatus("done");
        setStatusLine("Reset complete ✅");
        notify({ title: "Reset complete", description: "Cleaned known demo rows (no seed run record)." });
        await refreshSeedRun();
        return;
      }

      const delByIds = async (table: string, idField = "id") => {
        const arr = ids[table];
        if (!arr || arr.length === 0) return;
        const res = await dbAny.from(table).delete().eq("user_id", userId).in(idField, arr);
        if (res?.error) throw res.error;
      };

      // --- Delete in FK-safe-ish order ---
      setStatusLine("Deleting goal updates…");
      await delByIds("money_goal_updates");

      setStatusLine("Deleting goal accounts…");
      await delByIds("money_goal_accounts");

      setStatusLine("Deleting goals…");
      await delByIds("money_goals");

      setStatusLine("Deleting transactions…");
      await delByIds("transactions");

      setStatusLine("Deleting bill payments…");
      await delByIds("bill_payments");

      setStatusLine("Deleting recurring bills…");
      await delByIds("recurring_bills");

      setStatusLine("Deleting recurring income…");
      await delByIds("recurring_income");

      setStatusLine("Deleting investments…");
      await delByIds("investment_accounts");

      setStatusLine("Deleting liabilities…");
      await delByIds("liabilities");

      setStatusLine("Deleting budget items…");
      await delByIds("budget_items");

      setStatusLine("Deleting categories…");
      await delByIds("categories");

      setStatusLine("Deleting decision summaries…");
      await delByIds("decision_summaries");
      setStatusLine("Deleting decision notes…");
      await delByIds("decision_notes");
      setStatusLine("Deleting decision links…");
      await delByIds("decision_links");

      setStatusLine("Deleting decisions…");
      await delByIds("decisions");

      setStatusLine("Deleting decision inbox…");
      await delByIds("decision_inbox");

      setStatusLine("Deleting pets…");
      await delByIds("pets");

      setStatusLine("Deleting family members…");
      await delByIds("family_members");

      setStatusLine("Deleting accounts…");
      await delByIds("accounts");

      setStatusLine("Clearing demo seed run record…");
      const clr = await upsertSeedRun(userId, { created_ids: {} });
      setSeedRun(clr);

      setConfirmText("");
      setStatus("done");
      setStatusLine("Reset complete ✅");
      notify({ title: "Reset complete", description: "Only demo rows were removed." });
    } catch (e: any) {
      const msg = e?.message ?? "Reset failed.";
      setStatus("error");
      setStatusLine(msg);
      notify({ title: "Reset failed", description: msg });
    } finally {
      await refreshSeedRun();
    }
  }

  async function runSeedFull() {
    if (!userId) return;

    setStatus("working");
    setStatusLine("Checking for existing demo seed…");

    const dbAny = supabase as any;

    try {
      const existing = await getSeedRun(userId);
      if (existing && (Object.values(existing.created_ids ?? {}).flat().length ?? 0) > 0) {
        setSeedRun(existing);
        setStatus("done");
        setStatusLine("Already seeded ✅");
        notify({ title: "Already seeded", description: "Reset first if you want a fresh demo dataset." });
        return;
      }

      setStatusLine("Creating seed run…");
      const runId = safeUUID();
      let created_ids: Record<string, string[]> = {};

      const remember = (key: string, newIds: string[]) => {
        if (!created_ids[key]) created_ids[key] = [];
        created_ids[key].push(...newIds);
      };

      const insertReturningIds = async (table: string, rows: any[], selectCols: string) => {
        const q = dbAny.from(table).insert(rows).select(selectCols) as any;
        const res = (await q) as any;
        if (res?.error) throw res.error;

        const data = (res?.data ?? []) as any[];
        const ids = data.map((r) => String(r?.id)).filter(Boolean);
        remember(table, ids);
        return data;
      };

      // ✅ Idempotent upsert helper for tables with UNIQUE constraints
      const upsertReturningIds = async (table: string, rows: any[], selectCols: string, onConflict: string) => {
        const q = dbAny.from(table).upsert(rows, { onConflict }).select(selectCols) as any;
        const res = (await q) as any;
        if (res?.error) throw res.error;

        const data = (res?.data ?? []) as any[];
        const ids = data.map((r) => String(r?.id)).filter(Boolean);
        remember(table, ids);
        return data;
      };

      // -----------------------------
      // 1) FAMILY (2 adults + 3 kids + 1 dog)
      // -----------------------------
      setStatusLine("Seeding family…");
      await insertReturningIds(
        "family_members",
        [
          { user_id: userId, name: "Alex", relationship: "self", birth_year: 1991, about: "Stay-at-home mum (previously an engineer). Mid 30s household (demo)." },
          { user_id: userId, name: "Jordan", relationship: "partner", birth_year: 1989, about: "Professional dad (engineer/doctor type role). Mid 30s household (demo)." },
          { user_id: userId, name: "Casey", relationship: "child", birth_year: 2017, about: "Child (demo)." },
          { user_id: userId, name: "Riley", relationship: "child", birth_year: 2020, about: "Child (demo)." },
          { user_id: userId, name: "Taylor", relationship: "child", birth_year: 2023, about: "Child (demo)." },
        ],
        "id"
      );

      await insertReturningIds("pets", [{ user_id: userId, name: "Buddy", type: "dog", notes: "Family dog (demo)." }], "id");

      // -----------------------------
      // 2) ACCOUNTS
      // -----------------------------
      setStatusLine("Seeding accounts…");
      const accounts = await insertReturningIds(
        "accounts",
        [
          { user_id: userId, name: "Everyday Spending", provider: "manual", type: "cash", status: "active", archived: false, current_balance_cents: 6200_00, currency: "AUD" },
          { user_id: userId, name: "Bills Buffer", provider: "manual", type: "cash", status: "active", archived: false, current_balance_cents: 12500_00, currency: "AUD" },
          { user_id: userId, name: "Savings", provider: "manual", type: "cash", status: "active", archived: false, current_balance_cents: 28000_00, currency: "AUD" },
        ],
        "id"
      );

      const everydayId = mustUuid(accounts[0]?.id, "Everyday account id");
      const billsBufferId = mustUuid(accounts[1]?.id, "Bills Buffer account id");
      const savingsId = mustUuid(accounts[2]?.id, "Savings account id");

      // -----------------------------
      // 3) INCOME
      // -----------------------------
      setStatusLine("Seeding income…");
      await insertReturningIds(
        "recurring_income",
        [
          { user_id: userId, name: "Primary income", amount_cents: 5400_00, currency: "AUD", cadence: "fortnightly", next_pay_at: toIsoLocalPlusDays(3, 9, 0), active: true, notes: "Professional salary (demo)." },
          { user_id: userId, name: "Secondary income", amount_cents: 1200_00, currency: "AUD", cadence: "monthly", next_pay_at: toIsoLocalPlusDays(12, 9, 0), active: true, notes: "Small side income (demo)." },
        ],
        "id"
      );

      // -----------------------------
      // 4) BILLS + PAYMENTS (includes 10% tithe)
      // -----------------------------
      setStatusLine("Seeding bills…");
      await insertReturningIds(
        "recurring_bills",
        [
          { user_id: userId, name: "Internet", amount_cents: 95_00, currency: "AUD", cadence: "monthly", next_due_at: toIsoLocalPlusDays(4, 9, 0), autopay: true, active: true, notes: "Autopay (demo)." },
          { user_id: userId, name: "Electricity", amount_cents: 260_00, currency: "AUD", cadence: "monthly", next_due_at: toIsoLocalPlusDays(9, 9, 0), autopay: false, active: true, notes: "Manual payment (demo)." },
          { user_id: userId, name: "Home insurance", amount_cents: 180_00, currency: "AUD", cadence: "monthly", next_due_at: toIsoLocalPlusDays(6, 9, 0), autopay: true, active: true, notes: "Autopay (demo)." },
          { user_id: userId, name: "Mortgage repayment", amount_cents: 4200_00, currency: "AUD", cadence: "monthly", next_due_at: toIsoLocalPlusDays(5, 9, 0), autopay: true, active: true, notes: "Home loan repayment (demo)." },
          { user_id: userId, name: "Private school fees (est.)", amount_cents: 1800_00, currency: "AUD", cadence: "monthly", next_due_at: toIsoLocalPlusDays(15, 9, 0), autopay: false, active: true, notes: "Estimated monthly equivalent (demo)." },
          { user_id: userId, name: "Tithe (10%)", amount_cents: 1170_00, currency: "AUD", cadence: "monthly", next_due_at: toIsoLocalPlusDays(2, 9, 0), autopay: true, active: true, notes: "Giving to church (demo)." },
        ],
        "id"
      );

      // Fetch IDs by name so we never end up with "undefined" FK values
      setStatusLine("Resolving bill IDs…");
      const { data: billIds, error: billIdsErr } = await supabase
        .from("recurring_bills")
        .select("id,name")
        .eq("user_id", userId)
        .in("name", ["Internet", "Mortgage repayment", "Tithe (10%)"]);

      if (billIdsErr) throw billIdsErr;

      const internetBillId = mustUuid(billIds?.find((b: any) => b.name === "Internet")?.id, "Internet bill id");
      const mortgageBillId = mustUuid(billIds?.find((b: any) => b.name === "Mortgage repayment")?.id, "Mortgage repayment bill id");
      const titheBillId = mustUuid(billIds?.find((b: any) => b.name === "Tithe (10%)")?.id, "Tithe bill id");

      setStatusLine("Seeding bill payments…");
      await insertReturningIds(
        "bill_payments",
        [
          { user_id: userId, bill_id: internetBillId, paid_at: toIsoLocalPlusDays(-15, 9, 0), amount_cents: 95_00, currency: "AUD", note: "Paid (demo)", source: "manual" },
          { user_id: userId, bill_id: mortgageBillId, paid_at: toIsoLocalPlusDays(-8, 9, 0), amount_cents: 4200_00, currency: "AUD", note: "Paid (demo)", source: "manual" },
          { user_id: userId, bill_id: titheBillId, paid_at: toIsoLocalPlusDays(-5, 9, 0), amount_cents: 1170_00, currency: "AUD", note: "Paid (demo)", source: "manual" },
        ],
        "id"
      );

      // -----------------------------
      // 5) BUDGET + CATEGORIES
      // -----------------------------
      setStatusLine("Seeding budget…");
      await insertReturningIds(
        "budget_items",
        [
          { user_id: userId, name: "Groceries", kind: "expense", amount_cents: 1500_00, cadence: "monthly", active: true, sort_order: 10 },
          { user_id: userId, name: "Fuel", kind: "expense", amount_cents: 450_00, cadence: "monthly", active: true, sort_order: 20 },
          { user_id: userId, name: "Utilities", kind: "expense", amount_cents: 600_00, cadence: "monthly", active: true, sort_order: 30 },
          { user_id: userId, name: "Kids (general)", kind: "expense", amount_cents: 400_00, cadence: "monthly", active: true, sort_order: 40 },
          { user_id: userId, name: "Private school sinking fund", kind: "expense", amount_cents: 1800_00, cadence: "monthly", active: true, sort_order: 50 },
          { user_id: userId, name: "Overseas holiday sinking fund", kind: "expense", amount_cents: 900_00, cadence: "monthly", active: true, sort_order: 60 },
          { user_id: userId, name: "Tithe (10%)", kind: "expense", amount_cents: 1170_00, cadence: "monthly", active: true, sort_order: 70 },
          { user_id: userId, name: "Investing", kind: "expense", amount_cents: 800_00, cadence: "monthly", active: true, sort_order: 80 },
        ],
        "id"
      );

      await insertReturningIds(
        "categories",
        [
          { user_id: userId, name: "Groceries", group: "Living" },
          { user_id: userId, name: "Transport", group: "Living" },
          { user_id: userId, name: "Bills", group: "Living" },
          { user_id: userId, name: "Kids", group: "Family" },
          { user_id: userId, name: "Income", group: "Money" },
          { user_id: userId, name: "Giving", group: "Values" },
        ],
        "id"
      );

      // -----------------------------
      // 6) TRANSACTIONS
      // -----------------------------
      setStatusLine("Seeding transactions…");
      const t = todayDate();
      const txRows = [
        { user_id: userId, account_id: everydayId, date: toDatePlusDays(-3), amount: 5400.0, description: "Salary", merchant: "Employer", category: "Income", pending: false },
        { user_id: userId, account_id: everydayId, date: toDatePlusDays(-15), amount: 5400.0, description: "Salary", merchant: "Employer", category: "Income", pending: false },

        { user_id: userId, account_id: everydayId, date: t, amount: -182.45, description: "Groceries", merchant: "Woolworths", category: "Groceries", pending: false },
        { user_id: userId, account_id: everydayId, date: toDatePlusDays(-1), amount: -64.9, description: "Fuel", merchant: "BP", category: "Transport", pending: false },
        { user_id: userId, account_id: everydayId, date: toDatePlusDays(-2), amount: -28.5, description: "Coffee", merchant: "Cafe", category: "Living", pending: false },

        { user_id: userId, account_id: billsBufferId, date: toDatePlusDays(-5), amount: -1170.0, description: "Tithe (10%)", merchant: "Church", category: "Giving", pending: false },
        { user_id: userId, account_id: billsBufferId, date: toDatePlusDays(-8), amount: -4200.0, description: "Mortgage repayment", merchant: "Bank", category: "Bills", pending: false },
        { user_id: userId, account_id: billsBufferId, date: toDatePlusDays(-10), amount: -95.0, description: "Internet", merchant: "ISP", category: "Bills", pending: false },

        { user_id: userId, account_id: savingsId, date: toDatePlusDays(-4), amount: 1200.0, description: "Secondary income", merchant: "Side income", category: "Income", pending: false },
        { user_id: userId, account_id: savingsId, date: toDatePlusDays(-6), amount: 900.0, description: "Holiday fund transfer", merchant: "Internal", category: "Savings", pending: false },
        { user_id: userId, account_id: savingsId, date: toDatePlusDays(-7), amount: -350.0, description: "Shares top-up", merchant: "Broker", category: "Investing", pending: false },
      ];
      await insertReturningIds("transactions", txRows, "id");

      // -----------------------------
      // 7) INVESTMENTS + LIABILITIES
      // -----------------------------
      setStatusLine("Seeding investments & liabilities…");
      await insertReturningIds(
        "investment_accounts",
        [
          { user_id: userId, name: "Super (household)", kind: "super", institution: "Example Super", approx_value: 220000, currency: "AUD", notes: "Approx combined household super (demo)." },
          { user_id: userId, name: "Long-term shares", kind: "shares", institution: "Example Broker", approx_value: 45000, currency: "AUD", notes: "Long-term holdings (demo)." },
        ],
        "id"
      );

      await insertReturningIds(
        "liabilities",
        [
          { user_id: userId, name: "Home mortgage", current_balance_cents: 800_000_00, currency: "AUD", notes: "Primary residence mortgage (demo).", archived: false },
          { user_id: userId, name: "Car loan", current_balance_cents: 14_500_00, currency: "AUD", notes: "Demo liability.", archived: false },
          { user_id: userId, name: "Credit card", current_balance_cents: 800_00, currency: "AUD", notes: "Paid down monthly (demo).", archived: false },
        ],
        "id"
      );

      // -----------------------------
      // 8) GOALS
      // -----------------------------
      setStatusLine("Seeding money goals…");
      await insertReturningIds(
        "money_goals",
        [
          { user_id: userId, title: "Emergency buffer", currency: "AUD", target_cents: 20000_00, current_cents: 12500_00, target_date: toDatePlusDays(120), status: "active", notes: "Keep the household calm if anything unexpected happens (demo).", is_primary: true, sort_order: 10 },
          { user_id: userId, title: "Overseas holiday", currency: "AUD", target_cents: 15000_00, current_cents: 3500_00, target_date: toDatePlusDays(320), status: "active", notes: "3-week overseas holiday (demo).", is_primary: false, sort_order: 20 },
          { user_id: userId, title: "Private school buffer", currency: "AUD", target_cents: 10000_00, current_cents: 2200_00, target_date: toDatePlusDays(240), status: "active", notes: "Build a buffer before committing (demo).", is_primary: false, sort_order: 30 },
        ],
        "id"
      );

      setStatusLine("Resolving goal IDs…");
      const { data: goalIds, error: goalIdsErr } = await supabase
        .from("money_goals")
        .select("id,title")
        .eq("user_id", userId)
        .in("title", ["Emergency buffer", "Overseas holiday", "Private school buffer"]);

      if (goalIdsErr) throw goalIdsErr;

      const emergencyId = mustUuid(goalIds?.find((g: any) => g.title === "Emergency buffer")?.id, "Emergency buffer goal id");
      const holidayId = mustUuid(goalIds?.find((g: any) => g.title === "Overseas holiday")?.id, "Overseas holiday goal id");
      const schoolId = mustUuid(goalIds?.find((g: any) => g.title === "Private school buffer")?.id, "Private school buffer goal id");

      setStatusLine("Linking goals to accounts…");
      await insertReturningIds(
        "money_goal_accounts",
        [
          { user_id: userId, goal_id: emergencyId, account_id: billsBufferId, weight: 60 },
          { user_id: userId, goal_id: emergencyId, account_id: savingsId, weight: 40 },
          { user_id: userId, goal_id: holidayId, account_id: savingsId, weight: 100 },
          { user_id: userId, goal_id: schoolId, account_id: savingsId, weight: 100 },
        ],
        "id"
      );

      setStatusLine("Seeding goal updates…");
      await insertReturningIds(
        "money_goal_updates",
        [
          { user_id: userId, goal_id: emergencyId, delta_cents: 500_00, currency: "AUD", note: "Added $500 (demo)", occurred_at: toIsoLocalPlusDays(-12, 9, 0) },
          { user_id: userId, goal_id: holidayId, delta_cents: 300_00, currency: "AUD", note: "Added $300 (demo)", occurred_at: toIsoLocalPlusDays(-18, 9, 0) },
          { user_id: userId, goal_id: schoolId, delta_cents: 250_00, currency: "AUD", note: "Added $250 (demo)", occurred_at: toIsoLocalPlusDays(-9, 9, 0) },
        ],
        "id"
      );

      // -----------------------------
      // 9) CAPTURE / INBOX
      // -----------------------------
      setStatusLine("Seeding captures & inbox…");
      const seedInboxRunId = safeUUID();

      const inboxRows = [
        { user_id: userId, run_id: seedInboxRunId, type: "capture", title: "Are we on track financially?", body: "We’re doing okay, but I want clarity: are we actually moving forward month to month?", severity: 2, status: "open", snoozed_until: null, dedupe_key: `seed:${seedInboxRunId}:cap:1`, action_label: null, action_href: null, framed_decision_id: null },
        { user_id: userId, run_id: seedInboxRunId, type: "capture", title: "Private school: what would it take?", body: "We want the option for private school, but I don’t want that decision to create stress.", severity: 2, status: "open", snoozed_until: null, dedupe_key: `seed:${seedInboxRunId}:cap:2`, action_label: null, action_href: null, framed_decision_id: null },
        { user_id: userId, run_id: seedInboxRunId, type: "capture", title: "Overseas holiday: can we do it calmly?", body: "We’d love a 3-week overseas trip next year, but only if it’s contained and guilt-free.", severity: 1, status: "open", snoozed_until: null, dedupe_key: `seed:${seedInboxRunId}:cap:3`, action_label: null, action_href: null, framed_decision_id: null },
        { user_id: userId, run_id: seedInboxRunId, type: "manual", title: "Bills due soon", body: "Quick check: what’s coming up, and what’s autopay vs manual?", severity: 2, status: "open", snoozed_until: null, dedupe_key: `seed:${seedInboxRunId}:manual:1`, action_label: "Open Bills", action_href: "/bills", framed_decision_id: null },
        { user_id: userId, run_id: seedInboxRunId, type: "manual", title: "Review goals progress", body: "Is the emergency buffer + holiday fund moving each month?", severity: 1, status: "open", snoozed_until: null, dedupe_key: `seed:${seedInboxRunId}:manual:2`, action_label: "Open Goals", action_href: "/goals", framed_decision_id: null },
      ];

      const inboxCreated = await insertReturningIds("decision_inbox", inboxRows, "id");
      const cap2InboxId = mustUuid(inboxCreated[1]?.id, "Private school capture inbox id");
      const cap3InboxId = mustUuid(inboxCreated[2]?.id, "Overseas holiday capture inbox id");

      // -----------------------------
      // 10) DECISIONS / REVIEW / CHAPTERS
      // -----------------------------
      setStatusLine("Seeding decisions…");
      const decisions = await insertReturningIds(
        "decisions",
        [
          {
            user_id: userId,
            inbox_item_id: cap2InboxId,
            title: "Can we afford private school next year?",
            context:
              "Captured:\nWe want the option for private school, but I don’t want that decision to create stress.\n\nAssumptions:\n- treat fees as a contained monthly amount\n- preserve emergency buffer",
            status: "draft",
            origin: "capture",
            framed_at: new Date().toISOString(),
            decided_at: null,
            review_at: toIsoLocalPlusDays(21, 9, 0),
            pinned: true,
          },
          {
            user_id: userId,
            inbox_item_id: cap3InboxId,
            title: "Plan a 3-week overseas holiday (next year)?",
            context:
              "Captured:\nWe’d love a 3-week overseas trip next year, but only if it’s contained and guilt-free.\n\nConstraint:\n- fund it via the holiday goal only",
            status: "decided",
            origin: "capture",
            framed_at: new Date().toISOString(),
            decided_at: toIsoLocalPlusDays(-6, 9, 0),
            review_at: toIsoLocalPlusDays(60, 9, 0),
            pinned: false,
            user_reasoning: "Yes, but only via the goal (no credit card), and we keep the emergency buffer intact.",
          },
          {
            user_id: userId,
            inbox_item_id: null,
            title: "Close out the old subscription bundle",
            context: "Decision completed and released (demo).",
            status: "chapter",
            origin: "manual",
            framed_at: toIsoLocalPlusDays(-50, 9, 0),
            decided_at: toIsoLocalPlusDays(-45, 9, 0),
            review_at: null,
            chaptered_at: toIsoLocalPlusDays(-3, 9, 0),
            pinned: false,
          },
        ],
        "id"
      );

      const dDraft = mustUuid(decisions[0]?.id, "Private school decision id");
      const dHoliday = mustUuid(decisions[1]?.id, "Holiday decision id");

      // Mirror capture->decision linkage (so capture is "sent"/done)
      setStatusLine("Linking captures to decisions…");
      {
        const r1 = await (supabase as any)
          .from("decision_inbox")
          .update({ framed_decision_id: dDraft, status: "done" })
          .eq("user_id", userId)
          .eq("id", cap2InboxId);
        if (r1?.error) throw r1.error;
      }

      {
        const r2 = await (supabase as any)
          .from("decision_inbox")
          .update({ framed_decision_id: dHoliday, status: "done" })
          .eq("user_id", userId)
          .eq("id", cap3InboxId);
        if (r2?.error) throw r2.error;
      }

      // Decision notes (Thinking / Framing)
      setStatusLine("Seeding decision notes & summaries…");
      await insertReturningIds(
        "decision_notes",
        [
          {
            user_id: userId,
            decision_id: dDraft,
            kind: "framing",
            body:
              "Define success:\n- emergency buffer stays ≥ $20k target\n- school fees are funded monthly without stress\n- tithing remains consistent",
          },
          {
            user_id: userId,
            decision_id: dDraft,
            kind: "thinking",
            body:
              "First pass:\n- treat school fees as a fixed monthly bill\n- confirm cashflow margin after mortgage + tithe + essentials\n- if margin is tight, delay 12 months and build buffer",
          },
          {
            user_id: userId,
            decision_id: dHoliday,
            kind: "thinking",
            body: "Plan:\n- use overseas holiday goal only\n- book off-peak if possible\n- cap total and keep buffer intact",
          },
        ],
        "id"
      );

      await insertReturningIds(
        "decision_summaries",
        [
          {
            user_id: userId,
            decision_id: dHoliday,
            summary_text:
              "Decided: plan a 3-week overseas holiday next year, funded only via the holiday goal (no debt), while protecting the emergency buffer.",
          },
        ],
        "id"
      );

      await insertReturningIds("decision_links", [{ user_id: userId, from_decision_id: dDraft, to_decision_id: dHoliday, label: "constraints" }], "id");

      // Save seed run record at the end (single write)
      setStatusLine("Saving demo seed run…");
      const saved = await upsertSeedRun(userId, {
        dataset_version: DATASET_VERSION,
        run_id: runId,
        created_ids,
      });
      setSeedRun(saved);

      setStatus("done");
      setStatusLine("Seed complete ✅");
      notify({ title: "Seed complete", description: "Full demo dataset added across Money + Decisions + Review + Chapters + Family." });
    } catch (e: any) {
      const msg = e?.message ?? "Seed failed.";
      setStatus("error");
      setStatusLine(msg);
      notify({ title: "Seed failed", description: msg });
    } finally {
      await refreshSeedRun();
    }
  }

  const statusChip =
    status === "working" ? <Chip>Working…</Chip> : status === "done" ? <Chip>Done</Chip> : status === "error" ? <Chip>Error</Chip> : <Chip>Idle</Chip>;

  return (
    <Page title="Seed / Reset" subtitle="Testing harness. Creates repeatable demo data, or clears only the demo rows for your user.">
      <div className="grid gap-4">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {loadingAuth ? <Chip>Loading…</Chip> : <Chip>Ready</Chip>}
                {userId ? <Badge>Signed in</Badge> : <Badge>Signed out</Badge>}
                {statusChip}
                {statusLine ? <Chip>{statusLine}</Chip> : null}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip>Route: /seed</Chip>
                <Chip>Dataset: {DATASET_VERSION}</Chip>
              </div>
            </div>

            {userId ? (
              <div className="mt-3 text-xs text-zinc-600">
                Demo seed run: {hasSeeded ? "present" : "none"} • Total seeded rows tracked: {totalSeededCount}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Seed full demo dataset (V1)</div>
            <div className="text-sm text-zinc-600">
              Populates Home, Capture, Thinking, Decisions, Review, Chapters, Family, Accounts, Net Worth, Liabilities, Goals, Bills, Income, Investments,
              Budget, and Transactions with a coherent test household.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={runSeedFull} disabled={!userId || loadingAuth || status === "working"}>
                Seed full demo dataset
              </Button>
              {hasSeeded ? <Chip>Seeded</Chip> : <Chip>Not seeded</Chip>}
            </div>

            <div className="mt-2 text-xs text-zinc-500">
              Requires <code>demo_seed_runs</code> table. If missing, seeding will fail safely with an error.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="font-semibold mb-2">Reset demo dataset (safe)</div>
            <div className="text-sm text-zinc-600">
              Deletes only rows created by the demo seed run (tracked IDs). Requires explicit typed confirmation.
              <span className="block mt-1">If the last seed failed before saving the run record, Reset will clean known demo rows by signature.</span>
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
                <Button onClick={runReset} disabled={!userId || loadingAuth || status === "working" || !resetAllowed}>
                  Reset demo dataset
                </Button>
                {!resetAllowed ? <Chip>Confirmation required</Chip> : <Chip>Enabled</Chip>}
              </div>

              <div className="text-xs text-zinc-500">
                Reset order respects likely foreign keys (goal updates → goal accounts → goals → transactions → payments → bills → income → decisions graph → inbox
                → family → accounts).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
