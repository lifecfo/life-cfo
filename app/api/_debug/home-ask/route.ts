// app/api/_debug/home-ask/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });

  /*
  const startedAt = Date.now();
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    body = { _parse: "failed" };
  }

  const userId = typeof body?.userId === "string" ? body.userId : "";
  const question = typeof body?.question === "string" ? body.question : "";

  // Echo back everything we need to know
  return NextResponse.json({
    ok: true,
    server_time_iso: new Date().toISOString(),
    ms: Date.now() - startedAt,
    received: {
      has_userId: !!userId,
      has_question: !!question,
      userId_len: userId.length,
      question_len: question.length,
      keys: body && typeof body === "object" ? Object.keys(body) : [],
      userId_preview: userId ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : "",
      question_preview: question ? `${question.slice(0, 80)}${question.length > 80 ? "…" : ""}` : "",
    },
    raw_body: body,
  });
  */
}
