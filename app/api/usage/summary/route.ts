import { NextResponse } from "next/server";

import { requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { isDeveloperUser } from "@/lib/server/access/lifeCfoAccess";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { summariseUsage, type UsageRow } from "@/lib/usage/summariseUsage";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;
  if (!isDeveloperUser({ app_metadata: auth.user.app_metadata, email: auth.user.email })) {
    return NextResponse.json({ ok: false, error: "Not available." }, { status: 403 });
  }

  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Usage summary needs the service role key." }, { status: 503 });
  }

  const { data, error } = await admin
    .from("usage_events")
    .select("event_name,user_id,household_id,created_at")
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "Apply the latest database migration, then open this summary again." },
      { status: 503 }
    );
  }

  const { count: waitlistCount } = await admin
    .from("waitlist_signups")
    .select("id", { count: "exact", head: true });

  const rows = (data ?? []) as UsageRow[];
  return NextResponse.json({
    ok: true,
    truncated: rows.length >= 10000,
    waitlist_signups: waitlistCount ?? 0,
    ...summariseUsage(rows),
  });
}
