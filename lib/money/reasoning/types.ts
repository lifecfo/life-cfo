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
  subtype: string | null;
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
  notes: string | null;
  is_primary: boolean | null;
  updated_at: string | null;
};

export type MoneyBucketSummary = {
  title: string;
  currency: string;
  current_cents: number;
  target_cents: number;
  still_needed_cents: number;
  progress_percent: number;
  target_month: string | null;
  is_primary: boolean;
  notes: string | null;
};

export type MoneyBucketsSummary = {
  version: 1;
  buckets: MoneyBucketSummary[];
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

export type MoneySetupStatusCode =
  | "ready"
  | "needs_review"
  | "needs_setup"
  | "refresh_needed";

export type MoneySetupFlow = "in" | "out" | "saved" | "planned";

export type MoneyFlowReadiness = {
  status: MoneySetupStatusCode;
  label: string;
  summary: string;
  href: string;
};

export type MoneySetupNextStep = {
  key: string;
  flow: MoneySetupFlow | null;
  title: string;
  detail: string;
  action_label: string;
  href: string;
  optional: boolean;
};

export type MoneySetupStatus = {
  version: 1;
  status: MoneySetupStatusCode;
  usable_now: boolean;
  label: string;
  summary: string;
  next_step: MoneySetupNextStep | null;
  flows: Record<MoneySetupFlow, MoneyFlowReadiness>;
  evidence: {
    account_count: number;
    transaction_count: number;
    confirmed_income_count: number;
    confirmed_regular_payment_count: number;
    formal_income_count: number;
    formal_bill_count: number;
    goal_count: number;
    pending_review_count: number;
  };
};

export type BreathingRoomSummary = {
  version: 1;
  status: "okay" | "watch" | "tight" | "closer_look";
  label: string;
  reasons: string[];
  ask_prompt: string;
};

export type MoneyPrimaryGoalSummary = {
  title: string;
  currency: string;
  current_cents: number;
  target_cents: number;
  progress_percent: number;
};

export type MoneyHomeUpcomingBill = {
  name: string;
  amount_cents: number;
  currency: string;
  next_due_at: string | null;
  days_until_due: number | null;
};

export type MoneyHomeSummary = {
  version: 1;
  currency: string;
  money_in_cents: number;
  available_cash_cents: number;
  planned_expenses_cents: number;
  planned_expenses_is_estimate: boolean;
  planned_expenses_basis: "scheduled_bills" | "confirmed_patterns" | "none";
  upcoming_bills: MoneyHomeUpcomingBill[];
  grocery_estimate_cents: number | null;
  primary_goal: MoneyPrimaryGoalSummary | null;
  likely_breathing_room_cents: number;
};

export type MoneyYearAmount = {
  currency: string;
  cents: number;
};

export type MoneyYearScheduledOccurrence = {
  name: string;
  kind: "income" | "bill";
  currency: string;
  amount_cents: number;
  expected_at: string;
  month_key: string;
  cadence: string;
};

export type MoneyYearMonthSummary = {
  month_key: string;
  label: string;
  expected_income: MoneyYearAmount[];
  expected_bills: MoneyYearAmount[];
  difference: MoneyYearAmount[];
  larger_scheduled_payments: MoneyYearScheduledOccurrence[];
};

export type MoneyYearLargerPayment = MoneyYearScheduledOccurrence & {
  occurrence_count: number;
};

export type MoneyYearGoalSummary = MoneyBucketSummary;

export type MoneyYearTimingNeededItem = {
  name: string;
  kind: "income" | "bill";
  currency: string;
  amount_cents: number;
  cadence: string;
  reason: "missing_date" | "unsupported_cadence";
};

export type MoneyYearSeasonSummary = {
  currency: string;
  status: "fairly_even" | "varied";
  median_planned_bills_cents: number;
  heavier_months: string[];
  quieter_months: string[];
};

export type MoneyYearSummary = {
  version: 1;
  window_start: string;
  window_end: string;
  currencies: string[];
  mixed_currencies: boolean;
  expected_income_total: MoneyYearAmount[];
  expected_bills_total: MoneyYearAmount[];
  months: MoneyYearMonthSummary[];
  larger_scheduled_payments: MoneyYearLargerPayment[];
  goals: MoneyYearGoalSummary[];
  timing_needed: MoneyYearTimingNeededItem[];
  seasons: MoneyYearSeasonSummary[];
  months_worth_closer_look: number;
};

export type MoneyTimelineMonth = {
  month_key: string;
  label: string;
  known_money_in_cents: number;
  known_money_out_cents: number;
  difference_cents: number;
  needs_closer_look: boolean;
  closer_look_reasons: Array<"bills_above_income" | "heavier_scheduled_month">;
  largest_payment: {
    name: string;
    amount_cents: number;
  } | null;
};

export type MoneyTimelineCurrency = {
  currency: string;
  scale_min_cents: number;
  scale_max_cents: number;
  months: MoneyTimelineMonth[];
};

export type MoneyTimelineSummary = {
  version: 1;
  basis: "current_schedules";
  window_start: string;
  window_end: string;
  currencies: MoneyTimelineCurrency[];
  timing_needed_count: number;
  commentary: string[];
};

export type MoneyMapAccountItem = {
  name: string;
  balance_cents: number;
  currency: string;
  account_type: string;
  source_label: "Demo data" | "Manual" | "Connected" | "Imported";
};

export type MoneyMapAccountGroup = {
  key: "cash" | "credit_debt" | "other";
  label: string;
  accounts: MoneyMapAccountItem[];
  totals_by_currency: MoneyByCurrencyRow[];
};

export type MoneyMapTrackedPurpose = MoneyBucketSummary & {
  status_label: "Tracked separately";
};

export type MoneyMapPlannedItem = {
  name: string;
  amount_cents: number;
  currency: string;
  cadence: string;
  next_at: string | null;
  kind: "income" | "bill";
  source: "schedule" | "confirmed_pattern";
};

export type MoneyMapUpcomingItem = {
  name: string;
  amount_cents: number | null;
  currency: string | null;
  expected_at: string | null;
  kind: "bill" | "larger_payment" | "everyday_estimate";
  detail: string;
};

export type MoneyMapReviewItem = {
  key: string;
  label: "Needs timing" | "Tracked separately" | "Not linked yet" | "Worth keeping visible" | "For review";
  title: string;
  detail: string;
  href: string | null;
};

export type MoneyMapSummary = {
  version: 1;
  mixed_currencies: boolean;
  where_money_is: {
    groups: MoneyMapAccountGroup[];
  };
  tracked_purposes: {
    items: MoneyMapTrackedPurpose[];
  };
  planned: {
    scheduled: MoneyMapPlannedItem[];
    confirmed_patterns: MoneyMapPlannedItem[];
  };
  coming_up: {
    items: MoneyMapUpcomingItem[];
  };
  review: {
    items: MoneyMapReviewItem[];
  };
};

export type MoneyBucketTruthRow = {
  id: string;
  household_id: string;
  name: string;
  purpose_type: string;
  currency: string;
  target_amount_cents: number | null;
  target_date: string | null;
  priority: number;
  status: string;
};

export type MoneyBucketAllocationTruthRow = {
  id: string;
  household_id: string;
  bucket_id: string;
  account_id: string;
  allocation_type: string;
  amount_cents: number | null;
};

export type CashPlanBackingStatus =
  | "account_backed"
  | "part_account"
  | "tracked_only"
  | "needs_review";

export type CashPlanBucket = {
  name: string;
  purpose_type: string;
  currency: string;
  allocation_type: "whole_account" | "partial_account" | null;
  backed_amount_cents: number;
  target_amount_cents: number | null;
  target_date: string | null;
  status: string;
  account_label: string | null;
  backing_status: CashPlanBackingStatus;
};

export type CashPlanAccount = {
  name: string;
  currency: string;
  visible_balance_cents: number;
  account_type: string;
};

export type CashPlanReviewItem = {
  code:
    | "missing_bucket"
    | "missing_account"
    | "household_mismatch"
    | "currency_mismatch"
    | "archived_account"
    | "unavailable_account"
    | "archived_bucket"
    | "non_cash_account"
    | "multiple_whole_allocations"
    | "whole_partial_conflict"
    | "partial_over_allocation"
    | "invalid_allocation";
  label: "Needs review";
  title: string;
  detail: string;
};

export type CashPlanSummary = {
  version: 1;
  review_message: "For review only. Nothing has moved.";
  currencies: string[];
  mixed_currencies: boolean;
  eligible_cash_by_currency: MoneyByCurrencyRow[];
  account_backed_buckets: CashPlanBucket[];
  part_account_buckets: CashPlanBucket[];
  tracked_only_buckets: CashPlanBucket[];
  accounts_without_allocations: CashPlanAccount[];
  review_items: CashPlanReviewItem[];
  flexible_cash_calculated: false;
};
