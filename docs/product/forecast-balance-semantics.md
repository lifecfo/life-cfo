# Forecast & balance semantics — canonical doc

Design-stage output, but closer to an engineering contract than the other
product docs. This resolves questions that were separately half-answered
in the Money Map and Year at a glance specs — safe-to-spend's precise
inputs, what feeds Year's projected line, and how the two relate. Both of
those specs should reference this doc rather than restate their own
version of these rules.

**This doc exists because of a real correctness risk, not a polish
concern:** without an explicit precedence rule, the same expected outflow
(e.g. electricity, present as both a confirmed Bill and inside a "Utilities"
Budget category) can be deducted twice, silently producing a wrong number
on both Money Map and Year at a glance.

---

## 1. Precedence rule (resolves the double-counting risk)

**Each expected cash flow enters any calculation through exactly one
pathway.** Confirmed, dated items take precedence over category-level
planned or typical-pattern amounts covering the same spending.

Hierarchy, in order:
1. **Confirmed, dated item** (a specific Bill or Income record with a
   known amount and date)
2. **Household-chosen plan** (a Budget category's planned amount, for
   spending not already captured by a confirmed item)
3. **Derived typical pattern** (the shared typical-month baseline, for
   categories with neither a confirmed item nor a chosen plan)
4. **Honestly incomplete** — where none of the above give reliable
   evidence, the calculation should say so rather than fabricate a number.
   "Everyday spending is not projected for these months yet" is a valid,
   correct output, not a gap to paper over.

This hierarchy applies identically wherever a forward-looking or derived
money number is calculated — safe-to-spend, Year's projected line,
Decisions' scenario comparisons. One hierarchy, several consumers.

---

## 2. Precise balance/number definitions

These terms have been used loosely across specs so far. Precise
definitions, going forward:

- **Cash today** — raw sum of included cash-type account balances. No
  deductions. What Money Map shows as the secondary number beside the
  hero.
- **Safe to spend** — cash today, minus near-term confirmed obligations
  (via the precedence rule above), minus earmarked/allocated amounts (per
  the Goal/Planned cost/Allocation model). Present-tense only.
- **Projected available cash** (Year at a glance's line — renamed from
  "projected balance," which was undefined and ambiguous) — safe-to-spend's
  same logic, extended forward in time using the precedence hierarchy for
  future periods. Not raw total cash projected forward — the flexible,
  spendable amount, which is what actually supports squeeze detection.
  **Update Year's spec to use this name and this definition explicitly.**

### What affects the flexible-cash calculation, and what doesn't
- External inflows/outflows: **affect it.**
- Transfers between included household accounts: **do not** (net zero,
  money hasn't left the household).
- Dated planned costs (rego, school fees, a booked holiday): **affect it.**
- Allocations/earmarks: reduce *flexible* cash, but don't change *total*
  cash — the distinction matters and both figures may need to coexist
  depending on where they're shown.
- Goal contributions: affect flexible cash if they represent a genuine
  intended commitment (money being set aside), not if they're merely an
  internal transfer with no behavioral commitment behind it.
- Debt principal payments: affect flexible cash (real outflow). Also
  relevant to Assets & debts' net worth calculation — cross-reference,
  don't recompute independently there either.

---

## 3. Income confidence tiers

Not all income is equally certain, and treating it as uniform is itself a
quiet honesty gap:
- **Confirmed income** — a known, dated payment.
- **Expected recurring income** — inferred or user-confirmed pattern
  (regular salary, etc.).
- **Variable income estimate** — range or recent-pattern estimate (casual
  shifts, commissions, irregular transfers).

v1 doesn't need three different visual treatments — but the underlying
data needs this metadata attached at the source, so confidence can be
surfaced later (in scope sentences, in Decisions) without re-deriving it.

---

## 4. Internal timing resolution

The visible UI stays monthly (Year at a glance's non-goal against daily
granularity is unchanged). **The engine's internal calculation must not
be monthly-only** — a positive month-end closing balance can hide a real
mid-month shortfall (income arrives the 25th, rent leaves weekly,
insurance leaves the 3rd). The engine should calculate at event/daily
resolution internally and summarize to monthly for display. A month can
be flagged because its closing position is low, because it dips materially
mid-month, or because a cluster of commitments lands before income —
these are different conditions and the underlying data should be able to
distinguish them even if the UI shows one flag either way.

---

## 5. Completeness as a first-class output

Every calculation covered by this doc should be able to express its own
completeness, not just its result — the same underlying idea as the
precedence hierarchy's "honestly incomplete" state, made explicit as a
data property rather than an edge case handled ad hoc per page. A
household with accounts connected and bills confirmed but no Budget set
should still get a meaningful, honestly-labeled result — not a blank page
and not a fabricated one.

---

## 6. Scope sentences must be generated, not templated

Both Money Map's safe-to-spend caption and Year's scope sentence need to
reflect the actual sources, fallbacks, and gaps used for that specific
household's calculation — not a single fixed sentence that overclaims
completeness for everyone. Example variants:

- "This includes confirmed bills, expected income and your monthly plan.
  Three everyday categories use recent typical spending because no plan
  has been set."
- "This includes known bills and income. Everyday spending isn't
  projected yet because there isn't enough recent history."

The rule is fixed (always disclose real inputs); the exact sentence is
generated per household, per calculation.

---

## 7. Shared calculation output — one shape, several consumers

Money Map, Year at a glance, and Decisions should all read from one
calculation output, not each interpret the underlying data independently.
Decisions specifically should vary *inputs/assumptions* to this shared
calculation and compare resulting outputs — it should never build its own
separate forecast interpretation, or Year and Decisions can quietly drift
into disagreeing with each other.

Conceptual shape (illustrative, not a final schema — that's an
implementation decision, not a design one):

```
ForecastPeriod {
  openingCash
  confirmedIncome[]       // tier: confirmed
  expectedIncome[]        // tier: expected recurring
  variableIncomeEstimate[]// tier: variable estimate
  confirmedBills[]
  plannedEverydaySpending[]   // from Budget, only where no confirmed item covers it
  typicalFallbackSpending[]   // only where no confirmed item and no plan
  plannedCosts[]
  internalTransfers[]         // excluded from flexible-cash totals
  closingCash
  lowestIntramonthCash        // for squeeze detection, not just month-end
  completeness                // explicit, not implied by absence of data
  notableReasons[]            // distinguished from data-uncertainty flags
}
```

**Notable event vs. data uncertainty are different things and should not
share the same flag treatment.** Missing information is not itself a
financial squeeze — a month flagged because data is thin needs different
language than a month flagged because a real squeeze is projected, even
if the visual treatment stays similarly quiet for both.

---

## 8. Month-detail reconciliation (Year at a glance)

Tapping a month must show every input group that produced that month's
projected position — not just Bills/Income, which was the original spec's
gap. If the line reflects Budget and typical-fallback spending too, the
detail view has to show that, or the numbers won't add up and trust in
the whole page erodes. Each group in the detail view should link back to
its canonical source (a bill, a budget category, a typical-pattern
calculation) — same "everything traces back" principle as the "ask why"
affordance on Money Map's hero number.

---

## Follow-up required (not done in this doc)

- Money Map spec (v3) and Year at a glance spec (v2) both need a short
  edit: replace their own stated safe-to-spend/projection semantics with
  a reference to this doc, and Year's spec specifically needs "projected
  balance" renamed to "projected available cash" throughout.
- Month/marker accessibility states (selected, current, flagged, keyboard
  focus) — raised in the same review, but that's a page-level interaction
  spec detail, not a semantics question, so it belongs back in Year's
  spec, not here.
