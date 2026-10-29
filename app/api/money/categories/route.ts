import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMON_CATEGORIES: { name: string; group: string }[] = [
  { name: "Groceries", group: "Living" },
  { name: "Fuel & transport", group: "Living" },
  { name: "Utilities", group: "Living" },
  { name: "Insurance", group: "Living" },
  { name: "Health", group: "Family" },
  { name: "Kids", group: "Family" },
  { name: "Pets", group: "Family" },
  { name: "Eating out", group: "Lifestyle" },
  { name: "Subscriptions", group: "Lifestyle" },
  { name: "Other", group: "Other" },
];

async function authedHousehold() {
  const supabase = await supabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id) {
    return { error: NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 }) } as const;
  }

  const householdId = await resolveHouseholdIdRoute(supabase, user.id);

  if (!householdId) {
    return {
      error: NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 }),
    } as const;
  }

  return { supabase, userId: user.id, householdId } as const;
}

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

export async function POST(req: Request) {
  try {
    const auth = await authedHousehold();
    if ("error" in auth) return auth.error;
    const { supabase, userId, householdId } = auth;

    const body = await req.json().catch(() => ({}));

    const { data: existingRows, error: existingErr } = await supabase
      .from("categories")
      .select("id,name")
      .eq("household_id", householdId);
    if (existingErr) throw existingErr;

    const existingNames = new Set((existingRows ?? []).map((r) => String(r.name ?? "").trim().toLowerCase()));

    if (body?.common === true) {
      const toInsert = COMMON_CATEGORIES.filter((c) => !existingNames.has(c.name.toLowerCase()));

      if (toInsert.length === 0) {
        return NextResponse.json({ ok: true, added: [], skipped: COMMON_CATEGORIES.map((c) => c.name) });
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("categories")
        .insert(toInsert.map((c) => ({ household_id: householdId, user_id: userId, name: c.name, group: c.group })))
        .select("id,name,group");
      if (insertErr) throw insertErr;

      const skipped = COMMON_CATEGORIES.filter((c) => existingNames.has(c.name.toLowerCase())).map((c) => c.name);
      return NextResponse.json({ ok: true, added: inserted ?? [], skipped });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const group = typeof body?.group === "string" && body.group.trim() ? body.group.trim() : null;

    if (!name) {
      return NextResponse.json({ ok: false, error: "Category name is required." }, { status: 400 });
    }
    if (name.length > 60) {
      return NextResponse.json({ ok: false, error: "Category name is too long." }, { status: 400 });
    }
    if (existingNames.has(name.toLowerCase())) {
      return NextResponse.json({ ok: false, error: "That category already exists." }, { status: 409 });
    }

    const { data: row, error: insertErr } = await supabase
      .from("categories")
      .insert({ household_id: householdId, user_id: userId, name, group })
      .select("id,name,group")
      .single();
    if (insertErr) throw insertErr;

    return NextResponse.json({ ok: true, category: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Couldn't add category." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await authedHousehold();
    if ("error" in auth) return auth.error;
    const { supabase, householdId } = auth;

    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === "string" ? body.id : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";

    if (!id || !name) {
      return NextResponse.json({ ok: false, error: "Category id and name are required." }, { status: 400 });
    }
    if (name.length > 60) {
      return NextResponse.json({ ok: false, error: "Category name is too long." }, { status: 400 });
    }

    const update: { name: string; group?: string | null } = { name };
    if (typeof body?.group === "string" || body?.group === null) {
      update.group = typeof body.group === "string" && body.group.trim() ? body.group.trim() : null;
    }

    const { data: row, error: updateErr } = await supabase
      .from("categories")
      .update(update)
      .eq("id", id)
      .eq("household_id", householdId)
      .select("id,name,group")
      .single();
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true, category: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Couldn't rename category." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await authedHousehold();
    if ("error" in auth) return auth.error;
    const { supabase, householdId } = auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") ?? "";

    if (!id) {
      return NextResponse.json({ ok: false, error: "Category id is required." }, { status: 400 });
    }

    const { error: deleteErr } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .eq("household_id", householdId);
    if (deleteErr) throw deleteErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Couldn't delete category." }, { status: 500 });
  }
}