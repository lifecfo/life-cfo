import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function safeInt(v: unknown, fallback = 100) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

async function getContext() {
  const supabase = await supabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user?.id) {
    return {
      ok: false as const,
      status: 401,
      error: "Not signed in.",
      supabase,
      userId: null,
      householdId: null,
    };
  }

  const householdId = await resolveHouseholdIdRoute(supabase, user.id);

  if (!householdId) {
    return {
      ok: false as const,
      status: 400,
      error: "User not linked to a household.",
      supabase,
      userId: user.id,
      householdId: null,
    };
  }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    householdId,
  };
}

export async function GET() {
  try {
    const ctx = await getContext();
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, householdId } = ctx;

    const { data: categoriesData, error: categoriesErr } = await supabase
      .from("categories")
      .select("name")
      .eq("household_id", householdId)
      .order("name", { ascending: true });

    if (categoriesErr) throw categoriesErr;

    let rules: any[] = [];

    const { data: rulesData, error: rulesErr } = await supabase
      .from("categorisation_rules")
      .select("id,merchant_pattern,description_pattern,category,priority,created_at")
      .eq("household_id", householdId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (!rulesErr) {
      rules = rulesData ?? [];
    }

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      rules,
      categories_available: (categoriesData ?? [])
        .map((c) => safeStr(c.name))
        .filter(Boolean),
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Rules fetch failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getContext();
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }

    const { supabase, householdId } = ctx;
    const body = await req.json().catch(() => ({}));

    const merchantPattern = safeStr(body?.merchant_pattern) || null;
    const descriptionPattern = safeStr(body?.description_pattern) || null;
    const category = safeStr(body?.category);
    const priority = safeInt(body?.priority, 100);

    if (!category) {
      return NextResponse.json(
        { ok: false, error: "Category is required." },
        { status: 400 }
      );
    }

    if (!merchantPattern && !descriptionPattern) {
      return NextResponse.json(
        { ok: false, error: "Add a merchant pattern or description pattern." },
        { status: 400 }
      );
    }

    const { data: categoryExists, error: categoryErr } = await supabase
      .from("categories")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", category)
      .limit(1)
      .maybeSingle();

    if (categoryErr) throw categoryErr;

    if (!categoryExists) {
      return NextResponse.json(
        { ok: false, error: "That category does not exist in this household." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("categorisation_rules")
      .insert({
        household_id: householdId,
        merchant_pattern: merchantPattern,
        description_pattern: descriptionPattern,
        category,
        priority,
      })
      .select("id,merchant_pattern,description_pattern,category,priority,created_at")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      rule: data,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Rule create failed" },
      { status: 500 }
    );
  }
}