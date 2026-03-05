// lib/money/providers/basiq.ts
import type { MoneyProvider } from "./types";

const BASIQ_BASE_URL = process.env.BASIQ_BASE_URL || "https://au-api.basiq.io";
const BASIQ_API_KEY = process.env.BASIQ_API_KEY || "";

// Basiq docs show current examples using basiq-version 3.0
// (You can override via env if you want.)
const BASIQ_VERSION = process.env.BASIQ_VERSION || "3.0";

function assertEnv() {
  if (!BASIQ_API_KEY) throw new Error("Missing BASIQ_API_KEY");
}

/**
 * In-memory token cache (Node runtime). Tokens expire ~60 minutes.
 * We'll refresh a bit early.
 */
let cachedToken: { token: string; expiresAtMs: number; scopeKey: string } | null = null;

type TokenScope = "SERVER_ACCESS" | "CLIENT_ACCESS";

async function getBasiqAccessToken(scope: TokenScope, userId?: string): Promise<string> {
  assertEnv();

  const scopeKey = scope === "CLIENT_ACCESS" ? `${scope}:${userId || ""}` : scope;

  const now = Date.now();
  if (cachedToken && cachedToken.scopeKey === scopeKey && cachedToken.expiresAtMs > now + 30_000) {
    return cachedToken.token;
  }

  // Basiq expects x-www-form-urlencoded with scope (and userId for CLIENT_ACCESS)
  // Authorization must be: Basic <YOUR_API_KEY>
  // https://au-api.basiq.io/token
  // :contentReference[oaicite:1]{index=1}
  const form = new URLSearchParams();
  form.set("scope", scope);
  if (scope === "CLIENT_ACCESS") {
    if (!userId) throw new Error("Missing basiq userId for CLIENT_ACCESS token.");
    form.set("userId", userId);
  }

  const res = await fetch(`${BASIQ_BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${BASIQ_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "basiq-version": BASIQ_VERSION,
      Accept: "application/json",
    },
    body: form.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq token error (${res.status}): ${text}`);
  }

  const json: any = await res.json().catch(() => ({}));

  // Common shapes: { access_token, expires_in } (docs) or { token }
  const token = String(json?.access_token || json?.token || "");
  const expiresInSec = Number(json?.expires_in ?? 3600);

  if (!token) {
    throw new Error("Basiq token response missing access_token");
  }

  cachedToken = {
    token,
    scopeKey,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  };

  return token;
}

export async function basiqFetch(path: string, options: RequestInit = {}) {
  // For general server-side API calls, SERVER_ACCESS is what Basiq uses in their quickstart.
  // :contentReference[oaicite:2]{index=2}
  const bearer = await getBasiqAccessToken("SERVER_ACCESS");

  const res = await fetch(`${BASIQ_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "basiq-version": BASIQ_VERSION,
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Basiq API error (${res.status}): ${text}`);
  }

  return res.json();
}

// Helpers (expect a BASIQ userId) — used later in sync
export async function getBasiqAccounts(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/accounts`);
  return data?.data ?? data ?? [];
}

export async function getBasiqTransactions(basiqUserId: string) {
  const data: any = await basiqFetch(`/users/${basiqUserId}/transactions`);
  return data?.data ?? data ?? [];
}

// Provider stub for now — we’ll wire sync once we store basiq_user_id in external_connections.item_id
export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync() {
    throw new Error(
      "basiqProvider.sync() not wired yet: need basiq_user_id stored on external_connections (we'll do next)."
    );
  },
};