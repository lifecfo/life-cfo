// app/api/home/orientation/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ORIENTATION_KEY = "home_orientation_v1";

// Keep copy calm + human + non-urgent.
function pickSentence(input: {
  hasUnframedCapture: boolean;
  dueReviews: number;
  upcomingBills: number;
  hasIncome: boolean;
  hasBills: boolean;
}) {
  // Priority: Revisit -> Bills -> steady -> silence

  if (input.hasUnframedCapture) {
    return {
      text: "There’s something waiting to be shaped into a decision.",
      href: "/decisions?tab=active",
    };
  }

  if (input.dueReviews > 0) {
    return {
      text: "A decision is ready to revisit when you’re ready.",
      href: "/decisions?tab=active",
    };
  }

  if (input.upcomingBills > 0) {
    return {
      text: "One upcoming bill may need a look.",
      href: "/money",
    };
  }

  // Only say “steady” if there is *some* financial scaffolding
  if (input.hasIncome || input.hasBills) {
    return {
      text: "Everything looks steady right now.",
      href: null,
    };
  }

  // Otherwise: silence (valid)
  return null;
}

export async function POST(req: Request) {
  try {
    const { user_id } = (await req.json().catch(() => ({}))) as { user_id?: string };
    if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: "Missing Supabase env" }, { status: 500 });
    }

    const admin = createClient(url, key, { auth: { persistSession: false } });

    // 0) Framing: any inbox items that haven't been framed yet?
    // Assumes:
    // - decision_inbox rows created by Capture are NOT type='engine'
    // - framed_decision_id is null until user approves framing
    const { data: unframed, error: unframedErr } = await admin
      .from("decision_inbox")
      .select("id")
      .eq("user_id", user_id)
      .is("framed_decision_id", null)
      .neq("type", "engine")
      .limit(1);

    // 1) Revisit decisions due soon (<= 7 days)
    const soonIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: due, error: dueErr } = await admin
      .from("decisions")
      .select("id")
      .eq("user_id", user_id)
      .not("review_at", "is", null)
      .lte("review_at", soonIso)
      .limit(5);

    // 2) Bills: any active bills exist (simple heuristic for now)
    const { data: bills, error: billsErr } = await admin
      .from("bills")
      .select("id")
      .eq("user_id", user_id)
      .eq("status", "active")
      .limit(5);

    // 3) Income exists?
    const { data: income, error: incomeErr } = await admin
      .from("income")
      .select("id")
      .eq("user_id", user_id)
      .limit(1);

    const sentence = pickSentence({
      hasUnframedCapture: !unframedErr && (unframed ?? []).length > 0,
      dueReviews: !dueErr ? (due ?? []).length : 0,
      upcomingBills: !billsErr ? (bills ?? []).length : 0,
      hasIncome: !incomeErr && (income ?? []).length > 0,
      hasBills: !billsErr && (bills ?? []).length > 0,
    });

    // If no meaningful sentence, delete existing orientation row for silence.
    if (!sentence) {
      await admin
        .from("decision_inbox")
        .delete()
        .eq("user_id", user_id)
        .eq("type", "engine")
        .eq("dedupe_key", ORIENTATION_KEY);

      return NextResponse.json({ ok: true, item: null });
    }

    // Replace existing orientation row (simple + safe)
    await admin
      .from("decision_inbox")
      .delete()
      .eq("user_id", user_id)
      .eq("type", "engine")
      .eq("dedupe_key", ORIENTATION_KEY);

    const { error: insErr } = await admin.from("decision_inbox").insert({
      user_id,
      type: "engine",
      title: sentence.text,
      body: null,
      severity: 2,
      status: "open",
      snoozed_until: null,
      dedupe_key: ORIENTATION_KEY,
      action_label: null,
      action_href: sentence.href,
    });

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, item: { text: sentence.text, href: sentence.href } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

