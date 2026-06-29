import type { TransactionOutflowSummary } from "./deriveTransactionOutflows";
import type {
  HouseholdMoneyTruth,
  MoneyDataCoverage,
  MoneyFlowReadiness,
  MoneySetupNextStep,
  MoneySetupStatus,
  MoneySetupStatusCode,
} from "./types";

type DeriveMoneySetupStatusParams = {
  truth: HouseholdMoneyTruth;
  dataCoverage: MoneyDataCoverage;
  transactionOutflows: TransactionOutflowSummary;
};

const STATUS_LABELS: Record<MoneySetupStatusCode, string> = {
  ready: "Useful now",
  needs_review: "Needs review",
  needs_setup: "Needs setup",
  refresh_needed: "Refresh needed",
};

function flowReadiness(
  status: MoneySetupStatusCode,
  summary: string,
  href: string
): MoneyFlowReadiness {
  return {
    status,
    label: STATUS_LABELS[status],
    summary,
    href,
  };
}

function pendingPatternKeys(params: DeriveMoneySetupStatusParams) {
  const reviewed = new Set(
    params.truth.transaction_pattern_confirmations.map(
      (confirmation) => confirmation.pattern_key
    )
  );
  const pendingPayments = params.transactionOutflows.likely_regular_outflows.filter(
    (pattern) => !reviewed.has(pattern.pattern_key)
  );
  const pendingIncome = params.transactionOutflows.likely_income.filter(
    (pattern) => !reviewed.has(pattern.pattern_key)
  );
  return { pendingPayments, pendingIncome };
}

function deriveNextStep(input: {
  usableNow: boolean;
  refreshNeeded: boolean;
  pendingReviewCount: number;
  confirmedRegularPaymentCount: number;
  confirmedIncomeCount: number;
  formalBillCount: number;
  formalIncomeCount: number;
  goalCount: number;
}): MoneySetupNextStep | null {
  if (input.refreshNeeded) {
    return {
      key: "refresh_sources",
      flow: null,
      title: "Refresh a money source",
      detail: "A linked source needs refreshing before it can lead this view.",
      action_label: "Manage sources",
      href: "/connections",
      optional: false,
    };
  }
  if (!input.usableNow) {
    return {
      key: "add_source",
      flow: null,
      title: "Add a money source",
      detail: "Add balances or transactions to build the household money picture.",
      action_label: "Add a source",
      href: "/connections",
      optional: false,
    };
  }
  if (input.pendingReviewCount > 0) {
    return {
      key: "review_patterns",
      flow: "out",
      title: "Review one money pattern",
      detail: "A quick review will make future summaries clearer.",
      action_label: "Review patterns",
      href: "/money#money-review",
      optional: true,
    };
  }
  if (input.formalBillCount === 0 && input.confirmedRegularPaymentCount > 0) {
    return {
      key: "add_bill_dates",
      flow: "planned",
      title: "Add bill dates",
      detail: "Add bill dates when you want a clearer forward view.",
      action_label: "Add bill dates",
      href: "/bills",
      optional: true,
    };
  }
  if (input.formalIncomeCount === 0 && input.confirmedIncomeCount > 0) {
    return {
      key: "add_income_timing",
      flow: "in",
      title: "Add income timing",
      detail: "Add income timing when you want more accurate planning.",
      action_label: "Add income timing",
      href: "/income",
      optional: true,
    };
  }
  if (input.goalCount === 0) {
    return {
      key: "add_goal",
      flow: "planned",
      title: "Add a goal",
      detail: "Add a goal when you want Planned to track something specific.",
      action_label: "Add a goal",
      href: "/money/goals",
      optional: true,
    };
  }
  return null;
}

