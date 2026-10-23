import { NextResponse } from "next/server";
import { BANK_CONNECT_DISABLED_ERROR, bankConnectIsEnabled } from "@/lib/flags/bankConnect";

export async function POST() {
  if (!bankConnectIsEnabled()) {
    return NextResponse.json({ ok: false, error: BANK_CONNECT_DISABLED_ERROR }, { status: 404 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
