import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const secret = process.env.ENGINE_CRON_SECRET;

  if (!baseUrl) return NextResponse.json({ error: "Missing NEXT_PUBLIC_SITE_URL" }, { status: 500 });
  if (!secret) return NextResponse.json({ error: "Missing ENGINE_CRON_SECRET" }, { status: 500 });

  const res = await fetch(`${baseUrl}/api/engine/run-all`, {
    method: "POST",
    headers: { "x-engine-secret": secret },
  });

  const json = await res.json();
  return NextResponse.json({ ok: res.ok, ...json }, { status: res.status });
}
