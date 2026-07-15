# What we own and owe — page spec (handoff, v1)

Design-stage output, first full version. Build to this, not to what may
currently exist in the repo.

**Naming decision (new — has a knock-on effect):** this page is named
"What we own and owe," not "Net worth," "Wealth," or "Assets & debts."
"Net worth" and "Wealth" name a score to be judged against; this names an
activity (listing what's true), consistent with the plain-language
principle governing every other page. **The original nav sketch used
"Assets & debts" as the label — update that for consistency when this
page is built**, this isn't just an internal doc title.

## Its one job

The full, honest picture of what the household owns and owes — assets,
debts, investments, and net worth — present-tense and detailed. Contrast
with Money Map's deliberately quiet, collapsed net-worth teaser: that's
the summary, this is the full page it links to.

## This is the most emotionally loaded page in the app — design
accordingly, same care level as Home

Someone arrives here by choosing to click in, unlike Home — so leading
with a hero number is appropriate, not an ambush. What can't shift is the
language discipline:

- **State debt plainly, no euphemism.** "The household currently owes
  approximately $486,000 across two debts" — not "financial commitments,"
  not softened. Plain and factual is more respectful than vague, even
  when the fact is unwelcome. This was the care principle from the
  original review and it's adopted exactly as written.
- **No color-as-verdict, including on the net worth number itself.** If
  net worth is negative, it displays plainly, no alarm color, no red. The
  discipline that's governed every other page applies at full strength
  here, precisely because this is the page most likely to tempt an
  exception.
- **A composition visual (owned vs. owed) is included, and debt does NOT
  get a warning color.** Same neutral palette treatment as any category
  elsewhere in the app. This was a real design risk worth naming
  explicitly: a two-segment "owned/owed" bar could easily read as a shame
  meter if debt were colored differently from assets. It isn't — see
  Visual system below.
- **No manufactured praise for debt reduction or asset growth,** even
  where it's genuinely positive. Observational language only ("reducing
  steadily over the last 6 months"), never cheerleading — same
  "show, don't perform" discipline as everywhere else. A real milestone
  (a debt paid off entirely) can get the same understated visual delight
  treatment defined for Goals — this page doesn't invent its own
  celebration mechanic.

## Boundary with Accounts (new — same pattern as the Bills/Planned-cost
boundary)

**Accounts owns the factual list** — account name, balance, sync status.
**This page owns interpretation and detail** — what's invested in,
property/vehicle valuations, debt terms (interest rate, minimum
payments), and the net worth calculation itself. They are not duplicating
each other: an investment account might appear factually on Accounts and
also have its holdings detail shown here; a property (not a bank account
at all) only ever appears here.

## Fact / estimate / intention (applying the global rule from
page-ownership-map.md)

This page has the widest spread of certainty tiers in the app — apply the
distinction explicitly:
- **Verified** — a linked account balance (e.g. investment/super account
  synced directly).
- **Estimated** — a manually entered or inferred valuation (property,
  vehicle), shown with "last updated" so staleness is visible, not
  assumed current.

## Visual system (references docs/product/visual-design-system.md)

This is an explore page, same register as Money Map/Budget/Goals — full
visual richness is correct here, not restraint.

- **Hero number** for the headline figure, typography-led, same language
  as Money Map's safe-to-spend.
- **Composition bar**: two segments, Owned vs. Owed, using two ordinary
  category-palette colors — never a warning/status color for the "owed"
  segment. Same segmented-bar visual grammar as Money Map's Out
  breakdown and Budget's composition bar, reused deliberately for
  consistency across the app.
- **Long-range net worth trend line**: historical only (no projected/
  dashed portion needed — this is a different timescale and purpose from
  Year at a glance's short-term cash projection, not a duplicate of it).
  Solid throughout, neutral color, draws in on load per the established
  motion discipline.
- Category-appropriate icons per asset/debt type, real palette,
  deterministic mapping.
- Tabular numerals throughout.

## Layout

1. Hero: total figure + one plain sentence stating both sides ("owes
   approximately $486,000... against $700,300 owned").
2. Composition bar + legend.
3. Long-range trend line.
4. **Owned** group: property, vehicles, investment holdings detail — each
   row shows verified/estimated status and last-updated where relevant.
5. **Owed** group: each debt with terms (rate, etc.) and an observational
   sentence only where genuinely notable (a real trend, not "on track"
   framing).
6. Ask input, anchored.

## What a person can do

Add/edit an asset or debt, manually update or re-estimate a valuation
(flagged as estimated, with a timestamp), view full detail, ask about
anything on the page.

## Non-goals

- No performance framing of debt reduction or asset growth as a "score."
- No color-as-verdict anywhere, including the headline number.
- No duplication of Accounts' factual account list — this page shows
  interpretation and non-account assets, not a second copy of Accounts.

## Cross-reference

Net worth is a shared calculation per page-ownership-map.md's canonical
concepts table — this page presents it, doesn't independently recompute
it. Debt principal payments also affect flexible cash per
forecast-balance-semantics.md — that's Money Map/Year's concern, not
recalculated separately here, but worth knowing the same underlying data
feeds both.
