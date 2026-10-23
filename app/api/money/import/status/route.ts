import { NextResponse } from "next/server";

import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, imported: false }, { status: 401 });

  let householdId: string | null = null;
  try {
    householdId = await resolveHouseholdIdRoute(supabase, user.id);
  } catch {
    householdId = null;
  }
  if (!householdId) return NextResponse.json({ ok: true, imported: false });

  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId)
    .like("external_id", "csv:%");

  if (error) return NextResponse.json({ ok: true, imported: false });
  return NextResponse.json({ ok: true, imported: (count ?? 0) > 0 });
}
