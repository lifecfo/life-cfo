import { NextResponse } from "next/server";

// Legacy route disabled for private beta. Use the household-safe flow instead.
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
