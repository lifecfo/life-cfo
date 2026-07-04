import type {
  AccountsTruthRow,
  CashPlanAccount,
  CashPlanBucket,
  CashPlanReviewItem,
  CashPlanSummary,
  MoneyBucketAllocationTruthRow,
  MoneyBucketTruthRow,
} from "./types";

type DeriveCashPlanParams = {
  householdId: string;
  effectiveAccounts: AccountsTruthRow[];
  knownAccounts: AccountsTruthRow[];
  buckets: MoneyBucketTruthRow[];
  allocations: MoneyBucketAllocationTruthRow[];
};

type AccountClass = "cash" | "credit_debt" | "other";

type AllocationState = {
  allocation: MoneyBucketAllocationTruthRow;
  bucket: MoneyBucketTruthRow | null;
  account: AccountsTruthRow | null;
  valid: boolean;
};

const CASH_TYPES = new Set([
  "cash",
  "depository",
  "checking",
  "cheque",
  "savings",
  "everyday",
]);

const CREDIT_DEBT_TYPES = new Set([
  "credit",
  "credit_card",
  "loan",
  "mortgage",
  "liability",
]);

function normalizeType(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function classifyAccount(account: AccountsTruthRow): AccountClass {
  const values = [normalizeType(account.type), normalizeType(account.subtype)].filter(Boolean);
  if (values.some((value) => CREDIT_DEBT_TYPES.has(value))) return "credit_debt";
  if (values.length > 0 && values.every((value) => CASH_TYPES.has(value))) return "cash";
  return "other";
}

function currency(value: string | null | undefined): string {
  return String(value || "AUD").trim().toUpperCase() || "AUD";
}

function visibleBalance(account: AccountsTruthRow): number {
  const value = account.available_balance_cents ?? account.current_balance_cents ?? 0;
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function accountTypeLabel(account: AccountsTruthRow): string {
  return String(account.subtype || account.type || "Other").trim() || "Other";
}

function review(
  items: CashPlanReviewItem[],
  seen: Set<string>,
  key: string,
  item: Omit<CashPlanReviewItem, "label">
) {
  if (seen.has(key)) return;
  seen.add(key);
  items.push({ ...item, label: "Needs review" });
}

function bucketSummary(
  state: AllocationState,
  backingStatus: CashPlanBucket["backing_status"]
): CashPlanBucket | null {
  const { allocation, bucket, account } = state;
  if (!bucket) return null;
  const allocationType =
    allocation.allocation_type === "whole_account" ||
    allocation.allocation_type === "partial_account"
      ? allocation.allocation_type
      : null;
  if (!allocationType) return null;

  const backedAmount =
    state.valid && account
      ? allocationType === "whole_account"
        ? visibleBalance(account)
        : allocation.amount_cents ?? 0
      : 0;

  return {
    name: bucket.name,
    purpose_type: bucket.purpose_type,
    currency: currency(bucket.currency),
    allocation_type: allocationType,
    backed_amount_cents: backedAmount,
    target_amount_cents: bucket.target_amount_cents,
    target_date: bucket.target_date,
    status: bucket.status,
    account_label: account?.name?.trim() || null,
    backing_status: backingStatus,
  };
}

export function deriveCashPlan(params: DeriveCashPlanParams): CashPlanSummary {
  const bucketsById = new Map(params.buckets.map((bucket) => [bucket.id, bucket]));
  const accountsById = new Map(params.knownAccounts.map((account) => [account.id, account]));
  const effectiveAccountIds = new Set(params.effectiveAccounts.map((account) => account.id));
  const reviewItems: CashPlanReviewItem[] = [];
  const seenReviews = new Set<string>();

  const states: AllocationState[] = params.allocations.map((allocation) => {
    const bucket = bucketsById.get(allocation.bucket_id) ?? null;
    const account = accountsById.get(allocation.account_id) ?? null;
    const state: AllocationState = { allocation, bucket, account, valid: true };
    const validType =
      allocation.allocation_type === "whole_account" ||
      allocation.allocation_type === "partial_account";
    const validAmount =
      (allocation.allocation_type === "whole_account" && allocation.amount_cents === null) ||
      (allocation.allocation_type === "partial_account" &&
        typeof allocation.amount_cents === "number" &&
        allocation.amount_cents > 0);

    if (!validType || !validAmount) {
      state.valid = false;
      review(reviewItems, seenReviews, `invalid:${allocation.id}`, {
        code: "invalid_allocation",
        title: bucket?.name || "Allocation",
        detail: "The allocation type or amount is not valid.",
      });
    }
    if (!bucket) {
      state.valid = false;
      review(reviewItems, seenReviews, `bucket:${allocation.id}`, {
        code: "missing_bucket",
        title: "Bucket not available",
        detail: "An allocation references a bucket that is no longer available.",
      });
    }
    if (!account) {
      state.valid = false;
      review(reviewItems, seenReviews, `account:${allocation.id}`, {
        code: "missing_account",
        title: bucket?.name || "Allocation",
        detail: "The linked account is no longer available.",
      });
    }
    if (
      allocation.household_id !== params.householdId ||
      (bucket && bucket.household_id !== params.householdId) ||
      (account && account.household_id !== params.householdId)
    ) {
      state.valid = false;
      review(reviewItems, seenReviews, `household:${allocation.id}`, {
        code: "household_mismatch",
        title: bucket?.name || "Allocation",
        detail: "The bucket and account are not in the same household view.",
      });
    }
    if (bucket && account && currency(bucket.currency) !== currency(account.currency)) {
      state.valid = false;
      review(reviewItems, seenReviews, `currency:${allocation.id}`, {
        code: "currency_mismatch",
        title: bucket.name,
        detail: "The bucket and account use different currencies.",
      });
    }
    if (bucket?.status === "archived") {
      state.valid = false;
      review(reviewItems, seenReviews, `archived-bucket:${allocation.id}`, {
        code: "archived_bucket",
        title: bucket.name,
        detail: "An archived bucket still has an account allocation.",
      });
    }
    if (account?.archived === true) {
      state.valid = false;
      review(reviewItems, seenReviews, `archived-account:${allocation.id}`, {
        code: "archived_account",
        title: bucket?.name || "Allocation",
        detail: "The linked account is archived.",
      });
    } else if (account && !effectiveAccountIds.has(account.id)) {
      state.valid = false;
      review(reviewItems, seenReviews, `unavailable:${allocation.id}`, {
        code: "unavailable_account",
        title: bucket?.name || "Allocation",
        detail: "The linked account is not included in the current money view.",
      });
    }
    if (account && classifyAccount(account) !== "cash") {
      state.valid = false;
      review(reviewItems, seenReviews, `non-cash:${allocation.id}`, {
        code: "non_cash_account",
        title: bucket?.name || "Allocation",
        detail: "Only clearly cash-like accounts can back Cash Plan buckets.",
      });
    }

    return state;
  });

  const statesByAccount = new Map<string, AllocationState[]>();
  for (const state of states) {
    const rows = statesByAccount.get(state.allocation.account_id) ?? [];
    rows.push(state);
    statesByAccount.set(state.allocation.account_id, rows);
  }

  for (const accountStates of statesByAccount.values()) {
    const account = accountStates[0]?.account;
    if (!account || account.archived || !effectiveAccountIds.has(account.id)) continue;
    if (classifyAccount(account) !== "cash") continue;
    const whole = accountStates.filter(
      (state) => state.allocation.allocation_type === "whole_account"
    );
    const partial = accountStates.filter(
      (state) => state.allocation.allocation_type === "partial_account"
    );

    if (whole.length > 1) {
      for (const state of accountStates) state.valid = false;
      review(reviewItems, seenReviews, `multiple-whole:${account.id}`, {
        code: "multiple_whole_allocations",
        title: account.name || "Cash account",
        detail: "This account is assigned in full to more than one bucket.",
      });
    }
    if (whole.length > 0 && partial.length > 0) {
      for (const state of accountStates) state.valid = false;
      review(reviewItems, seenReviews, `whole-partial:${account.id}`, {
        code: "whole_partial_conflict",
        title: account.name || "Cash account",
        detail: "This account has both whole-account and part-account allocations.",
      });
    }
    const partialTotal = partial.reduce(
      (sum, state) => sum + Math.max(0, state.allocation.amount_cents ?? 0),
      0
    );
    if (partialTotal > visibleBalance(account)) {
      for (const state of partial) state.valid = false;
      review(reviewItems, seenReviews, `over:${account.id}`, {
        code: "partial_over_allocation",
        title: account.name || "Cash account",
        detail: "Part-account allocations are higher than the visible eligible balance.",
      });
    }
  }

  const accountBackedBuckets: CashPlanBucket[] = [];
  const partAccountBuckets: CashPlanBucket[] = [];
  for (const state of states) {
    if (state.allocation.allocation_type === "whole_account") {
      const summary = bucketSummary(
        state,
        state.valid ? "account_backed" : "needs_review"
      );
      if (summary) accountBackedBuckets.push(summary);
    }
    if (state.allocation.allocation_type === "partial_account") {
      const summary = bucketSummary(
        state,
        state.valid ? "part_account" : "needs_review"
      );
      if (summary) partAccountBuckets.push(summary);
    }
  }

  const allocatedBucketIds = new Set(params.allocations.map((row) => row.bucket_id));
  const trackedOnlyBuckets: CashPlanBucket[] = params.buckets
    .filter((bucket) => bucket.status !== "archived" && !allocatedBucketIds.has(bucket.id))
    .map((bucket) => ({
      name: bucket.name,
      purpose_type: bucket.purpose_type,
      currency: currency(bucket.currency),
      allocation_type: null,
      backed_amount_cents: 0,
      target_amount_cents: bucket.target_amount_cents,
      target_date: bucket.target_date,
      status: bucket.status,
      account_label: null,
      backing_status: "tracked_only",
    }));

  const allocationAccountIds = new Set(params.allocations.map((row) => row.account_id));
  const eligibleAccounts = params.effectiveAccounts.filter(
    (account) => !account.archived && classifyAccount(account) === "cash"
  );
  const accountsWithoutAllocations: CashPlanAccount[] = eligibleAccounts
    .filter((account) => !allocationAccountIds.has(account.id))
    .map((account) => ({
      name: account.name?.trim() || "Cash account",
      currency: currency(account.currency),
      visible_balance_cents: visibleBalance(account),
      account_type: accountTypeLabel(account),
    }));

  const eligibleTotals = new Map<string, number>();
  for (const account of eligibleAccounts) {
    const accountCurrency = currency(account.currency);
    eligibleTotals.set(
      accountCurrency,
      (eligibleTotals.get(accountCurrency) ?? 0) + visibleBalance(account)
    );
  }
  const eligibleCashByCurrency = [...eligibleTotals.entries()]
    .map(([rowCurrency, cents]) => ({ currency: rowCurrency, cents }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const currencies = [...new Set([
    ...eligibleCashByCurrency.map((row) => row.currency),
    ...params.buckets
      .filter((bucket) => bucket.status !== "archived")
      .map((bucket) => currency(bucket.currency)),
  ])].sort();

  return {
    version: 1,
    review_message: "For review only. Nothing has moved.",
    currencies,
    mixed_currencies: currencies.length > 1,
    eligible_cash_by_currency: eligibleCashByCurrency,
    account_backed_buckets: accountBackedBuckets,
    part_account_buckets: partAccountBuckets,
    tracked_only_buckets: trackedOnlyBuckets,
    accounts_without_allocations: accountsWithoutAllocations,
    review_items: reviewItems,
    flexible_cash_calculated: false,
  };
}
