import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseRoute";
import { resolveHouseholdIdRoute } from "@/lib/households/resolveHouseholdIdRoute";
import {
  BasiqError,
  getBasiqJobHistory,
  type BasiqJobProgress,
} from "@/lib/money/providers/basiq";
import {
  getLifeCfoAccess,
  REAL_DATA_DISABLED_MESSAGE,
} from "@/lib/server/access/lifeCfoAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeParam(input: string | null) {
  if (!input) return "";
  return input.trim();
}

type ItemIdPayload = {
  basiq_user_id?: string;
  basiq_job_id?: string;
  basiq_job_ids?: string[];
  basiq_job_history?: BasiqJobProgress[];
  basiq_source?: string;
};

function parseItemId(input: string | null): ItemIdPayload {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? (parsed as ItemIdPayload) : {};
  } catch {
    return {};
  }
}

function redirectToConnections(url: URL, message?: string) {
  const target = new URL("/connections", url.origin);
  if (message) target.searchParams.set("basiq_error", message);
  return NextResponse.redirect(target);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jobIds = Array.from(
    new Set(
      [...url.searchParams.getAll("jobId"), ...url.searchParams.getAll("jobIds")]
        .map(safeParam)
        .filter(Boolean)
    )
  );

  if (!jobIds.length) {
    return redirectToConnections(
      url,
      "The bank connection did not return a processing reference. Please start again."
    );
  }

  const supabase = await supabaseRoute();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    const target = new URL("/login", url.origin);
    target.searchParams.set("next", `${url.pathname}${url.search}`);
    return NextResponse.redirect(target);
  }
  if (!getLifeCfoAccess(user).canUseRealDataSources) {
    return redirectToConnections(url, REAL_DATA_DISABLED_MESSAGE);
  }

  const householdId = await resolveHouseholdIdRoute(supabase, user.id);
  if (!householdId) {
    return redirectToConnections(url, "Choose a household before connecting a bank.");
  }

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: pendingConnections, error: connectionError } = await supabase
    .from("external_connections")
    .select("id, household_id, provider, item_id, created_at")
    .eq("household_id", householdId)
    .eq("provider", "basiq")
    .eq("status", "needs_auth")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(2);

  if (connectionError || !pendingConnections || pendingConnections.length !== 1) {
    return redirectToConnections(
      url,
      "We couldn't match this bank connection safely. Please return to Connections and start again."
    );
  }

  const connection = pendingConnections[0];
  const item = parseItemId(connection.item_id);

  const { error: persistJobsError } = await supabase
    .from("external_connections")
    .update({
      item_id: JSON.stringify({
        basiq_user_id: item.basiq_user_id || "",
        basiq_job_id: jobIds[0],
        basiq_job_ids: jobIds,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("household_id", householdId);

  if (persistJobsError) {
    return redirectToConnections(url, "We couldn't save the bank connection progress. Please try again.");
  }

  let jobHistory: BasiqJobProgress[] | null = null;
  try {
    if (!item.basiq_user_id) throw new Error("Missing Basiq user reference.");
    jobHistory = await getBasiqJobHistory(item.basiq_user_id, jobIds);
  } catch (error) {
    if (error instanceof BasiqError) {
      console.warn("Basiq job lookup could not be completed", {
        operation: "job_lookup",
        status: error.status,
        code: error.basiq.code ?? null,
        correlation_id: error.basiq.correlationId ?? null,
      });
    }
    const target = new URL("/connections", url.origin);
    target.searchParams.set("basiq_connection_id", connection.id);
    target.searchParams.set("basiq_return", "1");
    target.searchParams.set("basiq_jobs_pending", "1");
    target.searchParams.set("basiq_job_status", "lookup_pending");
    return NextResponse.redirect(target);
  }

  const hasFailedJob = jobHistory.some((job) => job.state === "failed");
  const readyJobs = jobHistory.filter((job) => job.state === "ready");
  const jobState = hasFailedJob ? "failed" : readyJobs.length ? "ready" : "pending";
  const source = readyJobs.find((job) => job.source)?.source ?? null;

  const { error: persistHistoryError } = await supabase
    .from("external_connections")
    .update({
      item_id: JSON.stringify({
        basiq_user_id: item.basiq_user_id || "",
        basiq_job_id: jobIds[0],
        basiq_job_ids: jobIds,
        basiq_job_history: jobHistory,
        ...(source ? { basiq_source: source } : {}),
      }),
      status: hasFailedJob ? "error" : "needs_auth",
      ...(hasFailedJob
        ? {
            last_error: "Basiq could not complete the bank connection.",
            last_error_at: new Date().toISOString(),
          }
        : { last_error: null, last_error_at: null }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .eq("household_id", householdId);

  if (persistHistoryError) {
    return redirectToConnections(url, "We couldn't save the bank connection progress. Please try again.");
  }

  const target = new URL("/connections", url.origin);
  target.searchParams.set("basiq_connection_id", connection.id);
  target.searchParams.set("basiq_return", "1");
  target.searchParams.set("basiq_job_status", jobState);
  if (jobState !== "ready") target.searchParams.set("basiq_jobs_pending", "1");

  if (hasFailedJob || safeParam(url.searchParams.get("error"))) {
    target.searchParams.set("basiq_error", "The bank connection wasn't completed. You can try again when ready.");
  }

  return NextResponse.redirect(target);
}
