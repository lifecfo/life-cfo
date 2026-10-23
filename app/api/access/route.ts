import { NextResponse } from "next/server";
import { betaAccessForUser } from "@/lib/server/access/betaAccess";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { ok: false, error: "Please sign in again." },
      { status: 401 }
    );
  }

  const { data: accessRow } = await supabase
    .from("beta_access")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    ...betaAccessForUser(user, { hasAccessRow: Boolean(accessRow?.user_id) }),
  });
}
