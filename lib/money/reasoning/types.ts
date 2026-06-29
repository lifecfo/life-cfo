export type MoneyByCurrency = Record<string, number>;

export type MoneyCadence =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "yearly";

/**
 * Legacy compatibility types
 * These are still used by parts of the reasoning layer while the newer
 * household truth shape is being adopted.
 */
export type AccountTruth = {
  id: string;
  current_balance_cents: number;
  available_balance_cents?: number | null;
  currency?: string | null;
  provider?: string | null;
};

export type TransactionTruth = {
  id: string;
  date: string; // YYYY-MM-DD
  amount_cents: number; // positive = inflow, negative = outflow (raw ledger sign)
  currency?: string | null;
  category?: string | null;
};

export type RecurringBillTruth = {
  id: string;
  name: string;
  amount_cents: number;
  currency?: string | null;
  cadence: MoneyCadence;
  next_due_at: string | null;
  active: boolean;
};

export type RecurringIncomeTruth = {
  id: string;
  name: string;
  amount_cents: number;
  currency?: string | null;
  cadence: MoneyCadence;
  next_pay_at: string | null;
  active: boolean;
};

export type ConnectionTruth = {
  id: string;
  status: string;
  last_sync_at?: string | null;
  updated_at?: string | null;
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AccountsTruthRow = {
  id: string;
  household_id: string;
  connection_id?: string | null;
  name: string | null;
  provider: string | null;
  type: string | null;
  status: string | null;
  archived: boolean | null;
  current_balance_cents: number | null;
  available_balance_cents: number | null;
  currency: string | null;
  updated_at: string | null;
  created_at: string | null;
};

export type TransactionsTruthRow = {
  id: string;
  connection_id?: string | null;
  external_connection_id?: string | null;
  date: string | null;
  description: string | null;
  merchant: string | null;
  category: string | null;
  pending: boolean | null;
  amount: number | null;
  amount_cents: number | null;
  currency: string | null;
  account_id: string | null;
  provider: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RecurringBillsTruthRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_due_at: string | null;
  autopay: boolean | null;
  active: boolean | null;
  notes: string | null;
};

export type RecurringIncomeTruthRow = {
  id: string;
  name: string | null;
  amount_cents: number | null;
  currency: string | null;
  cadence: string | null;
  next_pay_at: string | null;
  active: boolean | null;
  notes: string | null;
};

export type MoneyGoalsTruthRow = {
  id: string;
  title: string | null;
  currency: string | null;
  target_cents: number | null;
  current_cents: number | null;
  status: string | null;
  target_date: string | null;
  deadline_at: string | null;
  is_primary: boolean | null;
  updated_at: string | null;
};

export type LiabilitiesTruthRow = {
  id: string;
  name: string | null;
  current_balance_cents: number | null;
  currency: string | null;
  archived: boolean | null;
  updated_at: string | null;
};

export type ExternalConnectionsTruthRow = {
  id: string;
  status: string | null;
  last_sync_at: string | null;
  updated_at: string | null;
  provider: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TransactionPatternConfirmationTruthRow = {
  id: string;
  pattern_key: string;
  kind: "bill" | "income" | "transfer" | "ignore";
  label: string | null;
  amount_cents: number | null;
  currency: string;
  cadence: string | null;
  confidence: string | null;
  source_provider: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GetHouseholdMoneyTruthParams = {
  householdId: string;
  nowIso?: string;
  next30Iso?: string;
  monthStartIso?: string;
  monthEndIso?: string;
};

export type HouseholdMoneyTruth = {
  household_id: string;
  as_of_iso: string;
  windows: {
    now_iso: string;
    next30_iso: string;
    month_start_iso: string;
    month_end_iso: string;
  };
  accounts: AccountsTruthRow[];
  recent_transactions: TransactionsTruthRow[];
  month_transactions: TransactionsTruthRow[];
  rolling_transactions: TransactionsTruthRow[];
  recurring_bills: RecurringBillsTruthRow[];
  recurring_income: RecurringIncomeTruthRow[];
  goals: MoneyGoalsTruthRow[];
  liabilities: LiabilitiesTruthRow[];
  external_connections: ExternalConnectionsTruthRow[];
  transaction_pattern_confirmations: TransactionPatternConfirmationTruthRow[];
  counts: {
    budget_items: number;
    investment_accounts: number;
  };
};

export type MoneyByCurrencyRow = {
  currency: string;
  cents: number;
};

export type MoneySourceCoverage = {
  provider: string;
  connection_count: number;
  account_count: number;
  transaction_count: number;
};

export type MoneyDataCoverage = {
  included_sources: MoneySourceCoverage[];
  reference_only_sources: MoneySourceCoverage[];
  account_count: number;
  transaction_count: number;
  transaction_window: {
    start_date: string;
    end_date: string;
  } | null;
  latest_transaction_date: string | null;
  current_month_money_in: MoneyByCurrencyRow[];
  current_month_money_out: MoneyByCurrencyRow[];
  confirmed_regular_payment_count: number;
  confirmed_income_pattern_count: number;
  unclear_label_count: number;
  label_quality_note: string;
  has_reference_only_sources: boolean;
  has_demo_sources: boolean;
};
