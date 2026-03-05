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

// Normalize any RequestInit.headers into a plain object (lower risk of surprises).
function headersToObject(h: RequestInit["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const obj: Record<string, string> = {};
    h.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
  if (Array.isArray(h)) {
    return Object.fromEntries(h.map(([k, v]) => [String(k), String(v)]));
  }
  // h is Record<string, string>
  const obj: Record<string, string> = {};
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (typeof v === "string") obj[k] = v;
    else if (v != null) obj[k] = String(v);
  }
  return obj;
}

// Remove Authorization header from user-provided headers so we never forward browser/auth tokens to Basiq.
// (This is the #1 cause of the “missing equal-sign in Authorization header” 403.)
function stripAuthorizationHeader(h: Record<string, string>) {
  for (const key of Object.keys(h)) {
    if (key.toLowerCase() === "authorization") delete h[key];
  }
}

// Simple in-memory token cache (Node runtime). Token is short-lived; refresh before expiry.
let cachedToken: { token: string; expiresAtMs: number } | null = null;

async function getBasiqBearerToken(): Promise<string> {
  assertEnv();

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  // Per Basiq spec:
  // POST /token
  // header: basiq-version: 3.0
  // body: application/x-www-form-urlencoded with scope=SERVER_ACCESS (server-side)
  // auth: Authorization: Basic <base64>
  const body = new URLSearchParams({ scope: "SERVER_ACCESS" });

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers: {
      // Do not forward any incoming headers here—this must be a clean request to Basiq.
      Authorization: `Basic ${basiqBasicValue()}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": BASIQ_VERSION,
    },
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

export async function basiqFetch(path: string, options: RequestInit = {}) {
  const bearer = await getBasiqBearerToken();

  // Normalize and sanitize caller headers so we never leak/forward Authorization to Basiq.
  const callerHeaders = headersToObject(options.headers);
  stripAuthorizationHeader(callerHeaders);

  // IMPORTANT: set our required headers LAST so they cannot be overridden by caller headers.
  const res = await fetch(`${BASIQ_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...callerHeaders,
      Accept: "application/json",
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
      Authorization: `Bearer ${bearer}`,
    },
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