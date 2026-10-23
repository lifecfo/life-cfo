import { NextResponse } from "next/server";

import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { deriveTransactionOutflowSummary } from "@/lib/money/reasoning/deriveTransactionOutflows";
import type { TransactionsTruthRow } from "@/lib/money/reasoning/types";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });

  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(supabase, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Household lookup failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
  if (!householdId) return NextResponse.json({ ok: true, imported: false, patterns: [], photos: [], categories: [] });

  const since = new Date();
  since.setUTCDate(1);
  const monthStart = since.toISOString().slice(0, 10);

  const [transactions, confirmations, photos] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,provider,created_at,updated_at")
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .limit(2000),
    supabase.from("transaction_pattern_confirmations").select("pattern_key,kind").eq("household_id", householdId),
    supabase
      .from("household_receipts")
      .select("id,created_at,item_id")
      .eq("household_id", householdId)
      .is("item_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (transactions.error) {
    return NextResponse.json({ ok: false, error: "Imported rows could not be loaded." }, { status: 500 });
  }

  const photoRows = photos.error ? [] : (photos.data ?? []);

  const rows = (transactions.data ?? []) as TransactionsTruthRow[];
  const monthRows = rows.filter((row) => (row.date || "") >= monthStart);
  const summary = deriveTransactionOutflowSummary({
    monthTransactions: monthRows,
    rollingTransactions: rows,
    connections: [],
  });
  const reviewed = new Set(
    (confirmations.data ?? []).map((row) => (typeof row.pattern_key === "string" ? row.pattern_key : ""))
  );
  const patterns = [
    ...summary.likely_regular_outflows.map((pattern) => ({ ...pattern, detected_kind: "bill" as const })),
    ...summary.likely_income.map((pattern) => ({ ...pattern, detected_kind: "income" as const })),
  ].filter((pattern) => !reviewed.has(pattern.pattern_key));

  const categories = new Map<string, number>();
  for (const row of monthRows) {
    const cents = typeof row.amount_cents === "number" ? row.amount_cents : 0;
    if (cents >= 0) continue;
    const name = (row.category || "Uncategorised").trim() || "Uncategorised";
    categories.set(name, (categories.get(name) ?? 0) + Math.abs(cents));
  }

  return NextResponse.json({
    ok: true,
    imported: rows.length > 0,
    categories: [...categories.entries()]
      .map(([name, cents]) => ({ name, cents }))
      .sort((left, right) => right.cents - left.cents)
      .slice(0, 12),
    month_outflow: summary.month_outflow_by_currency,
    patterns,
    photos: photoRows.map((row) => ({ id: row.id, created_at: row.created_at })),
  });
}
