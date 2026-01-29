// app/api/home/create-framing/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FramingSeed = {
  title: string;
  prompt: string;
  notes: string[];
};

type CreateFramingRequest = {
  userId: string;
  seed: FramingSeed;
};

function coerceSeed(raw: any): FramingSeed | null {
  if (!raw || typeof raw !== "object") return null;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  const notes =
   Array.isArray(raw.notes)
  ? raw.notes
      .map((x: unknown) => String(x).trim())
      .filter(Boolean)
      .slice(0, 10)
  : [];

  if (!title && !prompt) return null;

  return {
    title: (title || "Decision to frame").slice(0, 120),
    prompt: prompt.slice(0, 2000),
    notes,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CreateFramingRequest>;
    const userId = String(body.userId ?? "").trim();
    const seed = coerceSeed(body.seed);

    if (!userId || !seed) {
      return NextResponse.json({ error: "Missing userId/seed" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      // server-only key
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ✅ Store as a normal capture in decision_inbox (schema-safe columns only)
    // ✅ Use the existing capture JSON format Framing already understands: { text, attachments }
    const notesBlock =
      seed.notes.length > 0 ? `\n\nNotes:\n${seed.notes.map((n) => `- ${n}`).join("\n")}` : "";

    const captureBody = JSON.stringify({
      text: `${seed.prompt}${notesBlock}`.trim(),
      attachments: [],
    });

    const { data, error } = await supabase
      .from("decision_inbox")
      .insert({
        user_id: userId,
        type: "note",
        title: seed.title,
        body: captureBody,
        severity: null,
        status: "open",
        snoozed_until: null,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    }

    return NextResponse.json({ inbox_id: String(data.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