export function deriveMoneySetupStatus(
  params: DeriveMoneySetupStatusParams
): MoneySetupStatus {
  const { truth, dataCoverage } = params;
  const usableNow =
    dataCoverage.account_count > 0 || dataCoverage.transaction_count > 0;
  const refreshNeeded = !usableNow && dataCoverage.has_reference_only_sources;
  const { pendingPayments, pendingIncome } = pendingPatternKeys(params);
  const pendingReviewCount = pendingPayments.length + pendingIncome.length;
  const formalIncomeCount = truth.recurring_income.length;
  const formalBillCount = truth.recurring_bills.length;
  const goalCount = truth.goals.length;
  const confirmedIncomeCount = dataCoverage.confirmed_income_pattern_count;
  const confirmedRegularPaymentCount =
    dataCoverage.confirmed_regular_payment_count;
  const hasMoneyIn = dataCoverage.current_month_money_in.some(
    (row) => row.cents > 0
  );
  const hasMoneyOut = dataCoverage.current_month_money_out.some(
    (row) => row.cents > 0
  );

  const unavailableStatus: MoneySetupStatusCode = refreshNeeded
    ? "refresh_needed"
    : "needs_setup";
  const flows = {
    in: !usableNow
      ? flowReadiness(
          unavailableStatus,
          refreshNeeded
            ? "Refresh a source to bring money in back into view."
            : "Add a source to bring incoming money into view.",
          "/money/in"
        )
      : pendingIncome.length > 0
        ? flowReadiness(
            "needs_review",
            "Review an income pattern to make future summaries clearer.",
            "/money/in"
          )
        : hasMoneyIn || confirmedIncomeCount > 0 || formalIncomeCount > 0
          ? flowReadiness(
              "ready",
              "Money in is already useful from transactions and confirmed patterns.",
              "/money/in"
            )
          : flowReadiness(
              "needs_setup",
              "No money in is visible yet.",
              "/money/in"
            ),
    out: !usableNow
      ? flowReadiness(
          unavailableStatus,
          refreshNeeded
            ? "Refresh a source to bring money out back into view."
            : "Add a source to bring money out into view.",
          "/money/out"
        )
      : pendingPayments.length > 0
        ? flowReadiness(
            "needs_review",
            "Review a regular payment to make future summaries clearer.",
            "/money/out"
          )
        : hasMoneyOut || confirmedRegularPaymentCount > 0 || formalBillCount > 0
          ? flowReadiness(
              "ready",
              "Money out is already useful from transactions and confirmed payments.",
              "/money/out"
            )
          : flowReadiness(
              "needs_setup",
              "No money out is visible yet.",
              "/money/out"
            ),
    saved: !usableNow
      ? flowReadiness(
          unavailableStatus,
          refreshNeeded
            ? "Refresh a source to bring balances back into view."
            : "Add an account to bring balances into view.",
          "/money/saved"
        )
      : dataCoverage.account_count > 0
        ? flowReadiness(
            "ready",
            "Current account balances support this view.",
            "/money/saved"
          )
        : flowReadiness(
            "needs_setup",
            "Add an account balance to build the Saved view.",
            "/money/saved"
          ),
    planned: !usableNow
      ? flowReadiness(
          unavailableStatus,
          refreshNeeded
            ? "Refresh a source to bring planning context back into view."
            : "Add a source to start building planning context.",
          "/money/planned"
        )
      : goalCount > 0 ||
          confirmedRegularPaymentCount > 0 ||
          formalBillCount > 0 ||
          formalIncomeCount > 0
        ? flowReadiness(
            "ready",
            "Goals and regular timing already support this view.",
            "/money/planned"
          )
        : flowReadiness(
            "needs_setup",
            "Add a goal or confirm a regular payment to build this view.",
            "/money/planned"
          ),
  } satisfies MoneySetupStatus["flows"];

  const status: MoneySetupStatusCode = refreshNeeded
    ? "refresh_needed"
    : !usableNow
      ? "needs_setup"
      : pendingReviewCount > 0
        ? "needs_review"
        : "ready";
  const summary =
    status === "ready"
      ? "Your money picture is useful now. Transaction activity is already useful; setup adds clearer timing for planning."
      : status === "needs_review"
        ? "Your money picture is useful now. A quick review will make future summaries clearer."
        : status === "refresh_needed"
          ? "A linked source needs refreshing before it can lead this view."
          : "Add a money source to bring household balances and transactions into view.";

  return {
    version: 1,
    status,
    usable_now: usableNow,
    label: STATUS_LABELS[status],
    summary,
    next_step: deriveNextStep({
      usableNow,
      refreshNeeded,
      pendingReviewCount,
      confirmedRegularPaymentCount,
      confirmedIncomeCount,
      formalBillCount,
      formalIncomeCount,
      goalCount,
    }),
    flows,
    evidence: {
      account_count: dataCoverage.account_count,
      transaction_count: dataCoverage.transaction_count,
      confirmed_income_count: confirmedIncomeCount,
      confirmed_regular_payment_count: confirmedRegularPaymentCount,
      formal_income_count: formalIncomeCount,
      formal_bill_count: formalBillCount,
      goal_count: goalCount,
      pending_review_count: pendingReviewCount,
    },
  };
}
