import { NextResponse } from "next/server";

import { betaAccessForUser, inviteCodeMatches } from "@/lib/server/access/betaAccess";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const existing = await supabase
    .from("beta_access")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (betaAccessForUser(user, { hasAccessRow: Boolean(existing.data?.user_id) }).isInvited) {
    return NextResponse.json({ ok: true, already: true });
  }

  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";
  if (!inviteCodeMatches(code)) {
    return NextResponse.json({ ok: false, error: "That invite code was not recognised." }, { status: 403 });
  }

  const admin = supabaseAdmin();
  const { data: full, error: readErr } = await admin.auth.admin.getUserById(user.id);
  if (readErr || !full.user) {
    return NextResponse.json({ ok: false, error: "Life CFO couldn't confirm this sign-in." }, { status: 500 });
  }

  const appMetadata = {
    ...(full.user.app_metadata ?? {}),
    lifecfo_invited: true,
  };
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: appMetadata,
  });
  if (updateErr) {
    return NextResponse.json({ ok: false, error: "Life CFO couldn't save this invite." }, { status: 500 });
  }

  const { error: rowErr } = await admin.from("beta_access").upsert(
    { user_id: user.id, method: "invite_code", granted_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  return NextResponse.json({
    ok: true,
    stored: rowErr ? "metadata" : "metadata_and_record",
  });
}
