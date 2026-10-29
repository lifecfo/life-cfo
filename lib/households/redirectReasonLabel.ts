// lib/households/redirectReasonLabel.ts

const REDIRECT_REASON_LABELS: Array<[prefix: string, label: string]> = [
  ["/lifecfo-home", "Home"],
  ["/home", "Home"],
  ["/bills", "Bills"],
  ["/income", "Income"],
  ["/budget", "Budget"],
  ["/money/goals", "Goals"],
  ["/spending", "Spending"],
  ["/money/out", "Money out"],
  ["/transactions", "Transactions"],
  ["/money/year", "Year ahead"],
  ["/decisions", "Decision notes"],
  ["/documents", "Documents"],
];

/** Human label for the tab a user was bounced from when they have no household yet. */
export function redirectReasonLabel(pathname: string): string {
  for (const [prefix, label] of REDIRECT_REASON_LABELS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return label;
  }
  return "this page";
}
