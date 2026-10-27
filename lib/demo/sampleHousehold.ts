/**
 * In-memory example household. Never write these rows, never export them,
 * and never send them to an AI provider.
 */

export type SampleCadence = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export type SampleItem = {
  id: string;
  title: string;
  kind: "bill" | "renewal" | "income" | "receipt";
  category: string;
  amount_cents: number;
  cadence: SampleCadence;
  due_on: string;
  owner: string;
};

export type SampleTxn = {
  date: string;
  description: string;
  category: string;
  amount_cents: number;
};

export type SampleDecision = {
  id: string;
  title: string;
  review_on: string;
  note: string;
};

export type SampleHousehold = {
  people: { name: string; role: string }[];
  pets: { name: string; kind: string }[];
  items: SampleItem[];
  transactions: SampleTxn[];
  decisions: SampleDecision[];
};

function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shift(base: Date, days: number): string {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return iso(next);
}

export function monthlyCents(amount: number, cadence: SampleCadence): number {
  switch (cadence) {
    case "weekly":
      return Math.round((amount * 52) / 12);
    case "fortnightly":
      return Math.round((amount * 26) / 12);
    case "monthly":
      return amount;
    case "quarterly":
      return Math.round(amount / 3);
    case "yearly":
      return Math.round(amount / 12);
  }
}

export function buildSampleHousehold(today = new Date()): SampleHousehold {
  const items: SampleItem[] = [
    { id: "s-mortgage", title: "Home loan", kind: "bill", category: "Housing", amount_cents: 248000, cadence: "monthly", due_on: shift(today, 6), owner: "Jade" },
    { id: "s-power", title: "Electricity", kind: "bill", category: "Utilities", amount_cents: 18600, cadence: "quarterly", due_on: shift(today, 11), owner: "Jordan" },
    { id: "s-net", title: "Internet", kind: "bill", category: "Utilities", amount_cents: 8900, cadence: "monthly", due_on: shift(today, 18), owner: "Jade" },
    { id: "s-phone-a", title: "Jade mobile", kind: "bill", category: "Utilities", amount_cents: 4500, cadence: "monthly", due_on: shift(today, 4), owner: "Jade" },
    { id: "s-phone-j", title: "Jordan mobile", kind: "bill", category: "Utilities", amount_cents: 3900, cadence: "monthly", due_on: shift(today, 21), owner: "Jordan" },
    { id: "s-rego", title: "Car registration", kind: "renewal", category: "Transport", amount_cents: 74200, cadence: "yearly", due_on: shift(today, 120), owner: "Jade" },
    { id: "s-car-ins", title: "Car insurance", kind: "bill", category: "Transport", amount_cents: 12800, cadence: "monthly", due_on: shift(today, 40), owner: "Jordan" },
    { id: "s-health", title: "Health insurance", kind: "bill", category: "Health", amount_cents: 31200, cadence: "monthly", due_on: shift(today, 50), owner: "Jade" },
    { id: "s-rates", title: "Council rates", kind: "renewal", category: "Housing", amount_cents: 168000, cadence: "yearly", due_on: shift(today, 200), owner: "Jordan" },
    { id: "s-care", title: "Childcare", kind: "bill", category: "Care", amount_cents: 42000, cadence: "fortnightly", due_on: shift(today, 9), owner: "Jordan" },
    { id: "s-pet", title: "Pet insurance", kind: "bill", category: "Pets", amount_cents: 5200, cadence: "monthly", due_on: shift(today, 25), owner: "Jade" },
    { id: "s-stream", title: "Streaming", kind: "bill", category: "Entertainment", amount_cents: 1700, cadence: "monthly", due_on: shift(today, 2), owner: "Jade" },
    { id: "s-pay-a", title: "Jade pay", kind: "income", category: "Pay", amount_cents: 284000, cadence: "fortnightly", due_on: shift(today, 5), owner: "Jade" },
    { id: "s-pay-j", title: "Jordan pay", kind: "income", category: "Pay", amount_cents: 520000, cadence: "monthly", due_on: shift(today, 14), owner: "Jordan" },
    { id: "s-woolies", title: "Woolworths", kind: "receipt", category: "Groceries", amount_cents: 14620, cadence: "weekly", due_on: shift(today, -2), owner: "Jordan" },
    { id: "s-chemist", title: "Chemist", kind: "receipt", category: "Health", amount_cents: 2840, cadence: "monthly", due_on: shift(today, -8), owner: "Jade" },
    { id: "s-vet", title: "Vet visit", kind: "receipt", category: "Pets", amount_cents: 9500, cadence: "yearly", due_on: shift(today, -20), owner: "Jordan" },
  ];

  // 2 years, not just 92 days -- the zoomable timeline's Quarter/Year
  // granularity needs enough history that past buckets aren't all zero in
  // sample mode (see lib/money/reasoning/deriveZoomTimeline.ts).
  const transactions: SampleTxn[] = [];
  for (let daysAgo = 0; daysAgo < 730; daysAgo += 1) {
    const when = new Date(today);
    when.setDate(today.getDate() - daysAgo);
    const date = iso(when);
    if (when.getDay() === 6) {
      transactions.push({ date, description: "Woolworths", category: "Groceries", amount_cents: -(13800 + (daysAgo % 5) * 420) });
    }
    if (daysAgo % 14 === 0) {
      transactions.push({ date, description: "Pay from employer", category: "Income", amount_cents: 284000 });
    }
    if (daysAgo % 30 === 2) {
      transactions.push({ date, description: "Home loan", category: "Housing", amount_cents: -248000 });
      transactions.push({ date, description: "Pay from employer", category: "Income", amount_cents: 520000 });
    }
    if (daysAgo % 30 === 8) {
      transactions.push({ date, description: "Childcare", category: "Care", amount_cents: -42000 });
      transactions.push({ date, description: "Internet", category: "Utilities", amount_cents: -8900 });
    }
    if (daysAgo % 30 === 16) {
      transactions.push({ date, description: "Health insurance", category: "Health", amount_cents: -31200 });
      transactions.push({ date, description: "Car insurance", category: "Transport", amount_cents: -12800 });
      transactions.push({ date, description: "Pet insurance", category: "Pets", amount_cents: -5200 });
    }
    if (daysAgo % 90 === 20) {
      transactions.push({ date, description: "Electricity", category: "Utilities", amount_cents: -18600 });
    }
  }

  return {
    people: [
      { name: "Jordan", role: "Adult" },
      { name: "Jade", role: "Adult" },
      { name: "Mia", role: "Child" },
    ],
    pets: [{ name: "Pepper", kind: "Dog" }],
    items,
    transactions,
    decisions: [
      {
        id: "s-care-days",
        title: "Childcare days for next year",
        review_on: shift(today, 45),
        note: "Factors listed: current days, school start, and the fee.",
      },
      {
        id: "s-car",
        title: "Keep the car or replace it",
        review_on: shift(today, 80),
        note: "Factors listed: registration, insurance, and repair notes.",
      },
    ],
  };
}

export const SAMPLE_HOUSEHOLD = buildSampleHousehold();
