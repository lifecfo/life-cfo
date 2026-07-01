import { NextResponse } from "next/server";
import { getLifeCfoAccess } from "@/lib/server/access/lifeCfoAccess";
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

  return NextResponse.json({ ok: true, ...getLifeCfoAccess(user) });
}
