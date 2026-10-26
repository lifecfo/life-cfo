// app/api/feedback/review/route.ts
import { NextResponse } from "next/server";

import { isDeveloperUser } from "@/lib/server/access/lifeCfoAccess";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
  if (!isDeveloperUser(user)) {
    return NextResponse.json({ ok: false, error: "Not available." }, { status: 403 });
  }

  const admin = supabaseAdmin();

  const { data: rows, error: feedbackError } = await admin
    .from("feedback")
    .select("id,user_id,path,message,created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (feedbackError) {
    return NextResponse.json({ ok: false, error: "Couldn't load feedback." }, { status: 500 });
  }

  const userIds = [...new Set((rows ?? []).map((row) => row.user_id).filter(Boolean))];
  const emailById = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) emailById.set(id, data.user.email);
    })
  );

  const feedback = (rows ?? []).map((row) => ({
    id: row.id,
    path: row.path,
    message: row.message,
    created_at: row.created_at,
    email: emailById.get(row.user_id) ?? "unknown",
  }));

  return NextResponse.json({ ok: true, feedback });
}
