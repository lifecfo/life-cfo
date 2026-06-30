import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intOr(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user?.id) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) return NextResponse.json({ ok: false, error: "User not linked to a household." }, { status: 400 });

    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const pending = url.searchParams.get("pending");
    const limit = Math.min(intOr(url.searchParams.get("limit"), 50), 250);

    let q = supabase
      .from("transactions")
      .select(
        "id,household_id,date,description,merchant,category,pending,amount,amount_cents,currency,account_id,connection_id,provider,external_id,created_at,updated_at"
      )
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (accountId) q = q.eq("account_id", accountId);
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (pending === "true") q = q.eq("pending", true);
    if (pending === "false") q = q.eq("pending", false);

    const { data, error } = await q;
    if (error) throw error;

    const connectionIds = Array.from(
      new Set(
        (data ?? [])
          .map((transaction) => transaction.connection_id)
          .filter((value): value is string => Boolean(value))
      )
    );
    const { data: connections, error: connectionsError } = connectionIds.length
      ? await supabase
          .from("external_connections")
          .select("id,provider,metadata")
          .eq("household_id", householdId)
          .in("id", connectionIds)
      : { data: [], error: null };
    if (connectionsError) throw connectionsError;

    const uploadedConnectionIds = new Set(
      (connections ?? [])
        .filter((connection) => {
          const metadata =
            connection.metadata && typeof connection.metadata === "object"
              ? (connection.metadata as Record<string, unknown>)
              : null;
          return (
            connection.provider === "manual" &&
            metadata?.manual_csv === true &&
            metadata?.source_type === "csv_upload"
          );
        })
        .map((connection) => connection.id)
    );

    return NextResponse.json({
      ok: true,
      household_id: householdId,
      transactions: (data ?? []).map((transaction) => ({
        ...transaction,
        source_label:
          transaction.connection_id && uploadedConnectionIds.has(transaction.connection_id)
            ? "Uploaded bank file"
            : null,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error && error.message
            ? error.message
            : "Transactions fetch failed",
      },
      { status: 500 }
    );
  }
}
