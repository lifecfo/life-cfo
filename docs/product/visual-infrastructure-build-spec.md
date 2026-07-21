# Visual infrastructure — build spec (handoff)

Source: a full sidebar sweep (`sidebarGroups` in `components/AppShell.tsx`,
29 pages) checked against `docs/product/visual-design-system.md` and each
page's own spec doc, plus direct verification against the real repo
(`tailwind.config.js`, `app/globals.css`, `components/ui/`). This doc
turns those findings into a build list, not just an audit.

## Starting point, confirmed against the real repo tonight

- `tailwind.config.js`'s `theme.extend.colors` currently has 7 groups:
  `cfo`, `brand`, `neutral`, `semantic`, `btn`, `alert`, `status`. No
  `category` key exists — adding one is a clean, non-colliding addition
  alongside the existing 7, not a rename or restructure.
- The hex collisions `visual-design-system.md` describes are real and
  still present: `brand.aqua` / `cfo.light` / `status.pending` are all
  `#6FAFB2`; `brand.yellow` / `semantic.warning` are both `#F2C94C`;
  `status.completed` / `semantic.success` are both `#4FAF91`;
  `status.active` / `cfo.DEFAULT` / `brand.teal` are all `#1F5E5C`.
- `app/globals.css` is **not** corrupted (43 clean lines, normal Tailwind
  v4 entry file). An earlier note this session flagged it as corrupted
  and uncommitted — that is no longer the current state and should not
  be treated as an open problem by anyone reading this doc later.
- `components/ui/` follows a flat-file-plus-barrel-export convention
  (`Badge.tsx`, `Button.tsx`, `Card.tsx`, `Chip.tsx`, `MeterBar.tsx`,
  `MiniSignal.tsx`, `Toast.tsx`, each re-exported from `index.ts`). Any
  new shared component described below should follow this pattern, not
  invent a new one.
- Repo-wide grep tonight confirmed: zero files use any of the 8 proposed
  category hex values, zero use a `<Money>` component (it doesn't exist
  yet), zero use `framer-motion`/`react-spring`/`gsap`/`@keyframes`.
  `tabular-nums` exists ad hoc in 5 files (Transactions, Accounts,
  Income, Bills, Upload bank file) — more than
  `visual-design-system.md`'s "exactly once" claim, which is stale, but
  still applied per-instance rather than through a shared component.
- `components/ui/MeterBar.tsx` already exists: a real, accessible
  (`role="progressbar"`, full ARIA attrs) progress bar using `bg-cfo`,
  with an `emptyLabel` fallback and a static (non-animated)
  `style={{ width }}`. Goals' page (`app/(app)/money/goals/page.tsx`)
  does not use it — it hand-rolls its own plain `bg-zinc-300` bar
  instead. This is a ready-made integration point, not a greenfield
  build.

## Build items

### 1. Category color palette
Add `category: { 1: "#3E7C74", 2: "#C98A3E", 3: "#C1614B", 4: "#7A4B73",
5: "#5C6F8A", 6: "#7C9070", 7: "#B4707E", 8: "#B8A47C" }` under
`theme.extend.colors` in `tailwind.config.js`, alongside the existing 7
groups. Needs a deterministic category → slot mapping function (hash the
category id or an explicit assignment table) so a given category always
renders the same color, cycling gracefully past 8 for custom categories.
No existing code references a `category` key, so this is additive only.

### 2. `<Money>` component
New file: `components/ui/Money.tsx`, exported from `components/ui/index.ts`
per the existing convention. Its only job is centralizing `tabular-nums`
and giving every page one consistent call site — it must not reimplement
currency formatting, which is already correct. Reuse
`formatMoneyFromCents`/`formatMoneyFromAmount` from `lib/money/formatMoney.ts`
directly:

```tsx
import { formatMoneyFromCents, type FormatMoneyOptions } from "@/lib/money/formatMoney";
import { cn } from "@/lib/cn";

type MoneyProps = {
  cents: number | null | undefined;
  currency?: string | null;
  options?: FormatMoneyOptions;
  className?: string;
};

export function Money({ cents, currency, options, className }: MoneyProps) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatMoneyFromCents(cents, currency, options)}
    </span>
  );
}
```

Open question, confirm before implementation: `@/lib/cn` vs.
`components/ui/cn.ts` — verify these are the same utility (or which is
canonical) before building this component, since it's meant to be the one
consistent call site and shouldn't itself start from an inconsistency.

Note there is no currency-to-locale mapping anywhere in the codebase to
reuse — confirmed by grep. `formatMoneyFromAmount`/`formatMoneyFromCents`
take an optional `locale` and pass it straight to `Intl.NumberFormat`
(defaulting to the runtime's default locale regardless of currency); they
only handle currency-code validation and fallback
(`normalizeCurrencyCode`, `hasValidCurrencyCode`). `<Money>` should pass
`options` through unchanged, not add locale logic of its own.

Candidate call sites already identified: the 5 files currently applying
`tabular-nums` manually (Transactions, Accounts, Income, Bills, Upload
bank file) should migrate to it rather than keep the ad hoc class; every
other money figure in the app (Home, Money Map, Year, Goals, Net worth,
etc.) currently has none at all and is a build target, not a migration.

### 3. Motion
No new dependency — plain CSS transitions plus a small shared hook, per
`visual-design-system.md` §4. Concrete first target: add a fill-from-zero
transition (~400ms ease-out) to `components/ui/MeterBar.tsx`'s width
style, respecting `prefers-reduced-motion`, then have Goals adopt
`MeterBar` instead of its own inline bar. Number count-up (~600-800ms)
and expand/collapse (~200-250ms) rules apply wherever `<Money>` and
collapsible sections land.

### 4. Chart grammar
Apply `visual-design-system.md` §5 (gridlines with scale labels, visible
data-point marks, teal fill/line, dashed reduced-opacity projected
segments, neutral flagged-point marker, no yellow) to Year at a glance's
timeline chart, which currently uses ad hoc green/gray/blue/amber lines
with no gridlines or scale labels — the only data-bearing line chart
found in the sidebar sweep.

## Known page-level gaps this infrastructure would help close

Not exhaustive — see the full sidebar sweep for the complete list — but
these are the clearest, already-confirmed-in-code cases:

- **Goals** (`app/(app)/money/goals/page.tsx`): flat `bg-zinc-300` bars
  for every goal regardless of purpose type; spec wants purpose-typed
  rings/bars/dashed cards. Confirmed zero ring/circle elements and zero
  `purpose_type` usage in the file.
- **Accounts** (`app/(app)/accounts/AccountsPage.tsx`): included/excluded
  toggle explicitly marked `// Not implemented.` in code, pending
  `forecast-balance-semantics.md`'s safe-to-spend definition.
- **Transactions** (`app/(app)/transactions/TransactionsClient.tsx`):
  recategorize/split/mark-transfer/mark-duplicate/exclude explicitly
  marked as intentionally not implemented, pending a shared
  calculation-propagation layer.
- **Income** (`app/(app)/income/page.tsx`): confidence-tier tag
  (Confirmed / Expected recurring / Variable estimate) explicitly marked
  `// Not implemented.`, pending a schema change.

## Non-goals (carried from `visual-design-system.md`)

- Full dark mode — explicitly parked, post-beta.
- A branded custom typeface vs. the system font stack — open decision,
  not resolved here.
- Final sign-off on the 8 proposed category hex values — first pass,
  not final.
