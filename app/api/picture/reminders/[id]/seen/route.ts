import { NextResponse } from "next/server";

import { requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: RouteContext) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "Unknown reminder." }, { status: 400 });
  }

  const { data: reminder } = await auth.supabase
    .from("household_reminders")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!reminder?.id) {
    return NextResponse.json({ ok: false, error: "That reminder is not in this household." }, { status: 404 });
  }

  const { error } = await auth.supabase.from("household_reminder_reads").upsert(
    { reminder_id: id, user_id: auth.user.id, seen_at: new Date().toISOString() },
    { onConflict: "reminder_id,user_id" }
  );
  if (error) {
    return NextResponse.json({ ok: false, error: "Life CFO couldn't mark that reminder." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
