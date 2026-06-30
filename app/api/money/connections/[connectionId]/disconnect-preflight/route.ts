import { NextResponse } from "next/server";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SourceKind =
  | "plaid_active"
  | "basiq_active"
  | "uploaded_bank_files"
  | "manual_empty"
  | "manual_account_related"
  | "demo"
  | "incomplete"
  | "unknown";

type ConnectionMetadata = Record<string, unknown>;

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function metadataRecord(value: unknown): ConnectionMetadata {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ConnectionMetadata)
    : {};
}

function isDemo(metadata: ConnectionMetadata, provider: string, status: string): boolean {
  return (
    provider === "manual" &&
    status === "demo" &&
    metadata.demo === true &&
    typeof metadata.scenario === "string" &&
    metadata.scenario.trim().length > 0
  );
}

function isUploadedBankFile(metadata: ConnectionMetadata, provider: string): boolean {
  return (
    provider === "manual" &&
    metadata.manual_csv === true &&
    metadata.source_type === "csv_upload"
  );
}

function classifySource(input: {
  provider: string;
  status: string;
  metadata: ConnectionMetadata;
  accountCount: number;
  transactionCount: number;
}): SourceKind {
  if (isDemo(input.metadata, input.provider, input.status)) return "demo";
  if (isUploadedBankFile(input.metadata, input.provider)) return "uploaded_bank_files";
  if (input.status === "needs_auth" || input.status === "error") return "incomplete";
  if (input.provider === "plaid" && input.status === "active") return "plaid_active";
  if (input.provider === "basiq" && input.status === "active") return "basiq_active";
  if (input.provider === "manual") {
    return input.accountCount === 0 && input.transactionCount === 0
      ? "manual_empty"
      : "manual_account_related";
  }
  return "unknown";
}

function sourceLabel(
  sourceKind: SourceKind,
  connection: {
    display_name: string | null;
    provider_institution_name: string | null;
    institution_name: string | null;
  }
): string {
  if (sourceKind === "uploaded_bank_files") return "Uploaded bank file";
  if (sourceKind === "demo") return "Demo data";
  if (sourceKind === "manual_empty" || sourceKind === "manual_account_related") {
    return connection.display_name || "Manual account";
  }
  return (
    connection.provider_institution_name ||
    connection.institution_name ||
    connection.display_name ||
    (sourceKind === "incomplete" ? "Bank setup" : "Connected bank")
  );
}

function preflightDetails(sourceKind: SourceKind) {
  if (sourceKind === "plaid_active") {
    return {
      message: "Self-service disconnection is not available yet.",
      supportRequired: true,
      choices: [
        {
          key: "disconnect_keep_history",
          label: "Disconnect and keep history",
          detail: "Stop new updates and keep past transactions.",
          available: false,
          reason: "Contact support during private beta.",
        },
        {
          key: "disconnect_delete_imported_data",
          label: "Disconnect and delete imported data",
          detail: "Remove this connection and the transactions it brought in.",
          available: false,
          reason: "This is not available yet.",
        },
      ],
    };
  }

  if (sourceKind === "basiq_active") {
    return {
      message: "Self-service disconnection is not available yet.",
      supportRequired: true,
      choices: [
        {
          key: "manage_connection",
          label: "Manage connection",
          detail: "Bank connection changes are handled with support during private beta.",
          available: false,
          reason: "Contact support during private beta.",
        },
      ],
    };
  }

  if (sourceKind === "uploaded_bank_files") {
    return {
      message: "Your uploaded transactions will stay as they are.",
      supportRequired: false,
      choices: [
        {
          key: "keep_transactions",
          label: "Keep past transactions",
          detail: "No action is needed. Your uploaded transactions stay available.",
          available: true,
          reason: null,
        },
        {
          key: "delete_uploaded_transactions",
          label: "Delete uploaded transactions",
          detail: "Remove transactions added from uploaded bank files.",
          available: false,
          reason: "This is not available yet.",
        },
      ],
    };
  }

  if (sourceKind === "demo") {
    return {
      message: "Demo data is managed through the demo tools.",
      supportRequired: false,
      choices: [
        {
          key: "manage_demo_data",
          label: "Manage demo data",
          detail: "Use the demo tools to reset or remove this household data.",
          available: false,
          reason: "This is not available here.",
        },
      ],
    };
  }

  if (sourceKind === "incomplete" || sourceKind === "manual_empty") {
    return {
      message: "This setup was not completed.",
      supportRequired: false,
      choices: [
        {
          key: "remove_incomplete_setup",
          label: "Remove incomplete setup",
          detail: "Use the existing Remove action on the Connections page.",
          available: true,
          reason: null,
        },
      ],
    };
  }

  return {
    message: "Self-service changes are not available yet.",
    supportRequired: true,
    choices: [
      {
        key: "contact_support",
        label: "Contact support",
        detail: "We can help review this source during private beta.",
        available: false,
        reason: "Contact support during private beta.",
      },
    ],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
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

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return NextResponse.json(
        { ok: false, error: "You cannot access this household." },
        { status: 403 }
      );
    }

    const { connectionId } = await params;
    if (!connectionId) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 }
      );
    }

    // Credential and provider identifier fields are intentionally not selected here.
    const { data: connection, error: connectionError } = await supabase
      .from("external_connections")
      .select(
        "id,provider,status,display_name,institution_name,provider_institution_name,metadata"
      )
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connection) {
      return NextResponse.json(
        { ok: false, error: "Connection not found." },
        { status: 404 }
      );
    }

    const [accountResult, transactionResult] = await Promise.all([
      supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .eq("connection_id", connectionId),
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("household_id", householdId)
        .or(`connection_id.eq.${connectionId},external_connection_id.eq.${connectionId}`),
    ]);

    if (accountResult.error) throw accountResult.error;
    if (transactionResult.error) throw transactionResult.error;

    const provider = normalize(connection.provider);
    const status = normalize(connection.status);
    const accountCount = accountResult.count ?? 0;
    const transactionCount = transactionResult.count ?? 0;
    const sourceKind = classifySource({
      provider,
      status,
      metadata: metadataRecord(connection.metadata),
      accountCount,
      transactionCount,
    });
    const details = preflightDetails(sourceKind);

    return NextResponse.json({
      ok: true,
      connection_id: connection.id,
      label: sourceLabel(sourceKind, connection),
      source_kind: sourceKind,
      status,
      account_count: accountCount,
      transaction_count: transactionCount,
      self_service_available: false,
      support_required: details.supportRequired,
      choices: details.choices,
      message: details.message,
    });
  } catch (error: unknown) {
    console.error("connection_disconnect_preflight_failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { ok: false, error: "Life CFO couldn’t check these options yet. Please try again." },
      { status: 500 }
    );
  }
}
