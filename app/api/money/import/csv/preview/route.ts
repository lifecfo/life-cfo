import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import {
  BANK_CSV_MAX_ROWS,
  parseBankCsv,
} from "@/lib/money/import/parseBankCsv";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function isOwnerOrEditor(role: unknown): boolean {
  return role === "owner" || role === "editor";
}

export async function POST(request: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      return NextResponse.json(
        { ok: false, error: "Please sign in again." },
        { status: 401 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, error: "No active household was found." },
        { status: 400 }
      );
    }

    const [{ data: membership, error: membershipError }, ownerCheckResult] =
      await Promise.all([
        supabase
          .from("household_members")
          .select("role")
          .eq("household_id", householdId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("is_household_owner_or_editor", {
          p_household_id: householdId,
        }),
      ]);

    if (membershipError) throw membershipError;
    if (ownerCheckResult.error) throw ownerCheckResult.error;
    if (!isOwnerOrEditor(membership?.role) || ownerCheckResult.data !== true) {
      return NextResponse.json(
        { ok: false, error: "Only a household owner or editor can check a bank file." },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Choose a CSV file first." },
        { status: 400 }
      );
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { ok: false, error: "Choose a CSV file from your bank." },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "This file is empty." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Choose a CSV file smaller than 5 MB." },
        { status: 413 }
      );
    }

    const [{ data: accounts, error: accountsError }, text] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,currency")
        .eq("household_id", householdId)
        .eq("provider", "manual")
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(100),
      file.text(),
    ]);
    if (accountsError) throw accountsError;

    const preview = parseBankCsv(text);
    return NextResponse.json({
      ...preview,
      account_choices: accounts ?? [],
      limits: {
        max_file_bytes: MAX_FILE_BYTES,
        max_rows: BANK_CSV_MAX_ROWS,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "We couldn’t read this file safely." },
      { status: 500 }
    );
  }
}
