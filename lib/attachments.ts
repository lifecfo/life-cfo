// lib/attachments.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type AttachmentMeta = {
  name: string;
  path: string; // storage path inside bucket
  type: string;
  size: number;
};

export function softKB(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function normalizeAttachments(raw: unknown): AttachmentMeta[] {
  if (!raw || !Array.isArray(raw)) return [];

  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .filter((a) => typeof a.path === "string" && a.path.length > 0)
    .map((a) => ({
      name: typeof a.name === "string" && a.name.length > 0 ? a.name : "Attachment",
      path: String(a.path),
      type: typeof a.type === "string" && a.type.length > 0 ? a.type : "application/octet-stream",
      size: typeof a.size === "number" ? a.size : 0,
    }));
}

export async function createSignedUrl(
  supabase: SupabaseClient,
  path: string,
  opts?: { bucket?: string; expiresInSec?: number }
): Promise<string | null> {
  if (!path) return null;

  const bucket = opts?.bucket ?? "captures";
  const expiresInSec = opts?.expiresInSec ?? 60 * 10;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) return null;

  return data.signedUrl;
}
