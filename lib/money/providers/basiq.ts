// lib/money/providers/basiq.ts
import type { MoneyProvider, ProviderSyncResult } from "./types";
import { supabaseRoute } from "@/lib/supabaseRoute";
import type { SupabaseClient } from "@supabase/supabase-js";

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

type ParsedBasiq = {
  correlationId?: string;
  code?: string;
  title?: string;
  detail?: string;
};

function parseBasiqPayload(text: string): ParsedBasiq {
  try {
    const j = JSON.parse(text);
    return {
      correlationId: typeof j?.correlationId === "string" ? j.correlationId : undefined,
      code: typeof j?.data?.[0]?.code === "string" ? j.data[0].code : undefined,
      title: typeof j?.data?.[0]?.title === "string" ? j.data[0].title : undefined,
      detail: typeof j?.data?.[0]?.detail === "string" ? j.data[0].detail : undefined,
    };
  } catch {
    return {};
  }
}

export class BasiqError extends Error {
  status: number;
  stage: string;
  bodyText: string;
  basiq: ParsedBasiq;

  constructor(stage: string, status: number, bodyText: string) {
    super(`Basiq ${stage} error (${status}): ${bodyText}`);
    this.name = "BasiqError";
    this.stage = stage;
    this.status = status;
    this.bodyText = bodyText;
    this.basiq = parseBasiqPayload(bodyText);
  }
}

// SERVER_ACCESS bearer cache (Node runtime)
let cachedServerToken: { token: string; expiresAtMs: number } | null = null;

async function fetchToken(params: Record<string, string>, stage: string): Promise<unknown> {
  assertEnv();

  const body = new URLSearchParams(params);

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

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new BasiqError(stage, res.status, text);

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function getBasiqServerBearerToken(): Promise<string> {
  const now = Date.now();
  if (cachedServerToken && cachedServerToken.expiresAtMs > now + 30_000) {
    return cachedServerToken.token;
  }

  // SERVER_ACCESS token (server-side API calls)
  const json = await fetchToken({ scope: "SERVER_ACCESS" }, "token:server");
  const tokenSource = json as Record<string, unknown> | null;

  const token = String(tokenSource?.access_token || tokenSource?.token || "");
  const expiresInSec = Number(tokenSource?.expires_in ?? 3600);
  if (!token) throw new Error("Basiq token response missing access_token");

  cachedServerToken = {
    token,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec) * 1000,
  };

  return token;
}

// CLIENT_ACCESS token bound to a userId (for Consent UI redirect)
export async function getBasiqClientToken(userId: string): Promise<string> {
  const json = await fetchToken(
    { scope: "CLIENT_ACCESS", userId: String(userId) },
    "token:client"
  );
  const tokenSource = json as Record<string, unknown> | null;

  const token = String(tokenSource?.access_token || tokenSource?.token || "");
  if (!token) throw new Error("Basiq client token response missing access_token");
  return token;
}

function mergeHeadersNoAuth(optionsHeaders: RequestInit["headers"]): Headers {
  const h = new Headers(optionsHeaders || undefined);

  // remove ALL authorization variants (case-insensitive)
  for (const key of Array.from(h.keys())) {
    if (key.toLowerCase() === "authorization") h.delete(key);
  }

  return h;
}

export async function basiqFetch(path: string, options: RequestInit = {}) {
  const bearer = await getBasiqServerBearerToken();

  const headers = mergeHeadersNoAuth(options.headers);

  // Set required headers using Headers.set (overwrites any casing duplicates)
  headers.set("Accept", "application/json");
  headers.set("Content-Type", "application/json");
  headers.set("basiq-version", BASIQ_VERSION);
  headers.set("Authorization", `Bearer ${bearer}`);

  // Avoid spreading headers from options into the final fetch init (can reintroduce duplicates)
  const rest: RequestInit = { ...options };
  delete rest.headers;

  const res = await fetch(`${BASIQ_BASE_URL}${path}`, {
    ...rest,
    headers,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) throw new BasiqError(`api:${path}`, res.status, text);

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Low-level helpers (expect a BASIQ userId)
export async function getBasiqAccounts(basiqUserId: string) {
  const data = await basiqFetch(`/users/${basiqUserId}/accounts`);
  const root = (data as Record<string, unknown> | null) ?? null;
  return (root?.data as unknown[]) ?? (Array.isArray(data) ? data : []);
}

export async function getBasiqTransactions(basiqUserId: string) {
  const data = await basiqFetch(`/users/${basiqUserId}/transactions`);
  const root = (data as Record<string, unknown> | null) ?? null;
  return (root?.data as unknown[]) ?? (Array.isArray(data) ? data : []);
}

type ConnectionRow = {
  id: string;
  household_id: string;
  provider: string;
  status: string;
  item_id: string | null;
};

type BasiqItemIdPayload = {
  basiq_user_id?: string;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toCurrency(v: unknown, fallback = "AUD"): string {
  const s = safeStr(v).toUpperCase();
  return s || fallback;
}

function toCentsFromAmount(v: unknown): number {
  return Math.round(safeNum(v) * 100);
}

function readFirstString(source: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = safeStr(source[k]);
    if (v) return v;
  }
  return "";
}

function normalizeAccountType(rawType: unknown): string {
  const t = safeStr(rawType).toLowerCase();
  if (!t) return "other";
  if (t.includes("credit")) return "credit";
  if (t.includes("loan")) return "loan";
  if (t.includes("mortgage")) return "loan";
  if (t.includes("investment")) return "investment";
  if (t.includes("brokerage")) return "investment";
  if (t.includes("depository")) return "cash";
  if (t.includes("transaction")) return "cash";
  if (t.includes("savings")) return "cash";
  return t;
}

function parseBasiqItemPayload(itemId: string | null): BasiqItemIdPayload {
  const raw = safeStr(itemId);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as BasiqItemIdPayload;
    }
  } catch {
    // keep fallback below
  }
  return { basiq_user_id: raw };
}

