// app/api/households/create/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "lifecfo_household";

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) {
      return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = safeStr(body?.name).trim();

    // Keep /api/households/create as a compatibility entrypoint,
    // but use the same canonical creation path as POST /api/households.
    const { data: household_id, error: createErr } = await supabase.rpc("create_household", {
      p_name: name || null,
    });

    if (createErr) throw createErr;
    if (!household_id) {
      return NextResponse.json({ ok: false, error: "Household create failed." }, { status: 500 });
    }

    // Set active household cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, household_id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });

    // Persist preference (cross-device)
    const { error: prefErr } = await supabase
      .from("household_preferences")
      .upsert({ user_id: user.id, active_household_id: household_id }, { onConflict: "user_id" });

    if (prefErr) throw prefErr;

    return NextResponse.json({ ok: true, household_id, active_household_id: household_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Household create failed" }, { status: 500 });
  }
}
