import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNum(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function endOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
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

    const [categoriesRes, txRes, uncategorisedRes] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name,group")
        .eq("household_id", householdId)
        .order("group", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("transactions")
        .select("category,amount_cents,amount,date")
        .eq("household_id", householdId)
        .gte("date", monthStart)
        .lte("date", monthEnd),

      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .or("category.is.null,category.eq.")
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (txRes.error) throw txRes.error;
    if (uncategorisedRes.error) throw uncategorisedRes.error;

    const spendMap = new Map<string, number>();

    for (const tx of txRes.data ?? []) {
      const cents =
        typeof tx.amount_cents === "number"
          ? tx.amount_cents
          : typeof tx.amount === "number"
            ? Math.round(tx.amount * 100)
            : 0;

      if (cents < 0) {
        const category =
          typeof tx.category === "string" && tx.category.trim()
            ? tx.category.trim()
            : "Uncategorised";

        spendMap.set(category, (spendMap.get(category) ?? 0) + Math.abs(safeNum(cents)));
      }
    }

    const spending = Array.from(spendMap.entries())
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 12);

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      categories: categoriesRes.data ?? [],
      spending,
      uncategorised_count: uncategorisedRes.count ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Categories fetch failed" },
      { status: 500 }
    );
  }
}