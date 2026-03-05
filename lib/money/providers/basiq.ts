// lib/money/providers/basiq.ts
import type { MoneyProvider } from "./types";

const BASIQ_BASE_URL = (process.env.BASIQ_BASE_URL || "https://au-api.basiq.io").trim();

// This should be the Base64 credential string shown by Basiq (the part AFTER "Basic ").
// We'll be tolerant if you pasted it with "Basic " prefix.
const BASIQ_API_KEY_RAW = (process.env.BASIQ_API_KEY || "").trim();

const BASIQ_VERSION = (process.env.BASIQ_VERSION || "3.0").trim();

function assertEnv() {
  if (!BASIQ_API_KEY_RAW) throw new Error("Missing BASIQ_API_KEY");
}

function basiqBasicValue() {
  // Accept either:
  // - "YmQ2...==" (recommended)
  // - "Basic YmQ2...==" (we'll normalize)
  const v = BASIQ_API_KEY_RAW;
  return v.toLowerCase().startsWith("basic ") ? v.slice(6).trim() : v;
}

// Simple in-memory token cache (Node runtime). Token is short-lived; refresh before expiry.
let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getBasiqBearerToken(): Promise<string> {
  assertEnv();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({ scope: "SERVER_ACCESS" });

  const headers = new Headers();
  headers.set("Authorization", `Basic ${basiqBasicValue()}`);
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  headers.set("basiq-version", BASIQ_VERSION);

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq token error (${res.status}): ${text}`);
  }

  const json: any = await res.json();
  const token = String(json?.access_token || json?.token || "");
  const expiresInSec = Number(json?.expires_in ?? 3600);

  if (!token) throw new Error("Basiq token response missing access_token");

  cachedToken = {
    token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  };

  return token;
}

function mergeHeadersNoAuth(optionsHeaders: RequestInit["headers"]): Headers {
  // Create Headers from whatever the caller supplied
  const h = new Headers(optionsHeaders || undefined);

  // CRITICAL: remove ALL authorization variants (case-insensitive)
  // so we can set exactly one Authorization header.
  for (const key of Array.from(h.keys())) {
    if (key.toLowerCase() === "authorization") h.delete(key);
  }

  return h;
}

export async function basiqFetch(path: string, options: RequestInit = {}) {
  const bearer = await getBasiqBearerToken();

  // Never allow caller headers to override/duplicate Authorization
  const headers = mergeHeadersNoAuth(options.headers);

  // Set required headers using Headers.set (overwrites any casing duplicates)
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("basiq-version", BASIQ_VERSION);
  headers.set("Authorization", `Bearer ${bearer}`);

  // Avoid spreading headers from options into an object (can reintroduce duplicates)
  const { headers: _ignored, ...rest } = options;

  const res = await fetch(`${BASIQ_BASE_URL}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq API error (${res.status}): ${text}`);
  }

  return res.json();
}

// Low-level helpers (expect a BASIQ userId)
export async function getBasiqAccounts(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/accounts`);
  return data?.data ?? data ?? [];
}

export async function getBasiqTransactions(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/transactions`);
  return data?.data ?? data ?? [];
}

export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync() {
    throw new Error(
      "basiqProvider.sync() not wired yet: need basiq_user_id stored on external_connections.item_id."
    );
  },
};