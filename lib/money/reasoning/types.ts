export type MoneyCadence =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "annual"
  | "yearly";

export type AccountTruth = {
  id: string;
  current_balance_cents: number;
  available_balance_cents?: number | null;
  currency?: string | null;
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
};

export type HouseholdMoneyTruth = {
  asOf: string; // ISO date (YYYY-MM-DD) used as deterministic clock
  accounts: AccountTruth[];
  transactions: TransactionTruth[];
  recurringBills: RecurringBillTruth[];
  recurringIncome: RecurringIncomeTruth[];
  connections?: ConnectionTruth[];
};
