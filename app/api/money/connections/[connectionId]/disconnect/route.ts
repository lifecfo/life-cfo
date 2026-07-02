import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import { getPlaidClient } from "@/lib/money/plaidClient";
import { normalizeSourceStatus } from "@/lib/money/sourceLifecycle";
import {
  decryptPlaidToken,
  isEncryptedPlaidToken,
} from "@/lib/server/security/plaidTokenCrypto";
import {
  getLifeCfoAccess,
  REAL_DATA_DISABLED_MESSAGE,
} from "@/lib/server/access/lifeCfoAccess";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseRoute } from "@/lib/supabaseRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  action: z.literal("disconnect_keep_history"),
  idempotency_key: z.string().uuid(),
});

type AdminClient = ReturnType<typeof supabaseAdmin>;

type DisconnectJob = {
  id: string;
  connection_id: string;
  action: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  updated_at: string;
};

type PlaidConnection = {
  id: string;
  household_id: string;
  provider: string;
  status: string;
  encrypted_access_token: string | null;
  provider_access_ended_at: string | null;
  disconnected_at: string | null;
  history_retention: string | null;
};

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function nestedRecordValue(value: unknown, keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => recordValue(current, key), value);
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plaidErrorCode(error: unknown): string {
  return (
    safeString(nestedRecordValue(error, ["response", "data", "error_code"])) ||
    safeString(recordValue(error, "code")) ||
    "plaid_request_failed"
  );
}

function plaidHttpStatus(error: unknown): number | null {
  const status = nestedRecordValue(error, ["response", "status"]);
  return typeof status === "number" ? status : null;
}

function isPlaidAlreadyRemoved(error: unknown): boolean {
  return plaidErrorCode(error) === "ITEM_NOT_FOUND";
}

function isTransientPlaidFailure(error: unknown): boolean {
  const status = plaidHttpStatus(error);
  const code = plaidErrorCode(error).toUpperCase();
  return (
    status === 408 ||
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "RATE_LIMIT_EXCEEDED" ||
    code === "INTERNAL_SERVER_ERROR"
  );
}

async function markFailure(params: {
  admin: AdminClient;
  jobId: string;
  householdId: string;
  connectionId: string;
  connectionStatus: "disconnect_failed" | "support_required";
  jobStatus: "failed" | "support_required";
  errorCode: string;
}) {
  const now = new Date().toISOString();
  await Promise.all([
    params.admin
      .from("source_lifecycle_jobs")
      .update({
        status: params.jobStatus,
        failed_at: now,
        error_code: params.errorCode,
        updated_at: now,
      })
      .eq("id", params.jobId)
      .eq("household_id", params.householdId),
    params.admin
      .from("external_connections")
      .update({
        status: params.connectionStatus,
        updated_at: now,
      })
      .eq("id", params.connectionId)
      .eq("household_id", params.householdId),
  ]);
}

