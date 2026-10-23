import { NextResponse } from "next/server";

import { legalPackSha256 } from "@/lib/legal/legalPackHash";
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

  const current = legalPackSha256();
  const { data: profile } = await supabase
    .from("profiles")
    .select("fine_print_accepted_at,fine_print_version,fine_print_signed_name,confirmed_adult,confirmed_au_resident")
    .eq("user_id", user.id)
    .maybeSingle();

  const acceptedSha = typeof profile?.fine_print_version === "string" ? profile.fine_print_version : null;
  const confirmedAdult = profile?.confirmed_adult === true;
  const confirmedAuResident = profile?.confirmed_au_resident === true;
  return NextResponse.json({
    ok: true,
    current_sha256: current,
    accepted_sha256: acceptedSha,
    accepted_at: profile?.fine_print_accepted_at ?? null,
    signed_name: profile?.fine_print_signed_name ?? null,
    confirmed_adult: confirmedAdult,
    confirmed_au_resident: confirmedAuResident,
    matches:
      Boolean(profile?.fine_print_accepted_at) &&
      acceptedSha === current &&
      confirmedAdult &&
      confirmedAuResident,
  });
}
