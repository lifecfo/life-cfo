# Money Out — category breakdown chart (v1)

Design-stage output. This is the first concrete piece of the broader
"more real graphics" direction — chosen specifically because it's
genuinely unblocked: `top_categories` and `top_merchants` are already
computed and already flowing into `/money/out` (confirmed via this
session's Money In/Out reconciliation), fetched into client state as
full per-category/per-merchant arrays with real amounts. Today only the
single top entry of each is rendered, as name-only text ("Top category:
X" / "Top merchant: Y") — the rest of both arrays goes unused. This is
a "chart what's already there" addition, not new data plumbing — same
category as every trust footer built tonight.

## Correction to an earlier assumption, worth recording

Money Map does not have an "Out" section — confirmed multiple times
this session; its real live sections are "Where the money is," Cash
Plan, Savings goals, planned items, and review items. The original
graphics-gap discussion assumed a Money Map "Out" section existed and
needed charting; it doesn't. `/money/out` is the real, correct target.

## The chart

Build the first real rendering of `top_categories` — today only its
single top entry surfaces, as name-only text with no amount
(`OutClient.tsx:227-228`); the rest of the array (real per-category
amounts, already fetched) goes unused. Render it as a real horizontal
segmented bar (or a donut, if that reads more clearly at this data
density — worth a quick visual comparison during build, not prescribed
here) showing each category's share of total spend for the period.

**Color:** use the real 8-color category palette (`category.1`–
`category.8` in `tailwind.config.js`, defined earlier this session) via
a deterministic category → slot mapping function — confirmed via
exhaustive grep that this function doesn't exist anywhere in the
codebase yet; it was specified as needed work in
`visual-infrastructure-build-spec.md` but never implemented. Building
it (hash the category id or an explicit assignment table, per that
spec's own note) is part of this work, using the real, already-defined
color tokens. Transactions doesn't currently color-code by category at
all — confirmed it uses `category` as plain text only, no icon color,
nothing — so this isn't following an existing precedent there. It would
become a natural second consumer of this function once it exists, not
something this work is drawing on.

**Explicitly not verdict-coded.** This chart identifies *which*
category the spending fell into — it does not imply any category is
"good" or "bad," over- or under-spent. No red, no warning color, no
implied threshold. This is the same distinction already drawn for
Goals' teal accent and Budget's composition bar: category color
identifies, it doesn't judge. Worth stating explicitly here since this
is the first chart in the app driven by the *category* palette
specifically, rather than the single teal accent used everywhere else.

**Legend:** category name + amount, same discipline as every
same-hue-risk chart built tonight (Year's chart legend, Budget's
composition-bar legend) — a chart using more than one color needs a
key, full stop.

**Merchant breakdown** (`top_merchants`) can follow the same treatment
as a second, smaller chart or stay as a plain list below the category
chart — real content either way, worth a quick call during build
rather than over-specifying here.

## Non-goals

- No color-as-verdict, no threshold lines, no "you're over" framing —
  unchanged from every other page tonight.
- No new data fetching — `top_categories`/`top_merchants` are already
  computed server-side; this is purely a rendering change.
- Does not touch Money Map at all — that page's real sections stay
  exactly as reconciled in `money-map-spec.md` v4.

## Why this one, first

Of everything discussed in the graphics review, this is the only
target that's simultaneously (a) genuinely unblocked — real data,
already computed, zero new fetches — and (b) a real first use of the
category palette beyond Transactions' small icons, which is exactly
the kind of "built once, barely used" infrastructure this session has
been actively working to put to real use. Net worth's historical trend
chart (flagged during the graphics review as arguably higher-value
long-term) stays a separate, larger piece of work — real new
aggregation/storage question, not a quick chart-what's-already-there
addition like this one.
