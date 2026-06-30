export const CONNECTION_LIFECYCLE_STATUSES = [
  "active",
  "needs_auth",
  "error",
  "disconnecting",
  "disconnected",
  "disconnect_failed",
  "support_required",
] as const;

export type ConnectionLifecycleStatus =
  (typeof CONNECTION_LIFECYCLE_STATUSES)[number];

export const SOURCE_LIFECYCLE_JOB_STATUSES = [
  "queued",
  "processing",
  "succeeded",
  "failed",
  "support_required",
] as const;

export type SourceLifecycleJobStatus =
  (typeof SOURCE_LIFECYCLE_JOB_STATUSES)[number];

export const SOURCE_LIFECYCLE_ACTIONS = ["disconnect_keep_history"] as const;

export type SourceLifecycleAction = (typeof SOURCE_LIFECYCLE_ACTIONS)[number];

export type SourceHistoryRetention = "kept" | "deleted";

const SYNC_ALLOWED_STATUSES = new Set<string>(["active", "needs_auth", "error"]);

const SYNC_BLOCKED_LIFECYCLE_STATUSES = new Set<string>([
  "disconnecting",
  "disconnected",
  "disconnect_failed",
  "support_required",
]);

export function normalizeSourceStatus(status: unknown): string {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

export function connectionSyncGuard(status: unknown): {
  allowed: boolean;
  status: string;
  message: string;
} {
  const normalizedStatus = normalizeSourceStatus(status);
  if (SYNC_ALLOWED_STATUSES.has(normalizedStatus)) {
    return { allowed: true, status: normalizedStatus, message: "" };
  }

  if (normalizedStatus === "disconnecting") {
    return {
      allowed: false,
      status: normalizedStatus,
      message: "This source is being disconnected and cannot be refreshed.",
    };
  }

  if (normalizedStatus === "disconnected") {
    return {
      allowed: false,
      status: normalizedStatus,
      message: "This source is disconnected and cannot be refreshed.",
    };
  }

  if (SYNC_BLOCKED_LIFECYCLE_STATUSES.has(normalizedStatus)) {
    return {
      allowed: false,
      status: normalizedStatus,
      message: "This source needs support before it can be refreshed.",
    };
  }

  return {
    allowed: false,
    status: normalizedStatus,
    message: "This source is not available for refresh.",
  };
}
