import type {
  MoneyTimelineCurrency,
  MoneyTimelineSummary,
  MoneyYearAmount,
  MoneyYearSummary,
} from "./types";

function amountForCurrency(rows: MoneyYearAmount[], currency: string): number {
  return rows.find((row) => row.currency === currency)?.cents ?? 0;
}

function currencyTimeline(
  year: MoneyYearSummary,
  currency: string
): MoneyTimelineCurrency {
  const heavierMonths = new Set(
    year.seasons.find((season) => season.currency === currency)?.heavier_months ?? []
  );
  const months = year.months.map((month) => {
    const knownMoneyInCents = amountForCurrency(month.expected_income, currency);
    const knownMoneyOutCents = amountForCurrency(month.expected_bills, currency);
    const differenceCents = amountForCurrency(month.difference, currency);
    const closerLookReasons: Array<
      "bills_above_income" | "heavier_scheduled_month"
    > = [];
    if (differenceCents < 0) closerLookReasons.push("bills_above_income");
    if (heavierMonths.has(month.month_key)) {
      closerLookReasons.push("heavier_scheduled_month");
    }
    const largestPayment = month.larger_scheduled_payments.find(
      (payment) => payment.currency === currency
    );
    return {
      month_key: month.month_key,
      label: month.label,
      known_money_in_cents: knownMoneyInCents,
      known_money_out_cents: knownMoneyOutCents,
      difference_cents: differenceCents,
      needs_closer_look: closerLookReasons.length > 0,
      closer_look_reasons: closerLookReasons,
      largest_payment: largestPayment
        ? { name: largestPayment.name, amount_cents: largestPayment.amount_cents }
        : null,
    };
  });
  const values = months.flatMap((month) => [
    month.known_money_in_cents,
    month.known_money_out_cents,
    month.difference_cents,
    0,
  ]);

  return {
    currency,
    scale_min_cents: Math.min(...values),
    scale_max_cents: Math.max(...values),
    months,
  };
}

export function deriveMoneyTimeline(year: MoneyYearSummary): MoneyTimelineSummary {
  const currencies = year.currencies.map((currency) =>
    currencyTimeline(year, currency)
  );
  const firstShortfall = currencies
    .flatMap((group) =>
      group.months
        .filter((month) => month.difference_cents < 0)
        .map((month) => ({ ...month, currency: group.currency }))
    )
    .sort((left, right) => left.month_key.localeCompare(right.month_key))[0];
  const commentary: string[] = [];

  if (firstShortfall) {
    commentary.push(
      `${firstShortfall.label} has more scheduled money going out than coming in (${firstShortfall.currency}).`
    );
  } else if (currencies.length) {
    commentary.push(
      "The schedules currently added do not show a month with more money going out than coming in."
    );
  }
  if (year.timing_needed.length) {
    commentary.push(
      `${year.timing_needed.length} regular ${year.timing_needed.length === 1 ? "item needs" : "items need"} timing before ${year.timing_needed.length === 1 ? "it" : "they"} can appear here.`
    );
  }
  commentary.push("This view only includes schedules currently added.");

  return {
    version: 1,
    basis: "current_schedules",
    window_start: year.window_start,
    window_end: year.window_end,
    currencies,
    timing_needed_count: year.timing_needed.length,
    commentary: commentary.slice(0, 3),
  };
}
