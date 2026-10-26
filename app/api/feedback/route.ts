// app/api/feedback/route.ts
import { NextResponse } from "next/server";

import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { message?: unknown; path?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const path = typeof body.path === "string" && body.path.trim() ? body.path.trim() : "unknown";

  if (!message) {
    return NextResponse.json({ ok: false, error: "Type something first." }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json({ ok: false, error: "That's too long — please keep it under 2000 characters." }, { status: 400 });
  }

  const { error: insertError } = await supabase.from("feedback").insert({
    user_id: user.id,
    path,
    message,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: "Couldn't save that yet. Please try again." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
