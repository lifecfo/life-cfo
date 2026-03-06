import type { MoneyProvider, ProviderSyncResult } from "./types";
import { getPlaidClient } from "@/lib/money/plaidClient";
import { supabaseRoute } from "@/lib/supabaseRoute";

type ConnectionRow = {
  id: string;
  household_id: string;
  provider: string;
  status: string;
  encrypted_access_token: string | null;
  item_id: string | null;
  provider_item_id: string | null;
  transactions_cursor: string | null;
};

type PlaidAccount = {
  account_id: string;
  balances?: {
    available?: number | null;
    current?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  } | null;
  mask?: string | null;
  name?: string | null;
  official_name?: string | null;
  subtype?: string | null;
  type?: string | null;
};

type PlaidSyncTransaction = {
  transaction_id: string;
  account_id: string;
  amount?: number | null;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  date?: string | null;
  authorized_date?: string | null;
  name?: string | null;
  merchant_name?: string | null;
  pending?: boolean | null;
  personal_finance_category?: {
    primary?: string | null;
    detailed?: string | null;
  } | null;
};

type PlaidRemovedTransaction = {
  transaction_id: string;
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function toCurrency(v: unknown, fallback = "USD"): string {
  const s = safeStr(v).toUpperCase();
  return s || fallback;
}

function centsFromNumber(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

function normalizeAccountType(type: string | null | undefined): string {
  const t = safeStr(type).toLowerCase();
  if (!t) return "other";

  switch (t) {
    case "depository":
      return "cash";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
      return "investment";
    case "brokerage":
      return "investment";
    case "other":
      return "other";
    default:
      return t;
  }
}

function pickTransactionDate(tx: PlaidSyncTransaction): string {
  const primary = safeStr(tx.date);
  if (primary) return primary;

  const fallback = safeStr(tx.authorized_date);
  if (fallback) return fallback;

  return new Date().toISOString().slice(0, 10);
}

function pickTransactionCategory(tx: PlaidSyncTransaction): string | null {
  const detailed = safeStr(tx.personal_finance_category?.detailed);
  if (detailed) return detailed;

  const primary = safeStr(tx.personal_finance_category?.primary);
  if (primary) return primary;

  return null;
}

async function getContext(connectionId: string) {
  const supabase = await supabaseRoute();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user?.id) {
    throw new Error("Not signed in.");
  }

  const { data: connection, error: connErr } = await supabase
    .from("external_connections")
    .select(
      "id, household_id, provider, status, encrypted_access_token, item_id, provider_item_id, transactions_cursor"
    )
    .eq("id", connectionId)
    .eq("provider", "plaid")
    .maybeSingle();

  if (connErr) throw connErr;
  if (!connection) throw new Error("Plaid connection not found.");

  return {
    supabase,
    userId: user.id,
    connection: connection as ConnectionRow,
  };
}

async function upsertAccounts(params: {
  supabase: any;
  userId: string;
  householdId: string;
  connectionId: string;
  accounts: PlaidAccount[];
}) {
  const { supabase, userId, householdId, connectionId, accounts } = params;

  if (!accounts.length) return { rows: [] as any[], count: 0 };

  const rows = accounts.map((a) => {
    const currency =
      toCurrency(a?.balances?.iso_currency_code) ||
      toCurrency(a?.balances?.unofficial_currency_code) ||
      "USD";

    return {
      user_id: userId,
      household_id: householdId,
      connection_id: connectionId,
      provider: "plaid",
      external_id: safeStr(a.account_id) || null,
      provider_account_id: safeStr(a.account_id) || null,
      name: safeStr(a.name) || safeStr(a.official_name) || "Account",
      official_name: safeStr(a.official_name) || null,
      type: normalizeAccountType(a.type),
      subtype: safeStr(a.subtype) || null,
      status: "active",
      currency,
      current_balance_cents: centsFromNumber(a?.balances?.current),
      available_balance_cents:
        typeof a?.balances?.available === "number"
          ? centsFromNumber(a.balances.available)
          : null,
      mask: safeStr(a.mask) || null,
      archived: false,
      updated_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("accounts")
    .upsert(rows, { onConflict: "user_id,provider,provider_account_id" })
    .select("id, provider_account_id");

  if (error) throw error;

  const externalRows = rows.map((row) => ({
    user_id: userId,
    household_id: householdId,
    provider: "plaid",
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
    .upsert(externalRows, {
      onConflict: "user_id,provider,provider_account_id",
    });

  if (externalErr) throw externalErr;

  return { rows: data ?? [], count: data?.length ?? 0 };
}

async function buildAccountMap(params: {
  supabase: any;
  userId: string;
  householdId: string;
  connectionId: string;
}) {
  const { supabase, userId, householdId, connectionId } = params;

  const { data, error } = await supabase
    .from("accounts")
    .select("id, provider_account_id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .eq("connection_id", connectionId)
    .eq("provider", "plaid")
    .eq("archived", false);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const providerAccountId = safeStr((row as any)?.provider_account_id);
    const id = safeStr((row as any)?.id);
    if (providerAccountId && id) map.set(providerAccountId, id);
  }

  return map;
}

async function syncTransactions(params: {
  supabase: any;
  plaid: any;
  userId: string;
  householdId: string;
  connectionId: string;
  accessToken: string;
  cursor: string | null;
  accountIdMap: Map<string, string>;
}) {
  const {
    supabase,
    plaid,
    userId,
    householdId,
    connectionId,
    accessToken,
    cursor,
    accountIdMap,
  } = params;

  let nextCursor = cursor || undefined;
  let hasMore = true;

  const added: PlaidSyncTransaction[] = [];
  const modified: PlaidSyncTransaction[] = [];
  const removed: PlaidRemovedTransaction[] = [];

  while (hasMore) {
    const response = await plaid.transactionsSync({
      access_token: accessToken,
      cursor: nextCursor,
      count: 100,
    });

    const data = response.data;
    added.push(...((data.added as PlaidSyncTransaction[]) ?? []));
    modified.push(...((data.modified as PlaidSyncTransaction[]) ?? []));
    removed.push(...((data.removed as PlaidRemovedTransaction[]) ?? []));

    nextCursor = safeStr(data.next_cursor) || nextCursor;
    hasMore = Boolean(data.has_more);
  }

  const upsertRows = [...added, ...modified]
    .map((tx) => {
      const externalId = safeStr(tx.transaction_id);
      const providerAccountId = safeStr(tx.account_id);
      const accountId = accountIdMap.get(providerAccountId);

      if (!externalId || !providerAccountId || !accountId) return null;

      const amountCents = centsFromNumber(tx.amount);
      const currency =
        toCurrency(tx.iso_currency_code) ||
        toCurrency(tx.unofficial_currency_code) ||
        "USD";

      const description = safeStr(tx.name) || safeStr(tx.merchant_name) || "Transaction";
      const merchant = safeStr(tx.merchant_name) || null;
      const category = pickTransactionCategory(tx);
      const date = pickTransactionDate(tx);

      return {
        user_id: userId,
        household_id: householdId,
        account_id: accountId,
        connection_id: connectionId,
        external_connection_id: connectionId,
        provider: "plaid",
        external_id: externalId,
        date,
        posted_at: `${date}T00:00:00.000Z`,
        description,
        merchant,
        category,
        pending: Boolean(tx.pending),
        amount_cents: amountCents,
        amount: amountCents / 100,
        currency,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);

  if (upsertRows.length) {
    const { error: txErr } = await supabase
      .from("transactions")
      .upsert(upsertRows, { onConflict: "household_id,provider,external_id" });

    if (txErr) throw txErr;
  }

  if (removed.length) {
    const removedIds = removed
      .map((r) => safeStr(r.transaction_id))
      .filter(Boolean);

    if (removedIds.length) {
      const { error: delErr } = await supabase
        .from("transactions")
        .delete()
        .eq("household_id", householdId)
        .eq("provider", "plaid")
        .in("external_id", removedIds);

      if (delErr) throw delErr;
    }
  }

  return {
    nextCursor: nextCursor || null,
    count: upsertRows.length,
  };
}

export const plaidProvider: MoneyProvider = {
  name: "plaid",

  async sync(connectionId: string): Promise<ProviderSyncResult> {
    const { supabase, userId, connection } = await getContext(connectionId);

    const accessToken = safeStr(connection.encrypted_access_token);
    if (!accessToken) {
      throw new Error("Plaid connection missing access token.");
    }

    const householdId = safeStr(connection.household_id);
    if (!householdId) {
      throw new Error("Plaid connection missing household id.");
    }

    const plaid = getPlaidClient();

    const accountsResponse = await plaid.accountsGet({
      access_token: accessToken,
    });

    const plaidAccounts = (accountsResponse.data.accounts ?? []) as PlaidAccount[];

    const accountsResult = await upsertAccounts({
      supabase,
      userId,
      householdId,
      connectionId,
      accounts: plaidAccounts,
    });

    const accountIdMap = await buildAccountMap({
      supabase,
      userId,
      householdId,
      connectionId,
    });

    const txResult = await syncTransactions({
      supabase,
      plaid,
      userId,
      householdId,
      connectionId,
      accessToken,
      cursor: connection.transactions_cursor,
      accountIdMap,
    });

    const { error: connErr } = await supabase
      .from("external_connections")
      .update({
        status: "active",
        last_error: null,
        last_error_at: null,
        transactions_cursor: txResult.nextCursor,
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