# Legal review — resolved

Both issues originally flagged here have since been resolved in code.
Kept for history rather than deleted; re-verified directly against the
current codebase on 2026-10-26, not just reasoned about.

**See also:** `docs/product/legal-boundary-checklist.html` — a working,
interactive checklist for testing whether a *new feature* (not existing
copy) stays inside AU/UK/US financial-advice and credit-licensing
boundaries.

## 1. Plaid/Privacy disclosure mismatch — resolved (moot)

Originally: `/fine-print` disclosed both Basiq and Plaid as bank-linking
providers, while `/privacy` named only Basiq.

Current state: both `/privacy` (`app/privacy/page.tsx`) and `/fine-print`
(`ImportantInformationContent.tsx`) now render from the single shared
source `lib/legal/betaLegalCopy.ts`, which contains **no mention of
Plaid or Basiq at all** — it consistently states "Life CFO does not
connect banks in this beta" everywhere. The mismatch can't recur because
there is no longer a second, independently-edited copy of this
disclosure to drift out of sync. If/when bank connections (`lib/flags/
bankConnect.ts`) are turned back on for a later release, this needs a
fresh real disclosure pass at that time — not a reason to reopen this
item now.

## 2. Content-versioning gap — resolved

Originally: `FinePrintClient.tsx` hardcoded `const VERSION = "v1"` with
no mechanism tying a past acceptance to the actual content shown at
signing time.

Current state: `fine_print_version` now stores `legalPackSha256()` — a
real content hash of `betaLegalCopy.ts`, not a manual string — and
`app/api/legal/accept/route.ts` writes both `content_sha256` and a full
`content_snapshot` to the acceptance record at signing time
(`content_sha256`/`content_snapshot` columns, lines ~62-70, ~104).
`app/api/legal/status/route.ts` compares the stored hash against the
current `legalPackSha256()` to detect drift. Any future edit to the
legal text changes the hash, which correctly invalidates prior
acceptances rather than silently showing someone today's text against
their old signature.
