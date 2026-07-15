# Urgent legal review needed

Two issues found during this session's audit of the fine-print/privacy
surfaces. Both need a real decision from whoever handles legal review —
not a code fix applied unilaterally. Capturing them here so they aren't
lost between conversations.

## 1. Plaid/Privacy disclosure mismatch — most urgent, live in production

`/fine-print` (component `ImportantInformationContent.tsx`, "Your money
data" section) correctly discloses **both** bank-linking providers:

> "You may connect accounts through Basiq or Plaid, upload bank files, or
> add information manually."

`/privacy` (`app/privacy/page.tsx`) discloses **only Basiq** — it has no
mention of Plaid anywhere in the page. The "Financial information (via
Basiq)" section and the "How we share information" list both name Basiq
specifically and say nothing about Plaid, despite the app's own
`/connections` page and `/api/money/plaid/*` routes actively supporting
Plaid-based US bank connections.

This is not a hypothetical gap — it is a live, in-production
inconsistency between two pages both currently shipped to real users.
One page tells the person both providers see their data; the other tells
them only one does. Needs a decision on which is correct (almost
certainly: update `/privacy` to name both) and then an actual legal-review
pass on what that disclosure needs to say per jurisdiction (US/UK/AU),
not just a copy fix.

## 2. Content-versioning gap — signed acceptance isn't tied to what was actually shown

`FinePrintClient.tsx` hardcodes `const VERSION = "v1"` and, on save,
writes `{ fine_print_accepted_at, fine_print_version, fine_print_signed_name }`
to the `profiles` table. Separately, `ImportantInformationContent.tsx` is
imported and rendered live and identically in both the signing flow
(`FinePrintClient`) and the already-signed read-only view
(`FinePrintReadOnly`) — it is not fetched or selected based on the stored
version, and there is no version→content mapping anywhere in the code.

Practical effect: if this content is edited in the future without a real
versioning mechanism behind it, anyone who signed against an earlier
version will see **today's live content** on their read-only "already
accepted" view — not a snapshot of what they actually agreed to at the
time they signed. The `VERSION` string is a manual convention with
nothing in the code enforcing that a content change bumps it, or that a
past acceptance is tied to the specific content that existed at that
time.

Needs a decision: either (a) snapshot the accepted content at signing
time (e.g. store the rendered text or a content hash alongside the
acceptance record), or (b) explicitly accept the current manual-version-
bump convention as sufficient — and if (b), document why, since as it
stands nothing prevents content and version silently drifting apart.

## Explicitly not fixed in code

Per instruction, neither issue has been touched in the codebase. Both are
flagged here for legal/product review and a real decision, not patched
unilaterally.
