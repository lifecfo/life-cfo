// app/api/home/status/run/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type Status = "all_clear" | "tight" | "attention" | "unknown";

type RunRequest = {
  userId: string;
  force?: boolean; // if true, run even if recently checked
};

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

function isoDay(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// Deterministic monitor rules (V1)
// - unknown if we can't see balances or bills
// - attention if any currency has bills > balances, or balances <= 0 while bills exist
// - tight if within 25% margin
// - all_clear otherwise
function evaluateStatus(input: {
  balancesByCur: Record<string, number>;
  billsByCur: Record<string, number>;
  hasBalances: boolean;
  hasBills: boolean;
}) {
  const { balancesByCur, billsByCur, hasBalances, hasBills } = input;

  const currencies = Array.from(new Set([...Object.keys(balancesByCur), ...Object.keys(billsByCur)]));

  if (!hasBalances || !hasBills) {
    const reasons = [
      {
        rule: "insufficient_data",
        severity: "unknown",
        detail: !hasBalances && !hasBills ? "no balances and no bills" : !hasBalances ? "no balances" : "no bills",
      },
    ];
    return { status: "unknown" as Status, reasons };
  }

  const reasons: any[] = [];
  let anyAttention = false;
  let anyTight = false;

  for (const cur of currencies) {
    const bal = balancesByCur[cur] ?? 0;
    const bill = billsByCur[cur] ?? 0;

    if (bill > 0 && bal <= 0) {
      anyAttention = true;
      reasons.push({ rule: "bills_without_balance", severity: "attention", currency: cur });
      continue;
    }

    if (bill > 0 && bal < bill) {
      anyAttention = true;
      reasons.push({ rule: "coverage_short", severity: "attention", currency: cur });
      continue;
    }

    if (bill > 0 && bal < bill * 1.25) {
      anyTight = true;
      reasons.push({ rule: "thin_margin", severity: "tight", currency: cur });
      continue;
    }
  }

  if (anyAttention) return { status: "attention" as Status, reasons };
  if (anyTight) return { status: "tight" as Status, reasons };
  return { status: "all_clear" as Status, reasons: reasons.length ? reasons : [{ rule: "no_exceptions", severity: "all_clear" }] };
}

function statusHeadline(status: Status) {
  if (status === "attention") return "One thing may need attention (from what I can see).";
  if (status === "tight") return "You look okay, but it’s a bit tighter than usual (from what I can see).";
  if (status === "unknown") return "I can’t give a clear check-in yet — I don’t have enough visible data.";
  return "You look okay right now (from what I can see).";
}

// AI memo is optional, and only used to write a calmer, clearer memo from deterministic output.
async function maybeWriteMemo(opts: {
  useAi: boolean;
  status: Status;
  factsSnapshot: any;
  reasons: any[];
}) {
  const { useAi, status, factsSnapshot, reasons } = opts;

  if (!useAi) return null;

  const SYSTEM = `
You are Life CFO.
Write a short, calm "CFO memo" for Home.

Rules:
- 1 headline sentence max.
- Then up to 3 bullets.
- No urgency words. No guilt. No "you should".
- Be explicit this is a snapshot.
- Use ONLY the provided snapshot.
- If status is unknown, say what you can’t see.
`.trim();

  const USER = JSON.stringify({ status, reasons, factsSnapshot }, null, 2);

  const resp = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: SYSTEM },
      { role: "user", content: USER },
    ],
    text: { format: { type: "text" } },
  });

  const txt = (resp.output_text || "").trim();
  return txt ? txt.slice(0, 1200) : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<RunRequest>;
    const userId = String(body.userId ?? "").trim();
    const force = body.force === true;

    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return NextResponse.json({ error: "Missing Supabase service role env" }, { status: 500 });

    const supabase = createClient(url, key);

    // Fetch latest run (if any)
    const { data: latest, error: latestErr } = await supabase
      .from("home_status_latest")
      .select("id,status,checked_at,memo_text")
      .eq("user_id", userId)
      .maybeSingle();

    // Decide whether we should run
    const now = Date.now();
    const lastCheckedMs = typeof latest?.checked_at === "string" ? Date.parse(latest.checked_at) : NaN;
    const ageMs = Number.isFinite(lastCheckedMs) ? now - lastCheckedMs : Number.POSITIVE_INFINITY;

    // V1 cadence: run if older than 6 hours (or forced)
    const STALE_MS = 6 * 60 * 60 * 1000;
    const shouldRun = force || ageMs > STALE_MS;

    if (!shouldRun && !latestErr) {
      return NextResponse.json({ ok: true, ran: false, latest });
    }

    // ---- Build minimal snapshot (deterministic) ----
    const { start, end } = monthBoundsLocal();

    const { data: accounts, error: acctErr } = await supabase
      .from("accounts")
      .select("id,current_balance_cents,currency,archived")
      .eq("user_id", userId)
      .eq("archived", false)
      .limit(200);

    const acctRows = Array.isArray(accounts) ? accounts : [];
    const balancesRows = acctRows
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

    const balancesByCur = sumByCurrency(balancesRows);

    const { data: bills, error: billsErr } = await supabase
      .from("recurring_bills")
      .select("id,name,amount_cents,currency,next_due_at,active,autopay")
      .eq("user_id", userId)
      .eq("active", true)
      .order("next_due_at", { ascending: true })
      .limit(500);

    const billRows = Array.isArray(bills) ? bills : [];
    const activeBills = billRows
      .map((b: any) => {
        const cents = typeof b?.amount_cents === "number" ? b.amount_cents : b?.amount_cents == null ? null : Number(b.amount_cents);
        if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
        const cur = String(b?.currency ?? "AUD").toUpperCase();
        const next_due_at = typeof b?.next_due_at === "string" ? b.next_due_at : null;
        return {
          id: String(b?.id),
          name: String(b?.name ?? "Bill"),
          currency: cur,
          cents,
          next_due_at,
          autopay: !!b?.autopay,
        };
      })
      .filter(
        (x): x is { id: string; name: string; currency: string; cents: number; next_due_at: string | null; autopay: boolean } => x !== null
      );

    const billsByCur = sumByCurrency(activeBills.map((b) => ({ currency: b.currency, cents: b.cents })));

    const dueThisMonth = activeBills.filter((b) => {
      if (!b.next_due_at) return false;
      const ms = Date.parse(b.next_due_at);
      if (Number.isNaN(ms)) return false;
      return ms >= start.getTime() && ms < end.getTime();
    });

    const soonWindowMs = 14 * 24 * 60 * 60 * 1000;
    const dueSoon = activeBills.filter((b) => {
      if (!b.next_due_at) return false;
      const ms = Date.parse(b.next_due_at);
      if (Number.isNaN(ms)) return false;
      return ms >= now && ms <= now + soonWindowMs;
    });

    const evalRes = evaluateStatus({
      balancesByCur,
      billsByCur,
      hasBalances: balancesRows.length > 0,
      hasBills: activeBills.length > 0,
    });

    const factsSnapshot = {
      as_of_iso: new Date().toISOString(),
      data_quality: {
        accounts_ok: !acctErr,
        bills_ok: !billsErr,
        accounts_count_active: acctRows.length,
        bills_count_active: billRows.length,
      },
      balances_by_currency: Object.entries(balancesByCur).map(([currency, cents]) => ({
        currency,
        balance: moneyFromCents(cents, currency),
        balance_cents: cents,
      })),
      recurring_bills_totals_by_currency: Object.entries(billsByCur).map(([currency, cents]) => ({
        currency,
        total: moneyFromCents(cents, currency),
        total_cents: cents,
      })),
      due_soon: dueSoon.slice(0, 5).map((b) => ({
        id: b.id,
        name: b.name,
        due: b.next_due_at ? isoDay(b.next_due_at) : null,
        amount: moneyFromCents(b.cents, b.currency),
        autopay: b.autopay,
        currency: b.currency,
      })),
      due_this_month_count: dueThisMonth.length,
    };

    const prevStatus = typeof latest?.status === "string" ? (latest.status as Status) : null;
    const statusChanged = prevStatus !== evalRes.status;

    // AI memo generation policy (V1):
    // - use AI only when status changes OR the previous memo is missing
    const useAi = statusChanged || !latest?.memo_text;

    const memoText =
      (await maybeWriteMemo({
        useAi,
        status: evalRes.status,
        factsSnapshot,
        reasons: evalRes.reasons,
      })) ?? null;

    // If AI didn't run (or returned null), still store a deterministic memo headline
    const memoFallback =
      memoText ||
      [
        statusHeadline(evalRes.status),
        "",
        ...(() => {
          const bullets: string[] = [];
          const bal = factsSnapshot.balances_by_currency?.[0];
          const billsTot = factsSnapshot.recurring_bills_totals_by_currency?.[0];

          if (bal?.balance) bullets.push(`• Balances visible (${bal.currency}): ${bal.balance}`);
          if (billsTot?.total) bullets.push(`• Recurring commitments (${billsTot.currency}): ${billsTot.total}`);
          if (factsSnapshot.due_soon?.length) bullets.push(`• Next 14 days: ${factsSnapshot.due_soon.length} bill(s) coming up`);
          return bullets.slice(0, 3);
        })(),
      ]
        .filter(Boolean)
        .join("\n");

    // Write run (append-only)
    const { data: inserted, error: insErr } = await supabase
      .from("home_status_runs")
      .insert({
        user_id: userId,
        status: evalRes.status,
        reasons: evalRes.reasons,
        facts_snapshot: factsSnapshot,
        memo_text: memoFallback,
        checked_at: new Date().toISOString(),
      })
      .select("id,status,checked_at,memo_text")
      .maybeSingle();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ran: true,
      inserted,
      changed: statusChanged,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