function getBasiqUserId(itemId: string | null): string {
  return safeStr(parseBasiqItemPayload(itemId).basiq_user_id);
}

function parseSignedTransactionCents(tx: Record<string, unknown>): number {
  const hasAmountCents = Number.isFinite(Number(tx.amount_cents));
  const base = hasAmountCents
    ? Math.round(Number(tx.amount_cents))
    : toCentsFromAmount(tx.amount);

  const direction = readFirstString(tx, [
    "class",
    "type",
    "subClass",
    "sub_type",
    "transactionClass",
    "direction",
  ]).toLowerCase();

  if (direction.includes("debit")) return -Math.abs(base);
  if (direction.includes("credit")) return Math.abs(base);
  return base;
}

function extractProviderAccountId(tx: Record<string, unknown>): string {
  const direct = readFirstString(tx, [
    "account",
    "account_id",
    "accountId",
    "accountID",
  ]);
  if (direct) return direct;

  const links = tx.links;
  if (links && typeof links === "object") {
    const linksObj = links as Record<string, unknown>;
    return readFirstString(linksObj, ["account", "account_id", "accountId"]);
  }

  return "";
}

function extractDate(tx: Record<string, unknown>): string {
  const raw = readFirstString(tx, ["postDate", "posted", "date", "transactionDate", "created"]);
  if (!raw) return new Date().toISOString().slice(0, 10);
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return new Date().toISOString().slice(0, 10);
  return new Date(ms).toISOString().slice(0, 10);
}

async function getContext(connectionId: string) {
  const supabase = await supabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user?.id) throw new Error("Not signed in.");

  const { data: connection, error: connErr } = await supabase
    .from("external_connections")
    .select("id, household_id, provider, status, item_id")
    .eq("id", connectionId)
    .eq("provider", "basiq")
    .maybeSingle();

  if (connErr) throw connErr;
  if (!connection) throw new Error("Basiq connection not found.");

  return { supabase, connection: connection as ConnectionRow };
}

