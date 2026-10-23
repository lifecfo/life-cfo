import { NextResponse } from "next/server";

import { isAiEnabled } from "@/lib/ai/aiFlag";
import { readAiDailyLimits } from "@/lib/ai/usageLimit";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("ai_ask_opt_in_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ ok: true, opted_in: false });
  }

  return NextResponse.json({
    ok: true,
    enabled: isAiEnabled(),
    opted_in: Boolean(data?.ai_ask_opt_in_at),
    opted_in_at: data?.ai_ask_opt_in_at ?? null,
    daily_limit: readAiDailyLimits().perUser,
  });
}

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { opt_in?: unknown };
  const optIn = body.opt_in === true;
  const optedInAt = optIn ? new Date().toISOString() : null;
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      ai_ask_opt_in_at: optedInAt,
    },
    { onConflict: "user_id" }
  );
  if (profileError) {
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn't save that choice. Apply the latest database migration, then try again." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, opted_in: optIn, opted_in_at: optedInAt });
}