function successResponse(connectionId: string, jobId: string) {
  return NextResponse.json({
    ok: true,
    connection_id: connectionId,
    lifecycle_job_id: jobId,
    status: "disconnected",
    history_retention: "kept",
    message: "Disconnected. Past transactions are still here.",
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  let safeJobId: string | null = null;
  let safeConnectionId: string | null = null;
  let safeHouseholdId: string | null = null;
  let stage = "authenticate";

  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      return NextResponse.json(
        { ok: false, code: "not_authenticated", error: "Please sign in again." },
        { status: 401 }
      );
    }
    if (!getLifeCfoAccess(user).canUseRealDataSources) {
      return NextResponse.json(
        { ok: false, code: "real_data_disabled", error: REAL_DATA_DISABLED_MESSAGE },
        { status: 403 }
      );
    }

    const householdId = await resolveHouseholdIdRoute(supabase, user.id);
    if (!householdId) {
      return NextResponse.json(
        { ok: false, code: "no_active_household", error: "No active household was found." },
        { status: 400 }
      );
    }
    safeHouseholdId = householdId;

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (membership?.role !== "owner") {
      return NextResponse.json(
        {
          ok: false,
          code: "not_household_owner",
          error: "Only a household owner can disconnect a bank during private beta.",
        },
        { status: 403 }
      );
    }

    stage = "validate_request";
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "invalid_request", error: "Check this request and try again." },
        { status: 400 }
      );
    }

    const { connectionId } = await params;
    safeConnectionId = connectionId || null;
    if (!connectionId) {
      return NextResponse.json(
        { ok: false, code: "connection_not_found", error: "Connection not found." },
        { status: 404 }
      );
    }

    const admin = supabaseAdmin();
    stage = "load_connection";
    const { data: connectionData, error: connectionError } = await admin
      .from("external_connections")
      .select(
        "id,household_id,provider,status,encrypted_access_token,provider_access_ended_at,disconnected_at,history_retention"
      )
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (connectionError) throw connectionError;
    if (!connectionData) {
      return NextResponse.json(
        { ok: false, code: "connection_not_found", error: "Connection not found." },
        { status: 404 }
      );
    }

    const connection = connectionData as PlaidConnection;
    if (safeString(connection.provider).toLowerCase() !== "plaid") {
      return NextResponse.json(
        {
          ok: false,
          code: "source_not_supported",
          error: "Self-service disconnection is not available for this source yet.",
        },
        { status: 409 }
      );
    }

    stage = "check_idempotency";
    let reusableStaleJob: DisconnectJob | null = null;
    const { data: existingJobData, error: existingJobError } = await admin
      .from("source_lifecycle_jobs")
      .select("id,connection_id,action,status,attempt_count,max_attempts,updated_at")
      .eq("household_id", householdId)
      .eq("requested_by", user.id)
      .eq("idempotency_key", parsed.data.idempotency_key)
      .maybeSingle();

    if (existingJobError) throw existingJobError;
    const existingJob = existingJobData as DisconnectJob | null;
    if (existingJob) {
      safeJobId = existingJob.id;
      if (
        existingJob.connection_id !== connectionId ||
        existingJob.action !== parsed.data.action
      ) {
        return NextResponse.json(
          {
            ok: false,
            code: "idempotency_conflict",
            error: "This request could not be matched safely. Please start again.",
          },
          { status: 409 }
        );
      }

      if (
        existingJob.status === "succeeded" ||
        (normalizeSourceStatus(connection.status) === "disconnected" &&
          connection.provider_access_ended_at &&
          connection.disconnected_at &&
          connection.history_retention === "kept" &&
          !connection.encrypted_access_token)
      ) {
        if (existingJob.status !== "succeeded") {
          const now = new Date().toISOString();
          await admin
            .from("source_lifecycle_jobs")
            .update({
              status: "succeeded",
              completed_at: now,
              failed_at: null,
              error_code: null,
              updated_at: now,
            })
            .eq("id", existingJob.id)
            .eq("household_id", householdId);
        }
        return successResponse(connectionId, existingJob.id);
      }

      if (existingJob.status === "queued" || existingJob.status === "processing") {
        const updatedAt = Date.parse(existingJob.updated_at);
        const isStale =
          Number.isFinite(updatedAt) && Date.now() - updatedAt >= 2 * 60 * 1000;
        if (!isStale) {
          return NextResponse.json(
            {
              ok: false,
              code: "disconnect_in_progress",
              error: "This bank is already being disconnected.",
            },
            { status: 409 }
          );
        }

        if (existingJob.attempt_count >= existingJob.max_attempts) {
          await markFailure({
            admin,
            jobId: existingJob.id,
            householdId,
            connectionId,
            connectionStatus: "support_required",
            jobStatus: "support_required",
            errorCode: "disconnect_attempts_exhausted",
          });
          return NextResponse.json(
            {
              ok: false,
              code: "support_required",
              error: "Contact support to finish disconnecting this bank.",
            },
            { status: 409 }
          );
        }

        reusableStaleJob = existingJob;
      } else {
        return NextResponse.json(
          {
            ok: false,
            code: "disconnect_job_exists",
            error: "We couldn’t disconnect this yet. Start again or contact support.",
          },
          { status: 409 }
        );
      }
    }

    const connectionStatus = normalizeSourceStatus(connection.status);
    if (connectionStatus === "disconnected") {
      return NextResponse.json(
        { ok: false, code: "already_disconnected", error: "This bank is already disconnected." },
        { status: 409 }
      );
    }
    if (connectionStatus === "disconnecting" && !reusableStaleJob) {
      return NextResponse.json(
        {
          ok: false,
          code: "disconnect_in_progress",
          error: "This bank is already being disconnected.",
        },
        { status: 409 }
      );
    }
    if (connectionStatus === "support_required") {
      return NextResponse.json(
        {
          ok: false,
          code: "support_required",
          error: "Contact support to finish disconnecting this bank.",
        },
        { status: 409 }
      );
    }
    if (
      !["active", "needs_auth", "error", "disconnect_failed", "disconnecting"].includes(
        connectionStatus
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "source_not_eligible",
          error: "This source cannot be disconnected here.",
        },
        { status: 409 }
      );
    }

    const encryptedAccessToken = safeString(connection.encrypted_access_token);
    if (!encryptedAccessToken) {
      return NextResponse.json(
        {
          ok: false,
          code: "incomplete_plaid_source",
          error: "This bank setup was not completed, so it cannot be disconnected here.",
        },
        { status: 409 }
      );
    }

    if (!reusableStaleJob) {
      stage = "check_active_job";
      const { data: activeJob, error: activeJobError } = await admin
        .from("source_lifecycle_jobs")
        .select("id")
        .eq("connection_id", connectionId)
        .eq("action", "disconnect_keep_history")
        .in("status", ["queued", "processing"])
        .limit(1)
        .maybeSingle();

      if (activeJobError) throw activeJobError;
      if (activeJob) {
        return NextResponse.json(
          {
            ok: false,
            code: "disconnect_in_progress",
            error: "This bank is already being disconnected.",
          },
          { status: 409 }
        );
      }
    }

    const now = new Date().toISOString();
    let job = reusableStaleJob;
    if (!job) {
      stage = "create_job";
      const { data: createdJobData, error: createJobError } = await admin
        .from("source_lifecycle_jobs")
        .insert({
          household_id: householdId,
          connection_id: connectionId,
          requested_by: user.id,
          provider: "plaid",
          action: "disconnect_keep_history",
          retain_history: true,
          status: "queued",
          idempotency_key: parsed.data.idempotency_key,
        })
        .select("id,connection_id,action,status,attempt_count,max_attempts,updated_at")
        .single();

      if (createJobError) {
        if (createJobError.code === "23505") {
          return NextResponse.json(
            {
              ok: false,
              code: "disconnect_in_progress",
              error: "This bank is already being disconnected.",
            },
            { status: 409 }
          );
        }
        throw createJobError;
      }
      job = createdJobData as DisconnectJob;
    }

    safeJobId = job.id;

    stage = "mark_processing";
    const { data: claimedJob, error: processingError } = await admin
      .from("source_lifecycle_jobs")
      .update({
        status: "processing",
        attempt_count: job.attempt_count + 1,
        started_at: now,
        failed_at: null,
        error_code: null,
        updated_at: now,
      })
      .eq("id", job.id)
      .eq("household_id", householdId)
      .eq("updated_at", job.updated_at)
      .select("id")
      .maybeSingle();

    if (processingError) throw processingError;
    if (!claimedJob) {
      return NextResponse.json(
        {
          ok: false,
          code: "disconnect_in_progress",
          error: "This bank is already being disconnected.",
        },
        { status: 409 }
      );
    }

    const { data: markedConnection, error: markConnectionError } = await admin
      .from("external_connections")
      .update({
        status: "disconnecting",
        disconnect_requested_at: now,
        updated_at: now,
      })
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .in("status", [
        "active",
        "needs_auth",
        "error",
        "disconnect_failed",
        "disconnecting",
      ])
      .select("id")
      .maybeSingle();

    if (markConnectionError || !markedConnection) {
      await markFailure({
        admin,
        jobId: job.id,
        householdId,
        connectionId,
        connectionStatus: "support_required",
        jobStatus: "support_required",
        errorCode: "connection_state_update_failed",
      });
      return NextResponse.json(
        {
          ok: false,
          code: "support_required",
          error: "We couldn’t disconnect this yet. Contact support during private beta.",
        },
        { status: 409 }
      );
    }

    stage = "decrypt_token";
    if (!isEncryptedPlaidToken(encryptedAccessToken)) {
      await markFailure({
        admin,
        jobId: job.id,
        householdId,
        connectionId,
        connectionStatus: "support_required",
        jobStatus: "support_required",
        errorCode: "plaid_token_envelope_invalid",
      });
      return NextResponse.json(
        {
          ok: false,
          code: "support_required",
          error: "We couldn’t disconnect this yet. Contact support during private beta.",
        },
        { status: 409 }
      );
    }

    let accessToken: string;
    try {
      accessToken = decryptPlaidToken(encryptedAccessToken, {
        provider: "plaid",
        household_id: householdId,
        connection_id: connectionId,
      });
    } catch {
      await markFailure({
        admin,
        jobId: job.id,
        householdId,
        connectionId,
        connectionStatus: "support_required",
        jobStatus: "support_required",
        errorCode: "plaid_token_decrypt_failed",
      });
      return NextResponse.json(
        {
          ok: false,
          code: "support_required",
          error: "We couldn’t disconnect this yet. Contact support during private beta.",
        },
        { status: 409 }
      );
    }

    stage = "plaid_item_remove";
    try {
      await getPlaidClient().itemRemove({ access_token: accessToken });
    } catch (error: unknown) {
      if (!isPlaidAlreadyRemoved(error)) {
        const transient = isTransientPlaidFailure(error);
        const errorCode = transient
          ? "plaid_disconnect_retryable"
          : "plaid_disconnect_support_required";
        await markFailure({
          admin,
          jobId: job.id,
          householdId,
          connectionId,
          connectionStatus: transient ? "disconnect_failed" : "support_required",
          jobStatus: transient ? "failed" : "support_required",
          errorCode,
        });
        console.error("plaid_disconnect_failed", {
          connection_id: connectionId,
          lifecycle_job_id: job.id,
          stage,
          error_code: errorCode,
        });
        return NextResponse.json(
          {
            ok: false,
            code: errorCode,
            error: transient
              ? "We couldn’t disconnect this yet. Try again or contact support."
              : "We couldn’t disconnect this yet. Contact support during private beta.",
          },
          { status: transient ? 502 : 409 }
        );
      }
    }

    stage = "complete_local_state";
    const completedAt = new Date().toISOString();
    const { data: completedConnection, error: completeConnectionError } = await admin
      .from("external_connections")
      .update({
        status: "disconnected",
        provider_access_ended_at: completedAt,
        disconnected_at: completedAt,
        history_retention: "kept",
        encrypted_access_token: null,
        transactions_cursor: null,
        last_error: null,
        last_error_at: null,
        updated_at: completedAt,
      })
      .eq("id", connectionId)
      .eq("household_id", householdId)
      .eq("status", "disconnecting")
      .select("id")
      .maybeSingle();

    if (completeConnectionError || !completedConnection) {
      await markFailure({
        admin,
        jobId: job.id,
        householdId,
        connectionId,
        connectionStatus: "support_required",
        jobStatus: "support_required",
        errorCode: "local_disconnect_completion_failed",
      });
      console.error("plaid_disconnect_local_completion_failed", {
        connection_id: connectionId,
        lifecycle_job_id: job.id,
        stage,
        error_code: "local_disconnect_completion_failed",
      });
      return NextResponse.json(
        {
          ok: false,
          code: "support_required",
          error: "The bank stopped updating, but support is needed to finish this safely.",
        },
        { status: 409 }
      );
    }

    const { error: completeJobError } = await admin
      .from("source_lifecycle_jobs")
      .update({
        status: "succeeded",
        completed_at: completedAt,
        failed_at: null,
        error_code: null,
        updated_at: completedAt,
      })
      .eq("id", job.id)
      .eq("household_id", householdId);

    if (completeJobError) {
      console.error("plaid_disconnect_job_completion_failed", {
        connection_id: connectionId,
        lifecycle_job_id: job.id,
        stage: "complete_job",
        error_code: "job_completion_failed",
      });
    }

    return successResponse(connectionId, job.id);
  } catch {
    if (safeJobId && safeConnectionId && safeHouseholdId) {
      try {
        await markFailure({
          admin: supabaseAdmin(),
          jobId: safeJobId,
          householdId: safeHouseholdId,
          connectionId: safeConnectionId,
          connectionStatus: "support_required",
          jobStatus: "support_required",
          errorCode: "unexpected_error",
        });
      } catch {
        // The safe log below is the fallback when lifecycle state could not be updated.
      }
    }
    console.error("plaid_disconnect_unexpected", {
      connection_id: safeConnectionId,
      lifecycle_job_id: safeJobId,
      stage,
      error_code: "unexpected_error",
    });
    return NextResponse.json(
      {
        ok: false,
        code: "unexpected_error",
        error: "We couldn’t disconnect this yet. Try again or contact support.",
      },
      { status: 500 }
    );
  }
}