async function upsertAccounts(params: {
  supabase: SupabaseClient;
  householdId: string;
  connectionId: string;
  accounts: Record<string, unknown>[];
}) {
  const { supabase, householdId, connectionId, accounts } = params;

  const rows = accounts
    .map((a) => {
      const providerAccountId = readFirstString(a, ["id", "accountId", "account_id", "accountID"]);
      if (!providerAccountId) return null;

      const availableBalanceCentsRaw = readFirstString(a, [
        "availableFunds",
        "available_balance",
        "availableBalance",
      ]);

      const availableBalanceCents =
        availableBalanceCentsRaw !== ""
          ? toCentsFromAmount(availableBalanceCentsRaw)
          : null;

      const currentBalanceRaw = readFirstString(a, ["balance", "current_balance", "currentBalance"]);

      return {
        household_id: householdId,
        connection_id: connectionId,
        provider: "basiq",
        external_id: providerAccountId,
        provider_account_id: providerAccountId,
        name:
          readFirstString(a, ["name", "accountNo", "accountNumber", "bsb"]) || "Account",
        official_name: readFirstString(a, ["name", "institution", "institutionName"]) || null,
        type: normalizeAccountType(readFirstString(a, ["type", "class"])),
        subtype: readFirstString(a, ["subClass", "sub_type", "subtype"]) || null,
        status: "active",
        currency: toCurrency(readFirstString(a, ["currency"])),
        current_balance_cents: toCentsFromAmount(currentBalanceRaw),
        available_balance_cents: availableBalanceCents,
        mask: readFirstString(a, ["accountNo", "mask", "last4"]).slice(-4) || null,
        archived: false,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is Record<string, unknown> => row !== null);

  if (!rows.length) return { count: 0 };

  const { data, error } = await supabase
    .from("accounts")
    .upsert(rows, { onConflict: "household_id,provider,provider_account_id" })
    .select("id");

  if (error) throw error;

  const externalRows = rows.map((row) => ({
    household_id: householdId,
    provider: "basiq",
    connection_id: connectionId,
    provider_account_id: row.provider_account_id,
    name: row.name,
    mask: row.mask,
    type: row.type,
    subtype: row.subtype,
    currency: row.currency,
    archived: false,
    metadata: {
      official_name: row.official_name,
    },
    updated_at: new Date().toISOString(),
  }));

  const { error: externalErr } = await supabase
    .from("external_accounts")
    .upsert(externalRows, { onConflict: "household_id,provider,provider_account_id" });

  if (externalErr) throw externalErr;

  return { count: data?.length ?? 0 };
}

async function buildAccountMap(params: {
  supabase: SupabaseClient;
  householdId: string;
  connectionId: string;
}) {
  const { supabase, householdId, connectionId } = params;
  const { data, error } = await supabase
    .from("accounts")
    .select("id, provider_account_id")
    .eq("household_id", householdId)
    .eq("connection_id", connectionId)
    .eq("provider", "basiq")
    .eq("archived", false);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const record = row as Record<string, unknown>;
    const providerAccountId = safeStr(record.provider_account_id);
    const id = safeStr(record.id);
    if (providerAccountId && id) map.set(providerAccountId, id);
  }
  return map;
}

async function upsertTransactions(params: {
  supabase: SupabaseClient;
  householdId: string;
  connectionId: string;
  transactions: Record<string, unknown>[];
  accountIdMap: Map<string, string>;
}) {
  const { supabase, householdId, connectionId, transactions, accountIdMap } = params;

  const rows = transactions
    .map((tx) => {
      const externalId = readFirstString(tx, ["id", "transactionId", "transaction_id"]);
      if (!externalId) return null;

      const providerAccountId = extractProviderAccountId(tx);
      const accountId = accountIdMap.get(providerAccountId);
      if (!accountId) return null;

      const date = extractDate(tx);
      const amountCents = parseSignedTransactionCents(tx);
      const currency = toCurrency(readFirstString(tx, ["currency"]), "AUD");
      const description =
        readFirstString(tx, ["description", "descriptionRaw", "narrative", "reference"])
          || readFirstString(tx, ["merchant"])
          || "Transaction";
      const pendingStr = readFirstString(tx, ["status", "pending"]);
      const pending =
        pendingStr === "true" ||
        pendingStr.toLowerCase().includes("pending") ||
        tx.pending === true;

      return {
        household_id: householdId,
        account_id: accountId,
        connection_id: connectionId,
        external_connection_id: connectionId,
        provider: "basiq",
        external_id: externalId,
        date,
        posted_at: `${date}T00:00:00.000Z`,
        description,
        merchant: readFirstString(tx, ["merchant", "institution", "description"]) || null,
        category:
          readFirstString(tx, ["subClass", "sub_type", "category", "class"]) || null,
        pending,
        amount_cents: amountCents,
        amount: amountCents / 100,
        currency,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((row): row is Record<string, unknown> => row !== null);

  if (!rows.length) return { count: 0 };

  const { data, error } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "household_id,provider,external_id" })
    .select("id");

  if (error) throw error;
  return { count: data?.length ?? 0 };
}

export const basiqProvider: MoneyProvider = {
  name: "basiq",
  async sync(connectionId: string): Promise<ProviderSyncResult> {
    const { supabase, connection } = await getContext(connectionId);

    const householdId = safeStr(connection.household_id);
    if (!householdId) throw new Error("Basiq connection missing household id.");

    const basiqUserId = getBasiqUserId(connection.item_id);
    if (!basiqUserId) {
      throw new Error("Basiq connection missing basiq_user_id in item_id.");
    }

    const accounts = (await getBasiqAccounts(basiqUserId)) as Record<string, unknown>[];
    const accountsResult = await upsertAccounts({
      supabase,
      householdId,
      connectionId,
      accounts,
    });

    const accountIdMap = await buildAccountMap({
      supabase,
      householdId,
      connectionId,
    });

    const transactions = (await getBasiqTransactions(
      basiqUserId
    )) as Record<string, unknown>[];
    const txResult = await upsertTransactions({
      supabase,
      householdId,
      connectionId,
      transactions,
      accountIdMap,
    });

    const { error: connErr } = await supabase
      .from("external_connections")
      .update({
        status: "active",
        last_error: null,
        last_error_at: null,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connectionId)
      .eq("household_id", householdId);

    if (connErr) throw connErr;

    return {
      accountsUpserted: accountsResult.count,
      transactionsUpserted: txResult.count,
    };
  },
};
