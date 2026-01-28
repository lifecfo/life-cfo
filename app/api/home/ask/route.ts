// app/api/home/ask/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function monthBoundsLocal() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  return { start, end };
}

// Very small “facts pack” — expand later
async function buildFactsPack(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    // IMPORTANT: use SERVICE ROLE here (server-only)
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Bills: you likely have bills + next_due_at elsewhere.
  // If you only have due_day_or_date, we can still return “active bills list” for now.
  const { data: bills } = await supabase
    .from("bills")
    .select("id,nickname,merchant_key,due_day_or_date,expected_amount,status,updated_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(50);

  // If you have bill_payments/receipts table, we can compute “due this month” properly.
  // For now: return active bills + due_day_or_date and let the AI say what it can/can’t compute.

  return {
    now_iso: new Date().toISOString(),
    bills_active: (bills ?? []).map((b: any) => ({
      id: b.id,
      name: b.nickname || b.merchant_key,
      due: b.due_day_or_date,
      expected_amount: b.expected_amount ?? null,
      status: b.status,
    })),
  };
}

const SYSTEM = `
You are Keystone Home Answer.
Rules:
- You may ONLY answer using the provided FACTS PACK.
- If the question requires data not present, say clearly what you can and can’t see.
- Do not guess. Do not invent bills, dates, or amounts.
- Be calm, concise, and helpful.
- Always return:
  1) a short direct answer
  2) (optional) a tiny bullet list if it helps
  3) one suggested next action from: open_bills | open_money | open_decisions | open_review | none
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, question } = body ?? {};

    if (!userId || !question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing userId/question" }, { status: 400 });
    }

    const facts = await buildFactsPack(userId);

    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini", // swap later if you want
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM.trim() },
        { role: "user", content: `QUESTION:\n${question}\n\nFACTS PACK:\n${JSON.stringify(facts, null, 2)}` },
      ],
    });

    const text = resp.choices?.[0]?.message?.content?.trim() || "";

    // Simple action extraction (keep it dumb & reliable for V1)
    // Expect the model to mention one of the allowed actions.
    let action: "open_bills" | "open_money" | "open_decisions" | "open_review" | "none" = "none";
    const lowered = text.toLowerCase();
    if (lowered.includes("open_bills")) action = "open_bills";
    else if (lowered.includes("open_money")) action = "open_money";
    else if (lowered.includes("open_decisions")) action = "open_decisions";
    else if (lowered.includes("open_review")) action = "open_review";

    return NextResponse.json({ answer: text, action });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
