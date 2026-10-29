// Fixture-driven render regression coverage for PageGlance's Add-things
// glance widgets. renderToStaticMarkup runs a single synchronous pass with
// no effects (same as Next's SSR pass), so it exercises these pure,
// prop-driven view components without a browser, a live Supabase
// connection, or any auth -- entirely local and offline.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BillsView, BudgetView, IncomeView } from "./PageGlance";
import type { SampleItem } from "@/lib/demo/sampleHousehold";

function item(overrides: Partial<SampleItem>): SampleItem {
  return {
    id: "item-1",
    title: "Council rates",
    kind: "bill",
    category: "Housing",
    amount_cents: 10000,
    cadence: "monthly",
    due_on: "2026-11-05",
    owner: "Household",
    ...overrides,
  };
}

type ItemsView = (props: { items: SampleItem[] }) => ReturnType<typeof createElement>;

function render(view: ItemsView, props: { items: SampleItem[] }) {
  return renderToStaticMarkup(createElement(view, props));
}

test("BillsView shows the entered amount and date, with no 'one-off' wording and no hardcoded cadence placeholder", () => {
  const html = render(BillsView, { items: [item({ due_on: "2026-11-05" })] });
  assert.match(html, /Council rates/);
  assert.match(html, /\$100/); // entered amount, as formatted by aud()
  assert.match(html, /5 Nov/); // the real due_on date
  assert.doesNotMatch(html, /one-off/i);
  assert.match(html, /Add things/);
});

test("BillsView omits the date badge entirely when no date was entered, rather than showing the fabricated 'monthly' cadence", () => {
  const html = render(BillsView, { items: [item({ due_on: "" })] });
  assert.match(html, /Council rates/);
  // The old behaviour fell back to item.cadence (always "monthly" from
  // fromPicture(), never a real recorded value) when due_on was empty.
  assert.doesNotMatch(html, />monthly</i);
});

test("BillsView's empty state does not claim items are one-off", () => {
  const html = render(BillsView, { items: [] });
  assert.doesNotMatch(html, /one-off/i);
  assert.match(html, /Add things/);
});

test("IncomeView shows entered amount and date with no monthly restatement and no 'one-off' wording", () => {
  const html = render(IncomeView, {
    items: [item({ id: "i1", kind: "income", title: "Side gig", amount_cents: 30000, cadence: "fortnightly", due_on: "2026-11-03" })],
  });
  assert.match(html, /Side gig/);
  assert.match(html, /\$300/); // the entered amount, unchanged -- NOT a monthly-equivalent figure
  assert.match(html, /3 Nov/);
  assert.doesNotMatch(html, /one-off/i);
  assert.doesNotMatch(html, /fortnightly/i); // no cadence restated or displayed at all
});

test("IncomeView omits the date for an item with no due_on, without inventing one", () => {
  const html = render(IncomeView, { items: [item({ id: "i1", kind: "income", title: "Gift", due_on: "" })] });
  assert.match(html, /Gift/);
  assert.doesNotMatch(html, />monthly</i);
});

test("BudgetView lists income and bill items separately, as entered, with no combined total or difference figure", () => {
  const html = render(BudgetView, {
    items: [
      item({ id: "i1", kind: "income", title: "Side gig", amount_cents: 30000, due_on: "2026-11-03" }),
      item({ id: "b1", kind: "bill", title: "Council rates", amount_cents: 10000, due_on: "2026-11-05" }),
    ],
  });
  assert.match(html, /Side gig/);
  assert.match(html, /Council rates/);
  // Regression for the removed combined "Expected in minus expected out"
  // figure, which read as a second, competing budget total.
  assert.doesNotMatch(html, /Difference/i);
  assert.doesNotMatch(html, /one-off/i);
  assert.match(html, /Add things/);
});

test("BudgetView's empty state covers both income and bills without claiming a recurring total", () => {
  const html = render(BudgetView, { items: [] });
  assert.doesNotMatch(html, /one-off/i);
  assert.doesNotMatch(html, /Difference/i);
  assert.match(html, /Add things/);
});

test("BudgetView only renders the income section when an income item exists, and vice versa for bills", () => {
  const incomeOnly = render(BudgetView, { items: [item({ id: "i1", kind: "income", title: "Side gig" })] });
  assert.match(incomeOnly, /Income entered/);
  assert.doesNotMatch(incomeOnly, /Bills &amp; renewals entered|Bills &#x26; renewals entered|Bills &#38; renewals entered/);

  const billsOnly = render(BudgetView, { items: [item({ id: "b1", kind: "bill", title: "Council rates" })] });
  assert.match(billsOnly, /Bills/);
  assert.doesNotMatch(billsOnly, /Income entered/);
});
