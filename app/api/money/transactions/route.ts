// app/api/money/transactions/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intOr(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pending = url.searchParams.get("pending");
    const limit = Math.min(intOr(url.searchParams.get("limit"), 50), 250);

    let q = supabase
      .from("transactions")
      .select(
        "id,user_id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,connection_id,provider,external_id,created_at,updated_at"
      )
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (accountId) q = q.eq("account_id", accountId);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (pending === "true") q = q.eq("pending", true);
    if (pending === "false") q = q.eq("pending", false);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ ok: true, transactions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Transactions fetch failed" }, { status: 500 });
  }
}