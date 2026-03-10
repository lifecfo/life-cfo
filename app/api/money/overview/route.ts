import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MoneyByCurrency = Record<string, number>;

function addMoney(map: MoneyByCurrency, currency: string | null | undefined, cents: number) {
  const cur = (currency || "AUD").toUpperCase();
  map[cur] = (map[cur] ?? 0) + cents;
}

function mapToRows(map: MoneyByCurrency) {
  return Object.entries(map)
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function safeNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);

    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const monthStart = startOfMonthISO();
    const monthEnd = endOfMonthISO();
    const now = nowIso();
    const next30 = plusDaysIso(30);

    const [
      accountsRes,
      recentTxRes,
      monthTxRes,
      recurringBillsRes,
      recurringIncomeRes,
      moneyGoalsRes,
      liabilitiesRes,
      budgetItemsRes,
      connectionsRes,
      investmentAccountsRes,
    ] = await Promise.all([
      supabase
        .from("accounts")
        .select(
          "id,household_id,name,provider,type,status,archived,current_balance_cents,available_balance_cents,currency,updated_at,created_at"
        )
        .eq("household_id", householdId)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),

      supabase
        .from("transactions")
        .select(
          "id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at"
        )
        .eq("household_id", householdId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(12),

      supabase
        .from("transactions")
        .select(
          "id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,created_at,updated_at"
        )
        .eq("household_id", householdId)
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: false })
        .limit(1000),

      supabase
        .from("recurring_bills")
        .select("id,name,amount_cents,currency,cadence,next_due_at,autopay,active,notes")
        .eq("household_id", householdId)
        .eq("active", true)
        .order("next_due_at", { ascending: true })
        .limit(100),

      supabase
        .from("recurring_income")
        .select("id,name,amount_cents,currency,cadence,next_pay_at,active,notes")
        .eq("household_id", householdId)
        .eq("active", true)
        .order("next_pay_at", { ascending: true })
        .limit(100),

      supabase
        .from("money_goals")
        .select("id,title,currency,target_cents,current_cents,status,target_date,deadline_at,is_primary,updated_at")
        .eq("household_id", householdId)
        .order("is_primary", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(20),

      supabase
        .from("liabilities")
        .select("id,name,current_balance_cents,currency,archived,updated_at")
        .eq("household_id", householdId)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(100),

      supabase
        .from("budget_items")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId),

      supabase
        .from("external_connections")
        .select("id,status,last_sync_at,updated_at,provider")
        .eq("household_id", householdId)
        .order("updated_at", { ascending: false }),

      supabase
        .from("investment_accounts")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId),
    ]);

    if (accountsRes.error) throw accountsRes.error;
    if (recentTxRes.error) throw recentTxRes.error;
    if (monthTxRes.error) throw monthTxRes.error;
    if (recurringBillsRes.error) throw recurringBillsRes.error;
    if (recurringIncomeRes.error) throw recurringIncomeRes.error;
    if (moneyGoalsRes.error) throw moneyGoalsRes.error;
    if (liabilitiesRes.error) throw liabilitiesRes.error;
    if (budgetItemsRes.error) throw budgetItemsRes.error;
    if (connectionsRes.error) throw connectionsRes.error;
    if (investmentAccountsRes.error) throw investmentAccountsRes.error;

    const accounts = accountsRes.data ?? [];
    const recentTransactions = recentTxRes.data ?? [];
    const monthTransactions = monthTxRes.data ?? [];
    const recurringBills = recurringBillsRes.data ?? [];
    const recurringIncome = recurringIncomeRes.data ?? [];
    const goals = moneyGoalsRes.data ?? [];
    const liabilities = liabilitiesRes.data ?? [];
    const connections = connectionsRes.data ?? [];

    const totalBalanceByCurrency: MoneyByCurrency = {};
    const savedByCurrency: MoneyByCurrency = {};
    const inMonthByCurrency: MoneyByCurrency = {};
    const outMonthByCurrency: MoneyByCurrency = {};
    const upcomingBillsByCurrency: MoneyByCurrency = {};
    const upcomingIncomeByCurrency: MoneyByCurrency = {};
    const liabilitiesByCurrency: MoneyByCurrency = {};
    const categorySpend = new Map<string, number>();

    for (const a of accounts) {
      const cents = safeNum(a.current_balance_cents);
      addMoney(totalBalanceByCurrency, a.currency, cents);
      if (cents > 0) addMoney(savedByCurrency, a.currency, cents);
    }

    for (const t of monthTransactions) {
      const cents =
        typeof t.amount_cents === "number"
          ? t.amount_cents
          : typeof t.amount === "number"
            ? Math.round(t.amount * 100)
            : 0;

      if (cents > 0) {
        addMoney(inMonthByCurrency, t.currency, cents);
      } else if (cents < 0) {
        const abs = Math.abs(cents);
        addMoney(outMonthByCurrency, t.currency, abs);

        const cat = String(t.category || "Uncategorised").trim() || "Uncategorised";
        categorySpend.set(cat, (categorySpend.get(cat) ?? 0) + abs);
      }
    }

    const upcomingBills = recurringBills.filter((b) => {
      if (!b.next_due_at) return false;
      return b.next_due_at >= now && b.next_due_at <= next30;
    });

    for (const b of upcomingBills) {
      addMoney(upcomingBillsByCurrency, b.currency, safeNum(b.amount_cents));
    }

    const upcomingIncome = recurringIncome.filter((i) => {
      if (!i.next_pay_at) return false;
      return i.next_pay_at >= now && i.next_pay_at <= next30;
    });

    for (const i of upcomingIncome) {
      addMoney(upcomingIncomeByCurrency, i.currency, safeNum(i.amount_cents));
    }

    for (const l of liabilities) {
      addMoney(liabilitiesByCurrency, l.currency, safeNum(l.current_balance_cents));
    }

    const topSpendingCategories = Array.from(categorySpend.entries())
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 5);

    const activeConnections = connections.filter((c) => c.status === "active");
    const latestSyncAt =
      [...connections]
        .map((c) => c.last_sync_at || c.updated_at || null)
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null;

    const positiveBalanceAccounts = [...accounts]
      .filter((a) => safeNum(a.current_balance_cents) > 0)
      .sort((a, b) => safeNum(b.current_balance_cents) - safeNum(a.current_balance_cents))
      .slice(0, 5);

    const goalPreview = goals
      .filter((g) => String(g.status || "active") !== "archived")
      .slice(0, 5)
      .map((g) => ({
        id: g.id,
        title: g.title,
        currency: g.currency,
        current_cents: safeNum(g.current_cents),
        target_cents: safeNum(g.target_cents),
        status: g.status,
        is_primary: g.is_primary,
      }));

    return NextResponse.json({
      ok: true,
      household_id: householdId,

      live: {
        status: activeConnections.length > 0 ? "live" : "offline",
        total_connections: connections.length,
        active_connections: activeConnections.length,
        last_sync_at: latestSyncAt,
      },

      totals: {
        balance_by_currency: mapToRows(totalBalanceByCurrency),
        accounts_count: accounts.length,
        transactions_count: recentTransactions.length,
      },

      in_flow: {
        month_total_by_currency: mapToRows(inMonthByCurrency),
        recurring_income_count: recurringIncome.length,
        upcoming_income_count_next_30_days: upcomingIncome.length,
        upcoming_income_total_by_currency: mapToRows(upcomingIncomeByCurrency),
        upcoming_income: upcomingIncome.slice(0, 5),
      },

      out_flow: {
        month_total_by_currency: mapToRows(outMonthByCurrency),
        top_spending_categories: topSpendingCategories,
        recurring_bills_count: recurringBills.length,
        upcoming_bills_count_next_30_days: upcomingBills.length,
        upcoming_bills_total_by_currency: mapToRows(upcomingBillsByCurrency),
        upcoming_bills: upcomingBills.slice(0, 5),
      },

      saved_flow: {
        saved_total_by_currency: mapToRows(savedByCurrency),
        positive_balance_accounts: positiveBalanceAccounts,
        goals_count: goals.filter((g) => String(g.status || "active") !== "archived").length,
        goals_preview: goalPreview,
        investment_accounts_count: investmentAccountsRes.count ?? 0,
      },

      planned_flow: {
        upcoming_bills_count: upcomingBills.length,
        upcoming_bills: upcomingBills.slice(0, 5),
        liabilities_count: liabilities.length,
        liabilities_total_by_currency: mapToRows(liabilitiesByCurrency),
        budget_items_count: budgetItemsRes.count ?? 0,
      },

      supporting: {
        accounts: accounts.slice(0, 5),
        recent_transactions: recentTransactions.slice(0, 8),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Money overview fetch failed" },
      { status: 500 }
    );
  }
}