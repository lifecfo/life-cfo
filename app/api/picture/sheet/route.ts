import { NextResponse } from "next/server";

import { requireAuthenticatedAiUser } from "@/lib/ai/routeSecurity";
import { parseHouseholdSheet } from "@/lib/picture/sheetRows";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1024 * 1024;

/** Preview only. The uploaded file is read in memory and not stored. */
export async function POST(request: Request) {
  const auth = await requireAuthenticatedAiUser();
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose a CSV file first." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Choose a CSV smaller than 1 MB." }, { status: 413 });
  }
  const text = await file.text();
  const parsed = parseHouseholdSheet(text);
  return NextResponse.json({ ok: parsed.rows.length > 0, rows: parsed.rows, issues: parsed.issues });
}
