# Money in / Money out — fold decision needed

Flagging only. No decision made in this doc — this needs a real product
call, not something to resolve silently by whoever touches this area
next.

## The contradiction

`docs/product/current-money-model.md`'s route table explicitly lists
`/money/in` and `/money/out` with status **"settled for now"** and
navigation status **"visible"** — i.e. that doc treats them as
intentionally-kept, separate, standalone pages.

`docs/product/money-map-spec.md` (v2) independently specifies a "Money
in / Money out" section directly on Money Map — an In card with a
sparkline, an Out card with a category-breakdown bar and legend. It never
mentions `/money/in` or `/money/out` at all, doesn't say whether they
should be removed, redirected, or kept alongside the new section.

Neither doc acknowledges the other. There is no written decision
anywhere in this repo's docs about whether Money Map's new section
replaces the standalone pages, coexists with them, or supersedes one but
not the other.

## The asymmetry — these two pages are not the same kind of problem

**`/money/in` is thin and safe to fold.** It fetches `/api/money/overview`
— the same endpoint Money Overview and `/money/setup` already call — and
just re-displays a subset of that same payload (money-in-this-month by
currency, confirmed income pattern count, income source count/amount).
No dedicated API, no computation of its own, close to a literal re-slice
of a card Money Overview already shows inline. Folding this into Money
Map is close to a pure subtraction — there's little here that isn't
already available elsewhere.

**`/money/out` has real, unique functionality Money Map's spec wants but
doesn't have built.** It calls its own dedicated endpoint,
`/api/money/out`, returning data nothing else in the app currently
surfaces in this shape: `top_categories`, `top_merchants`,
`recent_out_transactions` (actual transaction rows — merchant, date,
category, amount), `upcoming_bills` (with due dates), plus recurring/
upcoming bill totals. This is close kin to exactly what
`money-map-spec.md`'s "Out" card and "Recent activity" section describe
wanting — category breakdown, notable-driver detection, recent
transaction rows with category icons.

## Recommendation

**Do not silently build Money Map's In/Out section from scratch.**
`/money/out`'s existing endpoint and category/merchant aggregation logic
should very likely be reused or migrated into Money Map's new section
rather than reimplemented — the underlying data shape (top categories,
top merchants, recent out-transactions) is already most of what the spec
asks for. Building a second, parallel implementation risks the exact
kind of drift `page-ownership-map.md`'s canonical-concepts rule exists
to prevent (one source, one calculation, however many pages present it).

`/money/in` doesn't have the same reuse case — there's little unique
logic to carry forward, so its fate is more a pure "keep, redirect, or
delete" navigation question than a migration question.

## Full blast radius — everywhere currently wired to these two routes

Confirmed by direct code search, not assumed:

- **`components/AppShell.tsx`** — both are in the persistent sidebar nav,
  under Money → "Money details" subsection (`{ href: "/money/in", label:
  "Money in" }`, `{ href: "/money/out", label: "Money out" }`). Unlike
  Rules/Categories (zero nav presence, flagged separately as a
  discoverability bug), these two are genuinely in the nav today.
- **`app/(app)/money/page.tsx`** (Money Overview) — the "In" and "Out"
  `FlowCard`s link directly to `/money/in` and `/money/out`.
- **`app/(app)/lifecfo-home/page.tsx`** — one link, to `/money/out` only
  (the "groceries estimate" coming-up item). No link to `/money/in` from
  Home.
- **`app/(app)/money/setup/page.tsx`** — "Check your income" links to
  `/money/in`, "Check your bills" links to `/money/out`.
- **`components/ask/AskPanel.tsx`** — not a navigation link, but maps
  both paths to scope labels ("Money -> In" / "Money -> Out") shown when
  Ask is opened while on either page. Would need updating if either
  route changes or disappears.

Any resolution needs to account for all five of these, not just the two
page files themselves.

## Open question this doc deliberately does not answer

Whether the resolution is: (a) fold both into Money Map and redirect/
remove the standalone pages, (b) fold Out's functionality into Money Map
but keep both pages as deeper-detail destinations, (c) keep both pages
exactly as they are and treat Money Map's spec section as a summary that
links out to them, or something else. Needs a real product decision,
not an implementation default.
