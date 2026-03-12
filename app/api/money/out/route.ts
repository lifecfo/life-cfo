import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getHouseholdMoneyTruth } from "@/lib/money/reasoning/getHouseholdMoneyTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MoneyByCurrency = Record<string, number>;

function addMoney(
  map: MoneyByCurrency,
  currency: string | null | undefined,
  cents: number
) {
  const cur = (currency || "AUD").toUpperCase();
  map[cur] = (map[cur] ?? 0) + cents;
}

function mapToRows(map: MoneyByCurrency) {
  return Object.entries(map)
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function safeNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);

    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "User not linked to a household." },
        { status: 400 }
      );
    }

    const truth = await getHouseholdMoneyTruth(supabase, { householdId });
    const monthTransactions = truth.month_transactions ?? [];
    const recentTransactions = truth.recent_transactions ?? [];
    const recurringBills = truth.recurring_bills ?? [];
    const nowMs = toMs(truth.windows?.now_iso) ?? toMs(truth.as_of_iso) ?? Date.now();
    const next30Ms =
      toMs(truth.windows?.next30_iso) ?? nowMs + 30 * 24 * 60 * 60 * 1000;

    const outMonthByCurrency: MoneyByCurrency = {};
    const categorySpend = new Map<string, number>();
    const merchantSpend = new Map<string, number>();

    for (const t of monthTransactions) {
      const cents =
        typeof t.amount_cents === "number"
          ? t.amount_cents
          : typeof t.amount === "number"
            ? Math.round(t.amount * 100)
            : 0;

      if (cents < 0) {
        const abs = Math.abs(cents);
        addMoney(outMonthByCurrency, t.currency, abs);

        const category =
          String(t.category || "Uncategorised").trim() || "Uncategorised";
        categorySpend.set(category, (categorySpend.get(category) ?? 0) + abs);

        const merchant =
          String(t.merchant || t.description || "Unknown").trim() || "Unknown";
        merchantSpend.set(merchant, (merchantSpend.get(merchant) ?? 0) + abs);
      }
    }

    const topCategories = Array.from(categorySpend.entries())
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 8);

    const topMerchants = Array.from(merchantSpend.entries())
      .map(([merchant, cents]) => ({ merchant, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 8);

    const recentOutTransactions = recentTransactions
      .filter((t) => {
        const cents =
          typeof t.amount_cents === "number"
            ? t.amount_cents
            : typeof t.amount === "number"
              ? Math.round(t.amount * 100)
              : 0;
        return cents < 0;
      })
      .slice(0, 12);

    const upcomingBills = recurringBills.filter((b) => {
      const dueMs = toMs(b.next_due_at);
      return dueMs !== null && dueMs >= nowMs && dueMs <= next30Ms;
    });

    const recurringBillsByCurrency: MoneyByCurrency = {};
    for (const b of recurringBills) {
      addMoney(recurringBillsByCurrency, b.currency, safeNum(b.amount_cents));
    }

    const upcomingBillsByCurrency: MoneyByCurrency = {};
    for (const b of upcomingBills) {
      addMoney(upcomingBillsByCurrency, b.currency, safeNum(b.amount_cents));
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      out_flow: {
        month_total_by_currency: mapToRows(outMonthByCurrency),
        top_categories: topCategories,
        top_merchants: topMerchants,
        recent_out_transactions: recentOutTransactions,
        recurring_bills_count: recurringBills.length,
        recurring_bills_total_by_currency: mapToRows(recurringBillsByCurrency),
        upcoming_bills_count_next_30_days: upcomingBills.length,
        upcoming_bills_total_by_currency: mapToRows(upcomingBillsByCurrency),
        upcoming_bills: upcomingBills.slice(0, 8),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Money out fetch failed" },
      { status: 500 }
    );
  }
}
