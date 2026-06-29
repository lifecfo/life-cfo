import type {
  AccountsTruthRow,
  ExternalConnectionsTruthRow,
  HouseholdMoneyTruth,
  MoneyDataCoverage,
  MoneySourceCoverage,
  TransactionsTruthRow,
} from "./types";

const FRESH_CONNECTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizedProvider(value: string | null | undefined): string {
  return String(value || "unknown").trim().toLowerCase() || "unknown";
}

type DemoMoneySourceCandidate = {
  provider?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function isDemoMoneySource(connection: DemoMoneySourceCandidate): boolean {
  const scenario = connection.metadata?.scenario;
  return (
    normalizedProvider(connection.provider) === "manual" &&
    String(connection.status || "").trim().toLowerCase() === "demo" &&
    connection.metadata?.demo === true &&
    typeof scenario === "string" &&
    scenario.trim().length > 0
  );
}

function sourceLabel(connection: ExternalConnectionsTruthRow): string {
  return isDemoMoneySource(connection)
    ? "manual demo data"
    : normalizedProvider(connection.provider);
}

function connectionUpdatedAt(connection: ExternalConnectionsTruthRow): number | null {
  const value = Date.parse(connection.last_sync_at || connection.updated_at || "");
  return Number.isFinite(value) ? value : null;
}

function isIncludedConnection(
  connection: ExternalConnectionsTruthRow,
  nowMs: number
): boolean {
  const provider = normalizedProvider(connection.provider);
  const status = String(connection.status || "").trim().toLowerCase();
  if (isDemoMoneySource(connection)) return true;
  if (provider === "manual") {
    return status === "manual" || status === "active";
  }
  if (status !== "active") return false;
  const updatedAt = connectionUpdatedAt(connection);
  if (updatedAt === null) return false;
  const ageMs = Math.max(0, nowMs - updatedAt);
  return ageMs <= FRESH_CONNECTION_DAYS * DAY_MS;
}

function isLocalProvider(provider: string | null | undefined): boolean {
  const value = normalizedProvider(provider);
  return value === "manual" || value === "unknown";
}

function connectionIdForTransaction(transaction: TransactionsTruthRow): string | null {
  return transaction.connection_id || transaction.external_connection_id || null;
}

function centsFor(transaction: TransactionsTruthRow): number {
  if (typeof transaction.amount_cents === "number") return transaction.amount_cents;
  if (typeof transaction.amount === "number") return Math.round(transaction.amount * 100);
  return 0;
}

function moneyRows(transactions: TransactionsTruthRow[], direction: "in" | "out") {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const cents = centsFor(transaction);
    if (direction === "in" ? cents <= 0 : cents >= 0) continue;
    const currency = String(transaction.currency || "AUD").trim().toUpperCase() || "AUD";
    const amount = direction === "in" ? cents : Math.abs(cents);
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return Array.from(totals.entries())
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function labelIsUnclear(transaction: TransactionsTruthRow): boolean {
  const label = String(transaction.merchant || transaction.description || "").trim();
  if (!label) return true;
  const compact = label.replace(/\s+/g, "").toUpperCase();
  return /^AU\d+$/.test(compact) || /^[A-Z]{1,3}\d{4,}$/.test(compact) || /^\d{5,}$/.test(compact);
}

function sourceSummary(
  connections: ExternalConnectionsTruthRow[],
  accounts: AccountsTruthRow[],
  transactions: TransactionsTruthRow[]
): MoneySourceCoverage[] {
  const byProvider = new Map<string, MoneySourceCoverage>();
  const labelsByConnectionId = new Map<string, string>();
  for (const connection of connections) {
    const provider = sourceLabel(connection);
    labelsByConnectionId.set(connection.id, provider);
    const existing = byProvider.get(provider) ?? {
      provider,
      connection_count: 0,
      account_count: 0,
      transaction_count: 0,
    };
    existing.connection_count += 1;
    byProvider.set(provider, existing);
  }

  for (const account of accounts) {
    const provider = account.connection_id
      ? labelsByConnectionId.get(account.connection_id) ?? normalizedProvider(account.provider)
      : normalizedProvider(account.provider);
    const existing = byProvider.get(provider);
    if (existing) existing.account_count += 1;
  }
  for (const transaction of transactions) {
    const connectionId = connectionIdForTransaction(transaction);
    const provider = connectionId
      ? labelsByConnectionId.get(connectionId) ?? normalizedProvider(transaction.provider)
      : normalizedProvider(transaction.provider);
    const existing = byProvider.get(provider);
    if (existing) existing.transaction_count += 1;
  }

  return Array.from(byProvider.values()).sort((left, right) =>
    left.provider.localeCompare(right.provider)
  );
}

function transactionDates(transactions: TransactionsTruthRow[]): string[] {
  return transactions
    .map((transaction) => transaction.date)
    .filter((date): date is string => Boolean(date))
    .sort();
}

export function deriveEffectiveMoneyTruth(rawTruth: HouseholdMoneyTruth): {
  truth: HouseholdMoneyTruth;
  dataCoverage: MoneyDataCoverage;
} {
  const parsedNow = Date.parse(rawTruth.as_of_iso);
  const nowMs = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  const includedConnections = rawTruth.external_connections.filter((connection) =>
    isIncludedConnection(connection, nowMs)
  );
  const includedConnectionIds = new Set(includedConnections.map((connection) => connection.id));
  const referenceConnections = rawTruth.external_connections.filter(
    (connection) => !includedConnectionIds.has(connection.id)
  );
  const referenceConnectionIds = new Set(referenceConnections.map((connection) => connection.id));

  const accountIsIncluded = (account: AccountsTruthRow) =>
    account.connection_id
      ? includedConnectionIds.has(account.connection_id)
      : isLocalProvider(account.provider);
  const accountIsReference = (account: AccountsTruthRow) =>
    Boolean(account.connection_id && referenceConnectionIds.has(account.connection_id));

  const accounts = rawTruth.accounts.filter(accountIsIncluded);
  const referenceAccounts = rawTruth.accounts.filter(accountIsReference);
  const includedAccountIds = new Set(accounts.map((account) => account.id));

  const transactionIsIncluded = (transaction: TransactionsTruthRow) => {
    const connectionId = connectionIdForTransaction(transaction);
    if (connectionId) return includedConnectionIds.has(connectionId);
    if (transaction.account_id && includedAccountIds.has(transaction.account_id)) return true;
    return isLocalProvider(transaction.provider);
  };
  const transactionIsReference = (transaction: TransactionsTruthRow) => {
    const connectionId = connectionIdForTransaction(transaction);
    return Boolean(connectionId && referenceConnectionIds.has(connectionId));
  };

  const recentTransactions = rawTruth.recent_transactions.filter(transactionIsIncluded);
  const monthTransactions = rawTruth.month_transactions.filter(transactionIsIncluded);
  const rollingTransactions = rawTruth.rolling_transactions.filter(transactionIsIncluded);
  const referenceTransactions = rawTruth.rolling_transactions.filter(transactionIsReference);
  const dates = transactionDates(rollingTransactions);
  const unclearLabelCount = rollingTransactions.filter(labelIsUnclear).length;
  const confirmations = rawTruth.transaction_pattern_confirmations;

  const truth: HouseholdMoneyTruth = {
    ...rawTruth,
    accounts,
    recent_transactions: recentTransactions,
    month_transactions: monthTransactions,
    rolling_transactions: rollingTransactions,
    external_connections: includedConnections,
  };

  return {
    truth,
    dataCoverage: {
      included_sources: sourceSummary(includedConnections, accounts, rollingTransactions),
      reference_only_sources: sourceSummary(
        referenceConnections,
        referenceAccounts,
        referenceTransactions
      ),
      account_count: accounts.length,
      transaction_count: rollingTransactions.length,
      transaction_window: dates.length
        ? { start_date: dates[0], end_date: dates[dates.length - 1] }
        : null,
      latest_transaction_date: dates.length ? dates[dates.length - 1] : null,
      current_month_money_in: moneyRows(monthTransactions, "in"),
      current_month_money_out: moneyRows(monthTransactions, "out"),
      confirmed_regular_payment_count: confirmations.filter(
        (confirmation) => confirmation.kind === "bill"
      ).length,
      confirmed_income_pattern_count: confirmations.filter(
        (confirmation) => confirmation.kind === "income"
      ).length,
      unclear_label_count: unclearLabelCount,
      label_quality_note:
        unclearLabelCount > 0
          ? "Some bank labels are unclear, so a few names may need review."
          : "Recent transaction names look clear enough to use.",
      has_reference_only_sources: referenceConnections.length > 0,
      has_demo_sources: includedConnections.some(isDemoMoneySource),
    },
  };
}
