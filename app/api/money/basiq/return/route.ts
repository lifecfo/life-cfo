import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeParam(input: string | null) {
  if (!input) return "";
  return input.trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const connectionId = safeParam(url.searchParams.get("connection_id"));

  const target = new URL("/connections", url.origin);
  if (connectionId) {
    target.searchParams.set("basiq_connection_id", connectionId);
    target.searchParams.set("basiq_return", "1");
  }

  const error = safeParam(url.searchParams.get("error"));
  if (error) target.searchParams.set("basiq_error", error);

  return NextResponse.redirect(target);
}

