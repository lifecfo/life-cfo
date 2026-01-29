// app/api/home/create-framing/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateFramingRequest = {
  userId: string;
  seed: { title: string; prompt: string; notes: string[] };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateFramingRequest>;
    const userId = String(body.userId ?? "").trim();
    const seed = body.seed ?? null;

    if (!userId || !seed) return NextResponse.json({ error: "Missing userId/seed" }, { status: 400 });

    const title = String(seed.title ?? "").trim().slice(0, 120) || "Decision to frame";
    const prompt = String(seed.prompt ?? "").trim();
    const notes = Array.isArray(seed.notes) ? seed.notes.map((x) => String(x)).slice(0, 10) : [];

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const payload = {
      text: prompt || title,
      kind: "home_ask_framing_seed",
      notes,
      created_from: "home_ask",
      created_at_iso: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("decision_inbox")
      .insert({
        user_id: userId,
        type: "note",
        title,
        body: JSON.stringify(payload),
        severity: null,
        status: "open",
        snoozed_until: null,
      })
      .select("id")
      .single();

    if (error || !data?.id) return NextResponse.json({ error: error?.message ?? "Couldn’t create capture" }, { status: 500 });

    return NextResponse.json({ inbox_id: String(data.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
