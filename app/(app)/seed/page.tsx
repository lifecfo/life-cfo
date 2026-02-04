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

async function upsertSeedRun(userId: string, patch: Partial<SeedRunRow> & { created_ids?: Record<string, string[]> }) {
  // 1 row per user
  const base: Partial<SeedRunRow> = {
    user_id: userId,
    dataset_version: "v1",
    run_id: safeUUID(),
    created_ids: {},
    ...patch,
  };

  const res = await (supabase as any)
    .from("demo_seed_runs")
    .upsert(
      {
        user_id: base.user_id,
        dataset_version: base.dataset_version ?? "v1",
        run_id: base.run_id,
        created_ids: base.created_ids ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (res?.error) throw res.error;
  return res.data as SeedRunRow;
}

async function getSeedRun(userId: string) {
  const res = await (supabase as any).from("demo_seed_runs").select("*").eq("user_id", userId).single();
  if (res?.error) return null; // ok if missing
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
      if (!sr || trackedTotal === 0) {
        setConfirmText("");
        setStatus("done");
        setStatusLine("Nothing to reset ✅");
        notify({ title: "Nothing to reset", description: "No demo seed run found for your user." });
        await refreshSeedRun();
        return;
      }

      const dbAny = supabase as any;

      const delByIds = async (table: string, idField = "id") => {
        const arr = ids[table];
        if (!arr || arr.length === 0) return;
        const res = await dbAny.from(table).delete().eq("user_id", userId).in(idField, arr);
        if (res?.error) throw res.error;
      };

      setStatusLine("Deleting money goal updates…");
      await delByIds("money_goal_updates");

      setStatusLine("Deleting money goal accounts…");
      await delByIds("money_goal_accounts");

      setStatusLine("Deleting money goals…");
      await delByIds("money_goals");

      setStatusLine("Deleting transactions…");
      await delByIds("transactions");

      setStatusLine("Deleting bill payments…");
      await delByIds("bill_payments");

      setStatusLine("Deleting recurring bills…");
      await delByIds("recurring_bills");

      setStatusLine("Deleting recurring income…");
      await delByIds("recurring_income");

      setStatusLine("Deleting investment accounts…");
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

      setStatusLine("Deleting decision domains…");
      const ddByDecision = ids["decision_domains:by_decision_id"];
      if (ddByDecision?.length) {
        const res = await dbAny.from("decision_domains").delete().eq("user_id", userId).in("decision_id", ddByDecision);
        if (res?.error) throw res.error;
      }

      setStatusLine("Deleting constellation items…");
      const ciByDecision = ids["constellation_items:by_decision_id"];
      if (ciByDecision?.length) {
        const res = await dbAny.from("constellation_items").delete().eq("user_id", userId).in("decision_id", ciByDecision);
        if (res?.error) throw res.error;
      }

      setStatusLine("Deleting domain constellations…");
      const dcByDomain = ids["domain_constellations:by_domain_id"];
      if (dcByDomain?.length) {
        const res = await dbAny.from("domain_constellations").delete().eq("user_id", userId).in("domain_id", dcByDomain);
        if (res?.error) throw res.error;
      }

      setStatusLine("Deleting constellations…");
      await delByIds("constellations");

      setStatusLine("Deleting domains…");
      await delByIds("domains");

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

      // ✅ NEW: idempotent ensure-by-name (no ON CONFLICT required)
      const ensureByName = async (table: string, rows: any[], nameField = "name") => {
        const names = rows.map((r) => String(r?.[nameField] ?? "")).filter(Boolean);
        if (names.length === 0) return [];

        // 1) fetch existing
        const existingRes = await dbAny
          .from(table)
          .select(`id,${nameField}`)
          .eq("user_id", userId)
          .in(nameField, names);

        if (existingRes?.error) throw existingRes.error;

        const existingRows: any[] = existingRes?.data ?? [];
        const existingByName = new Map(existingRows.map((r) => [String(r?.[nameField]), r]));

        // 2) insert missing
        const missing = rows.filter((r) => !existingByName.has(String(r?.[nameField])));
        let inserted: any[] = [];
        if (missing.length) {
          const insertedRes = await dbAny.from(table).insert(missing).select(`id,${nameField}`);
          if (insertedRes?.error) throw insertedRes.error;
          inserted = insertedRes?.data ?? [];

          // track only what we actually created (safe reset)
          const newIds = inserted.map((r: any) => String(r?.id)).filter(Boolean);
          if (newIds.length) remember(table, newIds);

          for (const r of inserted) existingByName.set(String(r?.[nameField]), r);
        }

        // 3) return in the same order as requested rows
        return rows.map((r) => existingByName.get(String(r?.[nameField]))).filter(Boolean);
      };

      // ✅ NEW: idempotent join insert for domain_constellations
      const ensureDomainConstellations = async (pairs: { domain_id: string; constellation_id: string }[]) => {
        if (!pairs.length) return;

        const domainIds = Array.from(new Set(pairs.map((p) => p.domain_id))).filter(Boolean);
        const constIds = Array.from(new Set(pairs.map((p) => p.constellation_id))).filter(Boolean);

        const existingRes = await dbAny
          .from("domain_constellations")
          .select("domain_id,constellation_id")
          .eq("user_id", userId)
          .in("domain_id", domainIds)
          .in("constellation_id", constIds);

        if (existingRes?.error) throw existingRes.error;

        const existing = new Set((existingRes?.data ?? []).map((r: any) => `${r.domain_id}::${r.constellation_id}`));
        const missing = pairs.filter((p) => !existing.has(`${p.domain_id}::${p.constellation_id}`));

        if (!missing.length) return;

        const res = await dbAny.from("domain_constellations").insert(missing.map((m) => ({ user_id: userId, ...m })));
        if (res?.error) throw res.error;
      };

      // 1) FAMILY
      setStatusLine("Seeding family…");
      await insertReturningIds(
        "family_members",
        [
          { user_id: userId, name: "Emily", relationship: "self", birth_year: 1990, about: "Primary user (demo)." },
          { user_id: userId, name: "Ryan", relationship: "partner", birth_year: 1988, about: "Household partner (demo)." },
          { user_id: userId, name: "Simba", relationship: "child", birth_year: 2022, about: "Child (demo)." },
          { user_id: userId, name: "Hannah", relationship: "child", birth_year: 2025, about: "Child (demo)." },
        ],
        "id"
      );

      await insertReturningIds("pets", [{ user_id: userId, name: "Milo", type: "cat", notes: "Friendly household cat (demo)." }], "id");

      // 2) ACCOUNTS
      setStatusLine("Seeding accounts…");
      const accounts = await insertReturningIds(
        "accounts",
        [
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
            current_balance_cents: 1800_00,
            currency: "AUD",
          },
          {
            user_id: userId,
            name: "Savings",
            provider: "manual",
            type: "cash",
            status: "active",
            archived: false,
            current_balance_cents: 6200_00,
            currency: "AUD",
          },
        ],
        "id"
      );

      const everydayId = String(accounts[0]?.id);
      const billsBufferId = String(accounts[1]?.id);
      const savingsId = String(accounts[2]?.id);

      // 3) INCOME
      setStatusLine("Seeding income…");
      await insertReturningIds(
        "recurring_income",
        [
          {
            user_id: userId,
            name: "Ryan salary",
            amount_cents: 2400_00,
            currency: "AUD",
            cadence: "fortnightly",
            next_pay_at: toIsoLocalPlusDays(3, 9, 0),
            active: true,
            notes: "Main household income (demo).",
          },
          {
            user_id: userId,
            name: "Side income",
            amount_cents: 450_00,
            currency: "AUD",
            cadence: "monthly",
            next_pay_at: toIsoLocalPlusDays(12, 9, 0),
            active: true,
            notes: "Small monthly income (demo).",
          },
        ],
        "id"
      );

      // 4) BILLS + PAYMENTS
      setStatusLine("Seeding bills…");
      const recurringBills = await insertReturningIds(
        "recurring_bills",
        [
          {
            user_id: userId,
            name: "Internet",
            amount_cents: 89_00,
            currency: "AUD",
            cadence: "monthly",
            next_due_at: toIsoLocalPlusDays(4, 9, 0),
            autopay: true,
            active: true,
            notes: "Autopay (demo).",
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
            notes: "Manual payment (demo).",
          },
          {
            user_id: userId,
            name: "Car rego",
            amount_cents: 780_00,
            currency: "AUD",
            cadence: "yearly",
            next_due_at: toIsoLocalPlusDays(20, 9, 0),
            autopay: false,
            active: true,
            notes: "Annual bill (demo).",
          },
        ],
        "id"
      );

      setStatusLine("Seeding bill payments…");
      const internetBillId = String(recurringBills[0]?.id);
      const electricityBillId = String(recurringBills[1]?.id);

      await insertReturningIds(
        "bill_payments",
        [
          {
            user_id: userId,
            bill_id: internetBillId,
            paid_at: toIsoLocalPlusDays(-10, 9, 0),
            amount_cents: 89_00,
            currency: "AUD",
            note: "Paid (demo)",
            source: "manual",
          },
          {
            user_id: userId,
            bill_id: electricityBillId,
            paid_at: toIsoLocalPlusDays(-22, 9, 0),
            amount_cents: 198_00,
            currency: "AUD",
            note: "Paid (demo)",
            source: "manual",
          },
        ],
        "id"
      );

      // 5) BUDGET + CATEGORIES
      setStatusLine("Seeding budget…");
      await insertReturningIds(
        "budget_items",
        [
          { user_id: userId, name: "Groceries", kind: "expense", amount_cents: 950_00, cadence: "monthly", active: true, sort_order: 10 },
          { user_id: userId, name: "Fuel", kind: "expense", amount_cents: 320_00, cadence: "monthly", active: true, sort_order: 20 },
          { user_id: userId, name: "Kids", kind: "expense", amount_cents: 250_00, cadence: "monthly", active: true, sort_order: 30 },
          { user_id: userId, name: "Bills", kind: "expense", amount_cents: 520_00, cadence: "monthly", active: true, sort_order: 40 },
          { user_id: userId, name: "Savings", kind: "expense", amount_cents: 600_00, cadence: "monthly", active: true, sort_order: 50 },
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
        ],
        "id"
      );

      // 6) TRANSACTIONS
      setStatusLine("Seeding transactions…");
      const t = todayDate();
      const txRows = [
        { user_id: userId, account_id: everydayId, date: t, amount: -143.22, description: "Woolworths", merchant: "Woolworths", category: "Groceries", pending: false },
        { user_id: userId, account_id: everydayId, date: toDatePlusDays(-2), amount: -58.4, description: "Fuel", merchant: "BP", category: "Transport", pending: false },
        { user_id: userId, account_id: everydayId, date: toDatePlusDays(-4), amount: -12.9, description: "Coffee", merchant: "Cafe", category: "Living", pending: false },
        { user_id: userId, account_id: billsBufferId, date: toDatePlusDays(-6), amount: -89.0, description: "Internet", merchant: "ISP", category: "Bills", pending: false },
        { user_id: userId, account_id: billsBufferId, date: toDatePlusDays(-8), amount: -210.0, description: "Electricity", merchant: "Energy Co", category: "Bills", pending: true },
        { user_id: userId, account_id: savingsId, date: toDatePlusDays(-1), amount: 600.0, description: "Savings transfer", merchant: "Internal", category: "Savings", pending: false },
      ];
      await insertReturningIds("transactions", txRows, "id");

      // 7) INVESTMENTS + LIABILITIES
      setStatusLine("Seeding investments & liabilities…");
      await insertReturningIds(
        "investment_accounts",
        [
          { user_id: userId, name: "Super", kind: "super", institution: "Example Super", approx_value: 52000, currency: "AUD", notes: "Approx value (demo)." },
          { user_id: userId, name: "Brokerage", kind: "shares", institution: "Example Broker", approx_value: 8400, currency: "AUD", notes: "Approx value (demo)." },
        ],
        "id"
      );

      await insertReturningIds(
        "liabilities",
        [
          { user_id: userId, name: "Car loan", current_balance_cents: 8200_00, currency: "AUD", notes: "Demo liability.", archived: false },
          { user_id: userId, name: "Credit card", current_balance_cents: 1200_00, currency: "AUD", notes: "Demo liability.", archived: false },
        ],
        "id"
      );

      // 8) GOALS
      setStatusLine("Seeding money goals…");
      const goals = await insertReturningIds(
        "money_goals",
        [
          {
            user_id: userId,
            title: "Emergency buffer",
            currency: "AUD",
            target_cents: 3000_00,
            current_cents: 1800_00,
            target_date: toDatePlusDays(90),
            status: "active",
            notes: "Primary goal (demo).",
            is_primary: true,
            sort_order: 10,
          },
          {
            user_id: userId,
            title: "Family getaway",
            currency: "AUD",
            target_cents: 2500_00,
            current_cents: 600_00,
            target_date: toDatePlusDays(160),
            status: "active",
            notes: "Secondary goal (demo).",
            is_primary: false,
            sort_order: 20,
          },
        ],
        "id"
      );

      const emergencyId = String(goals[0]?.id);
      const getawayId = String(goals[1]?.id);

      setStatusLine("Linking goals to accounts…");
      await insertReturningIds(
        "money_goal_accounts",
        [
          { user_id: userId, goal_id: emergencyId, account_id: billsBufferId, weight: 70 },
          { user_id: userId, goal_id: emergencyId, account_id: savingsId, weight: 30 },
          { user_id: userId, goal_id: getawayId, account_id: savingsId, weight: 100 },
        ],
        "id"
      );

      setStatusLine("Seeding goal updates…");
      await insertReturningIds(
        "money_goal_updates",
        [
          { user_id: userId, goal_id: emergencyId, delta_cents: 200_00, currency: "AUD", note: "Added $200 (demo)", occurred_at: toIsoLocalPlusDays(-7, 9, 0) },
          { user_id: userId, goal_id: getawayId, delta_cents: 100_00, currency: "AUD", note: "Added $100 (demo)", occurred_at: toIsoLocalPlusDays(-14, 9, 0) },
        ],
        "id"
      );

      // 9) DOMAINS + CONSTELLATIONS (FIXED: NO upsert / ON CONFLICT)
      setStatusLine("Seeding domains & constellations…");

      const domains = await ensureByName(
        "domains",
        [
          { user_id: userId, name: "Family", emoji: "🏡", sort_order: 10 },
          { user_id: userId, name: "Money", emoji: "💸", sort_order: 20 },
          { user_id: userId, name: "Health", emoji: "🌿", sort_order: 30 },
        ],
        "name"
      );

      const familyDomainId = String((domains as any[]).find((d) => d?.name === "Family")?.id);
      const moneyDomainId = String((domains as any[]).find((d) => d?.name === "Money")?.id);

      if (!familyDomainId || familyDomainId === "undefined" || !moneyDomainId || moneyDomainId === "undefined") {
        throw new Error("Seeding failed: could not resolve domain IDs.");
      }

      const constellations = await ensureByName(
        "constellations",
        [
          { user_id: userId, name: "Home & stability", emoji: "🏠", sort_order: 10 },
          { user_id: userId, name: "Cashflow", emoji: "📈", sort_order: 20 },
        ],
        "name"
      );

      const homeConstId = String((constellations as any[]).find((c) => c?.name === "Home & stability")?.id);
      const cashConstId = String((constellations as any[]).find((c) => c?.name === "Cashflow")?.id);

      if (!homeConstId || homeConstId === "undefined" || !cashConstId || cashConstId === "undefined") {
        throw new Error("Seeding failed: could not resolve constellation IDs.");
      }

      // domain_constellations (no id) — idempotent insert
      await ensureDomainConstellations([
        { domain_id: familyDomainId, constellation_id: homeConstId },
        { domain_id: moneyDomainId, constellation_id: cashConstId },
      ]);

      // track by domain ids for reset (unchanged)
      remember("domain_constellations:by_domain_id", [familyDomainId, moneyDomainId]);

      // 10) CAPTURE / INBOX
      setStatusLine("Seeding captures & inbox…");
      const seedInboxRunId = safeUUID();

      const inboxRows = [
        {
          user_id: userId,
          run_id: seedInboxRunId,
          type: "capture",
          title: "Are we actually on track financially?",
          body: "I feel like we’re working hard but not moving forward. I want clarity.",
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key: `seed:${seedInboxRunId}:cap:1`,
          action_label: null,
          action_href: null,
          framed_decision_id: null,
        },
        {
          user_id: userId,
          run_id: seedInboxRunId,
          type: "capture",
          title: "Should we plan a small family getaway?",
          body: "Not huge — just something to look forward to. But I don’t want money stress.",
          severity: 1,
          status: "open",
          snoozed_until: null,
          dedupe_key: `seed:${seedInboxRunId}:cap:2`,
          action_label: null,
          action_href: null,
          framed_decision_id: null,
        },
        {
          user_id: userId,
          run_id: seedInboxRunId,
          type: "manual",
          title: "Review bills due soon",
          body: "Quick check: autopay vs manual. Mark paid where needed.",
          severity: 2,
          status: "open",
          snoozed_until: null,
          dedupe_key: `seed:${seedInboxRunId}:manual:1`,
          action_label: "Open Bills",
          action_href: "/bills",
          framed_decision_id: null,
        },
        {
          user_id: userId,
          run_id: seedInboxRunId,
          type: "manual",
          title: "Look at your emergency buffer goal",
          body: "Is it moving forward each month?",
          severity: 1,
          status: "open",
          snoozed_until: null,
          dedupe_key: `seed:${seedInboxRunId}:manual:2`,
          action_label: "Open Goals",
          action_href: "/goals",
          framed_decision_id: null,
        },
      ];

      const inboxCreated = await insertReturningIds("decision_inbox", inboxRows, "id");
      const cap1InboxId = String(inboxCreated[0]?.id);
      const cap2InboxId = String(inboxCreated[1]?.id);

      // 11) DECISIONS / REVIEW / CHAPTERS
      setStatusLine("Seeding decisions…");
      const decisions = await insertReturningIds(
        "decisions",
        [
          {
            user_id: userId,
            inbox_item_id: cap1InboxId,
            title: "Are we on track financially?",
            context: "Captured:\nI feel like we’re working hard but not moving forward. I want clarity.",
            status: "draft",
            origin: "capture",
            framed_at: new Date().toISOString(),
            decided_at: null,
            review_at: toIsoLocalPlusDays(14, 9, 0),
            pinned: true,
          },
          {
            user_id: userId,
            inbox_item_id: cap2InboxId,
            title: "Plan a small family getaway?",
            context: "Captured:\nNot huge — just something to look forward to. But I don’t want money stress.",
            status: "decided",
            origin: "capture",
            framed_at: new Date().toISOString(),
            decided_at: toIsoLocalPlusDays(-5, 9, 0),
            review_at: toIsoLocalPlusDays(30, 9, 0),
            pinned: false,
            user_reasoning: "We’ll keep it small and use the getaway goal to prevent guilt/spend drift.",
          },
          {
            user_id: userId,
            inbox_item_id: null,
            title: "Close out the old storage unit",
            context: "Decision completed and released.",
            status: "chapter",
            origin: "manual",
            framed_at: toIsoLocalPlusDays(-40, 9, 0),
            decided_at: toIsoLocalPlusDays(-35, 9, 0),
            review_at: null,
            chaptered_at: toIsoLocalPlusDays(-1, 9, 0),
            pinned: false,
          },
        ],
        "id"
      );

      const d1 = String(decisions[0]?.id);
      const d2 = String(decisions[1]?.id);
      const d3 = String(decisions[2]?.id);

      setStatusLine("Linking captures to decisions…");
      {
        const res = await (supabase as any)
          .from("decision_inbox")
          .update({ framed_decision_id: d1, status: "done" })
          .eq("user_id", userId)
          .eq("id", cap1InboxId);
        if (res?.error) throw res.error;
      }
      {
        const res = await (supabase as any)
          .from("decision_inbox")
          .update({ framed_decision_id: d2, status: "done" })
          .eq("user_id", userId)
          .eq("id", cap2InboxId);
        if (res?.error) throw res.error;
      }

      setStatusLine("Seeding decision domains…");
      {
        const res = await (supabase as any).from("decision_domains").insert([
          { user_id: userId, decision_id: d1, domain_id: moneyDomainId },
          { user_id: userId, decision_id: d2, domain_id: familyDomainId },
          { user_id: userId, decision_id: d3, domain_id: familyDomainId },
        ]);
        if (res?.error) throw res.error;
        remember("decision_domains:by_decision_id", [d1, d2, d3]);
      }

      setStatusLine("Seeding constellation items…");
      {
        const res = await (supabase as any).from("constellation_items").insert([
          { user_id: userId, constellation_id: cashConstId, decision_id: d1 },
          { user_id: userId, constellation_id: homeConstId, decision_id: d2 },
        ]);
        if (res?.error) throw res.error;
        remember("constellation_items:by_decision_id", [d1, d2]);
      }

      setStatusLine("Seeding decision notes & summaries…");
      await insertReturningIds(
        "decision_notes",
        [
          { user_id: userId, decision_id: d1, kind: "note", body: "What would ‘on track’ mean for us? (demo note)" },
          { user_id: userId, decision_id: d2, kind: "note", body: "Plan: small trip, off-peak, cap spend. (demo note)" },
        ],
        "id"
      );

      await insertReturningIds(
        "decision_summaries",
        [{ user_id: userId, decision_id: d2, summary_text: "Decided: plan a small getaway; use the goal to keep it calm and contained." }],
        "id"
      );

      await insertReturningIds("decision_links", [{ user_id: userId, from_decision_id: d1, to_decision_id: d2, label: "informs" }], "id");

      setStatusLine("Saving demo seed run…");
      const saved = await upsertSeedRun(userId, {
        dataset_version: "v1",
        run_id: runId,
        created_ids,
      });
      setSeedRun(saved);

      setStatus("done");
      setStatusLine("Seed complete ✅");
      notify({ title: "Seed complete", description: "Full demo dataset added across Money + Decide + Family + Capture." });
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
              Populates Money, Decide, Review, Chapters, Family, and Capture with a coherent test “world”. It is idempotent: if already seeded, it won’t duplicate.
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
                Reset order respects likely foreign keys (goal updates → goal accounts → goals → transactions → payments → bills → income → decisions graph → inbox → family → accounts).
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}
