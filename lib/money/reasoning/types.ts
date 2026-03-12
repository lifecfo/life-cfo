export type MoneyByCurrency = Record<string, number>;

export type AccountsTruthRow = {
  id: string;
  household_id: string;
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
  date: string | null;
  description: string | null;
  merchant: string | null;
  category: string | null;
  pending: boolean | null;
  amount: number | null;
  amount_cents: number | null;
  currency: string | null;
  account_id: string | null;
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
  recurring_bills: RecurringBillsTruthRow[];
  recurring_income: RecurringIncomeTruthRow[];
  goals: MoneyGoalsTruthRow[];
  liabilities: LiabilitiesTruthRow[];
  external_connections: ExternalConnectionsTruthRow[];
  counts: {
    budget_items: number;
    investment_accounts: number;
  };
};