import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { normaliseWaitlistEmail } from "@/lib/waitlist/email";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; company?: unknown };
  if (typeof body.company === "string" && body.company.trim()) {
    return NextResponse.json({ ok: true, message: "You're on the list." });
  }
  const email = normaliseWaitlistEmail(body.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "Enter an email address." }, { status: 400 });
  }

  let admin;
  try {
    admin = supabaseAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "The list is not ready yet." }, { status: 503 });
  }

  const { error } = await admin.from("waitlist_signups").insert({ email });
  if (error && error.code !== "23505" && !/duplicate|unique/i.test(error.message || "")) {
    return NextResponse.json({ ok: false, error: "The list is not ready yet." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: "You're on the list." });
}
