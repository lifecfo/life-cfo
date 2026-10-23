import { NextResponse } from "next/server";

import { DATA_TABLES } from "@/lib/account/dataRegistry";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const dynamic = "force-dynamic";

function missingTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find")
  );
}

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  }

  const exported: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const table of DATA_TABLES.map((entry) => entry.table)) {
    const result = await supabase.from(table).select("*");
    if (result.error) {
      if (!missingTable(result.error)) skipped.push(table);
      continue;
    }
    exported[table] = result.data ?? [];
  }

  const body = JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      user_id: user.id,
      note: "This file contains the rows your account is allowed to read. It is a copy of what was typed, not a recommendation. Rows in household_receipts are references to private photos in the household-receipts storage bucket. The image bytes are not in this file.",
      tables: exported,
      skipped,
    },
    null,
    2
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="life-cfo-data.json"',
      "cache-control": "no-store",
    },
  });
}
