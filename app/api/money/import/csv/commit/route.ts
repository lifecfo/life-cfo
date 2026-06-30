import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import {
  BANK_CSV_MAX_FILE_BYTES,
  parseBankCsvForImport,
  type BankCsvImportRow,
} from "@/lib/money/import/parseBankCsv";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CSV_CONNECTION_METADATA = {
  manual_csv: true,
  source_type: "csv_upload",
  version: 1,
} as const;
const QUERY_BATCH_SIZE = 250;
const INSERT_BATCH_SIZE = 500;

type ImportTransaction = {
  household_id: string;
  user_id: string;
  account_id: string;
  connection_id: string;
  external_connection_id: string;
  provider: "manual";
  external_id: string;
  date: string;
  posted_at: string;
  description: string;
  merchant: string;
  category: null;
  pending: false;
  amount_cents: number;
  amount: number;
  currency: string;
  updated_at: string;
};

function isOwnerOrEditor(role: unknown): boolean {
  return role === "owner" || role === "editor";
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function displayText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function transactionRows(params: {
  rows: BankCsvImportRow[];
  householdId: string;
  userId: string;
  accountId: string;
  connectionId: string;
  currency: string;
}): ImportTransaction[] {
  const occurrences = new Map<string, number>();
  const now = new Date().toISOString();

  return params.rows.map((row) => {
    const reference = row.reference ? normalizedText(row.reference) : "";
    const identity = reference
      ? `reference:${reference}`
      : `description:${normalizedText(row.description)}`;
    const canonical = [
      "csv:v1",
      params.accountId,
      row.date,
      String(row.amount_cents),
      params.currency,
      identity,
    ].join("|");
    const occurrence = (occurrences.get(canonical) ?? 0) + 1;
    occurrences.set(canonical, occurrence);
    const externalId = `csv:v1:${createHash("sha256")
      .update(`${canonical}|occurrence:${occurrence}`)
      .digest("hex")}`;
    const description = row.description.trim();

    return {
      household_id: params.householdId,
      user_id: params.userId,
      account_id: params.accountId,
      connection_id: params.connectionId,
      external_connection_id: params.connectionId,
      provider: "manual",
      external_id: externalId,
      date: row.date,
      posted_at: `${row.date}T00:00:00.000Z`,
      description,
      merchant: displayText(description).slice(0, 240),
      category: null,
      pending: false,
      amount_cents: row.amount_cents,
      amount: row.amount_cents / 100,
      currency: params.currency,
      updated_at: now,
    };
  });
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
        { ok: false, error: "Only a household owner or editor can import transactions." },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    const accountId = String(form.get("account_id") || "").trim();
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
    if (file.size === 0 || file.size > BANK_CSV_MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Choose a CSV file smaller than 5 MB." },
        { status: 400 }
      );
    }
    if (!accountId || accountId.length > 100) {
      return NextResponse.json(
        { ok: false, error: "Choose a manual account first." },
        { status: 400 }
      );
    }

    const [{ data: account, error: accountError }, text] = await Promise.all([
      supabase
        .from("accounts")
        .select("id,currency,provider,archived")
        .eq("id", accountId)
        .eq("household_id", householdId)
        .eq("provider", "manual")
        .eq("archived", false)
        .maybeSingle(),
      file.text(),
    ]);

    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json(
        { ok: false, error: "Choose a manual account from this household." },
        { status: 400 }
      );
    }

    const parsed = parseBankCsvForImport(text);
    if (!parsed.preview.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: parsed.preview.issues[0] || "This file could not be imported safely.",
        },
        { status: 400 }
      );
    }
    if (
      parsed.preview.needs_user_choice.date_format ||
      parsed.preview.needs_user_choice.amount_direction
    ) {
      return NextResponse.json(
        { ok: false, error: "This file needs one more check before it can be imported." },
        { status: 400 }
      );
    }
    if (!parsed.rows.length) {
      return NextResponse.json(
        { ok: false, error: "There were no transactions ready to import." },
        { status: 400 }
      );
    }

    const { data: existingConnections, error: connectionLookupError } = await supabase
      .from("external_connections")
      .select("id")
      .eq("household_id", householdId)
      .eq("provider", "manual")
      .eq("status", "manual")
      .contains("metadata", CSV_CONNECTION_METADATA)
      .order("created_at", { ascending: true })
      .limit(1);
    if (connectionLookupError) throw connectionLookupError;

    let connectionId = existingConnections?.[0]?.id ?? null;
    if (!connectionId) {
      const { data: createdConnection, error: connectionInsertError } = await supabase
        .from("external_connections")
        .insert({
          household_id: householdId,
          user_id: user.id,
          provider: "manual",
          status: "manual",
          display_name: "Uploaded bank files",
          encrypted_access_token: null,
          item_id: null,
          metadata: CSV_CONNECTION_METADATA,
        })
        .select("id")
        .single();
      if (connectionInsertError) throw connectionInsertError;
      connectionId = createdConnection.id;
    }

    const currency = String(account.currency || "AUD").trim().toUpperCase() || "AUD";
    const rows = transactionRows({
      rows: parsed.rows,
      householdId,
      userId: user.id,
      accountId: account.id,
      connectionId,
      currency,
    });
    const existingIds = new Set<string>();

    for (const batch of chunks(rows.map((row) => row.external_id), QUERY_BATCH_SIZE)) {
      const { data: existing, error: existingError } = await supabase
        .from("transactions")
        .select("external_id")
        .eq("household_id", householdId)
        .eq("provider", "manual")
        .in("external_id", batch);
      if (existingError) throw existingError;
      for (const row of existing ?? []) {
        if (row.external_id) existingIds.add(row.external_id);
      }
    }

    const unseenRows = rows.filter((row) => !existingIds.has(row.external_id));
    let imported = 0;
    for (const batch of chunks(unseenRows, INSERT_BATCH_SIZE)) {
      const { data: inserted, error: insertError } = await supabase
        .from("transactions")
        .upsert(batch, {
          onConflict: "household_id,provider,external_id",
          ignoreDuplicates: true,
        })
        .select("external_id");
      if (insertError) {
        console.error("manual_csv_transaction_insert_failed", {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        });
        throw new Error("transaction_insert_failed");
      }
      imported += inserted?.length ?? 0;
    }

    const dates = parsed.rows.map((row) => row.date).sort();
    return NextResponse.json({
      ok: true,
      imported,
      already_present: rows.length - imported,
      rejected: parsed.rejected_count,
      date_range: { start: dates[0], end: dates[dates.length - 1] },
      source_label: "Uploaded bank file",
    });
  } catch (error: unknown) {
    console.error("manual_csv_import_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t import this file yet. Please try again." },
      { status: 500 }
    );
  }
}
