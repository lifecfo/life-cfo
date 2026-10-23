import { NextResponse } from "next/server";

import { legalPackCanonicalText } from "@/lib/legal/betaLegalCopy";
import { legalPackSha256 } from "@/lib/legal/legalPackHash";
import { betaAccessForUser } from "@/lib/server/access/betaAccess";
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

  const accessRow = await supabase
    .from("beta_access")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!betaAccessForUser(user, { hasAccessRow: Boolean(accessRow.data?.user_id) }).isInvited) {
    return NextResponse.json({ ok: false, error: "This beta is invite-only." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    signed_name?: unknown;
    confirmed_adult?: unknown;
    confirmed_au_resident?: unknown;
  };
  const signedName = typeof body.signed_name === "string" ? body.signed_name.trim() : "";
  if (signedName.length < 2 || signedName.length > 120) {
    return NextResponse.json({ ok: false, error: "Please type your name to continue." }, { status: 400 });
  }
  if (body.confirmed_adult !== true || body.confirmed_au_resident !== true) {
    return NextResponse.json(
      { ok: false, error: "Confirm that you are 18 or older and that you live in Australia." },
      { status: 400 }
    );
  }

  const contentSha256 = legalPackSha256();
  const contentSnapshot = legalPackCanonicalText();
  const acceptedAt = new Date().toISOString();
  const admin = supabaseAdmin();

  const { error: snapshotErr } = await admin.from("legal_acceptances").insert({
    user_id: user.id,
    content_sha256: contentSha256,
    content_snapshot: contentSnapshot,
    signed_name: signedName,
    accepted_at: acceptedAt,
  });
  if (snapshotErr) {
    return NextResponse.json(
      {
        ok: false,
        error: "Life CFO couldn't store a copy of the terms you are accepting. Apply the latest database migration, then try again.",
      },
      { status: 503 }
    );
  }

  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      user_id: user.id,
      fine_print_accepted_at: acceptedAt,
      fine_print_version: contentSha256,
      fine_print_signed_name: signedName,
      confirmed_adult: true,
      confirmed_au_resident: true,
      onboarding_completed_at: acceptedAt,
    },
    { onConflict: "user_id" }
  );
  if (profileErr) {
    return NextResponse.json({ ok: false, error: "Life CFO couldn't save your acceptance." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, content_sha256: contentSha256, accepted_at: acceptedAt });
}
