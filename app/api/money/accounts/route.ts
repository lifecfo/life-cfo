// app/api/money/accounts/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Not signed in." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("accounts")
      .select(
        "id,user_id,name,provider,type,status,archived,current_balance_cents,currency,updated_at,created_at"
      )
      .eq("user_id", user.id)
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ ok: true, accounts: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Accounts fetch failed" },
      { status: 500 }
    );
  }
}