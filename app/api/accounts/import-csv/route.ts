// app/api/accounts/import-csv/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expected CSV headers:
 * name,provider,type,balance
 *
 * balance = dollars (AUD)
 */

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i]?.trim() ?? "";
    });
    return row;
  });
}

export async function POST(req: Request) {
  try {
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (!rows.length) {
      return NextResponse.json({ error: "CSV was empty" }, { status: 400 });
    }

    const inserts = rows
      .map((r: Record<string, string>) => {
        const balance = Number(r.balance || 0);

        return {
          user_id: user.id,
          name: r.name,
          provider: r.provider || null,
          type: r.type || null,
          status: "active",
          current_balance_cents: Math.round(balance * 100),
          currency: "AUD",
        };
      })
      .filter(r => r.name && r.name.length > 0);

    if (!inserts.length) {
      return NextResponse.json({ error: "No valid rows found" }, { status: 400 });
    }

    const { error } = await supabase.from("accounts").insert(inserts);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      inserted: inserts.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Import failed" },
      { status: 500 }
    );
  }
}
