// app/api/home/checkin/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckinStatus = "all_clear" | "tight" | "attention" | "unknown";

type CheckinResponse = {
  status: CheckinStatus;
  headline: string;
  bullets: string[];
  as_of_iso: string;
  data_quality: {
    accounts_ok: boolean;
    bills_ok: boolean;
    accounts_count: number;
    bills_count_active: number;
    bills_due_this_month_count: number;
    currencies_seen: string[];
    note: string;
  };
};

type CheckinRequest = { userId: string };

function monthBoundsLocal() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function moneyFromCents(cents: number | null | undefined, currency: string | null | undefined) {
  const n = typeof cents === "number" ? cents : cents == null ? null : Number(cents);
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const cur = (currency || "AUD").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n / 100);
  } catch {
    return `${cur} ${(n / 100).toFixed(2)}`;
  }
}

function sumByCurrency(rows: Array<{ currency: string; cents: number }>) {
  return rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.currency] = (acc[r.currency] ?? 0) + r.cents;
    return acc;
  }, {});
}

function classify(
  balancesByCur: Record<string, number>,
  billsByCur: Record<string, number>,
  hasAnyBalances: boolean,
  hasAnyBills: boolean
): { status: CheckinStatus; headline: string } {
  // If we can’t see enough to make a meaningful check-in, say so plainly.
  if (!hasAnyBalances && !hasAnyBills) {
    return {
      status: "unknown",
      headline: "I can’t give a clear check-in yet — I can’t see any balances or bills.",
    };
  }
  if (!hasAnyBalances) {
    return {
      status: "unknown",
      headline: "I can’t give a clear check-in yet — I can’t see any account balances.",
    };
  }
  if (!hasAnyBills) {
    // Still useful: reassurance based on balances alone, but bounded.
    return {
      status: "unknown",
      headline: "I can see your balances, but I can’t see any recurring bills yet — so I can’t confirm coverage.",
    };
  }

  // Evaluate each currency we see in either set.
  const currencies = Array.from(new Set([...Object.keys(balancesByCur), ...Object.keys(billsByCur)]));

  // If bills exist in a currency with no balances visible → needs attention.
  for (const cur of currencies) {
    const bal = balancesByCur[cur] ?? 0;
    const bill = billsByCur[cur] ?? 0;
    if (bill > 0 && bal <= 0) {
      return {
        status: "attention",
        headline: `One area may need attention: I can see bills in ${cur}, but no visible balance in ${cur}.`,
      };
    }
  }

  // Simple coverage heuristic (bounded, not “permission”):
  // - attention if balances < bills
  // - tight if balances within 25% buffer of bills
  // - all_clear otherwise
  let anyAttention = false;
  let anyTight = false;

  for (const cur of currencies) {
    const bal = balancesByCur[cur] ?? 0;
    const bill = billsByCur[cur] ?? 0;

    if (bill <= 0) continue;

    if (bal < bill) anyAttention = true;
    else if (bal < bill * 1.25) anyTight = true;
  }

  if (anyAttention) return { status: "attention", headline: "This month may be tight from what I can see — coverage looks short in at least one area." };
  if (anyTight) return { status: "tight", headline: "You look okay, but it’s a bit tighter this month — there’s a smaller margin than usual." };
  return { status: "all_clear", headline: "You look okay right now (from what I can see). Bills appear covered with room to spare." };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CheckinRequest>;
    const userId = String(body.userId ?? "").trim();

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { start, end } = monthBoundsLocal();

    // Accounts (active)
    const { data: accounts, error: acctErr } = await supabase
      .from("accounts")
      .select("id,name,current_balance_cents,currency,archived,updated_at")
      .eq("user_id", userId)
      .eq("archived", false)
      .limit(100);

    const acctRows = Array.isArray(accounts) ? accounts : [];
    const balances = acctRows
      .map((a: any) => {
        const cents =
          typeof a?.current_balance_cents === "number"
            ? a.current_balance_cents
            : a?.current_balance_cents == null
              ? null
              : Number(a.current_balance_cents);
        if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
        const cur = String(a?.currency ?? "AUD").toUpperCase();
        return { currency: cur, cents };
      })
      .filter((x): x is { currency: string; cents: number } => x !== null);

    const balancesByCur = sumByCurrency(balances);

    // Bills (active recurring)
    const { data: recurringBills, error: billsErr } = await supabase
      .from("recurring_bills")
      .select("id,amount_cents,currency,next_due_at,active")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(500);

    const billRows = Array.isArray(recurringBills) ? recurringBills : [];
    const activeBills = billRows
      .map((b: any) => {
        const cents = typeof b?.amount_cents === "number" ? b.amount_cents : b?.amount_cents == null ? null : Number(b.amount_cents);
        if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
        const cur = String(b?.currency ?? "AUD").toUpperCase();
        const next_due_at = typeof b?.next_due_at === "string" ? b.next_due_at : null;
        return { currency: cur, cents, next_due_at };
      })
      .filter((x): x is { currency: string; cents: number; next_due_at: string | null } => x !== null);

    const billsByCur = sumByCurrency(activeBills.map((b) => ({ currency: b.currency, cents: b.cents })));

    const dueThisMonthCount = activeBills.filter((b) => {
      if (!b.next_due_at) return false;
      const ms = Date.parse(b.next_due_at);
      if (Number.isNaN(ms)) return false;
      return ms >= start.getTime() && ms < end.getTime();
    }).length;

    const currenciesSeen = Array.from(new Set([...Object.keys(balancesByCur), ...Object.keys(billsByCur)]));

    const hasAnyBalances = balances.length > 0;
    const hasAnyBills = activeBills.length > 0;

    const { status, headline } = classify(balancesByCur, billsByCur, hasAnyBalances, hasAnyBills);

    // Bullets: max 2, calm + bounded
    const bullets: string[] = [];
    const cur = currenciesSeen[0] || "AUD";

    if (hasAnyBalances) {
      const totalBal = balancesByCur[cur];
      bullets.push(
        totalBal != null
          ? `Balances visible (${cur}): ${moneyFromCents(totalBal, cur)}`
          : `Balances visible: ${Object.keys(balancesByCur).length} currency set(s)`
      );
    } else {
      bullets.push("Balances visible: none");
    }

    if (hasAnyBills) {
      const totalBills = billsByCur[cur];
      bullets.push(
        totalBills != null
          ? `Recurring commitments (${cur}): ${moneyFromCents(totalBills, cur)}`
          : `Recurring commitments: ${Object.keys(billsByCur).length} currency set(s)`
      );
    } else {
      bullets.push("Recurring commitments: none");
    }

    const resp: CheckinResponse = {
      status,
      headline,
      bullets: bullets.slice(0, 2),
      as_of_iso: new Date().toISOString(),
      data_quality: {
        accounts_ok: !acctErr,
        bills_ok: !billsErr,
        accounts_count: acctRows.length,
        bills_count_active: billRows.length,
        bills_due_this_month_count: dueThisMonthCount,
        currencies_seen: currenciesSeen,
        note:
          "Check-in is a read-only snapshot based on visible accounts + recurring bills. It does not run AI and does not save anything.",
      },
    };

    return NextResponse.json(resp);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
