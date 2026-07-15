# Privacy — page draft (handoff, v1)

**Read this note first.** The plain-language summary below is a confident
writing draft, ready to use largely as-is. The formal policy beneath it
is a structural draft only — sections marked **[NEEDS LEGAL REVIEW]**
contain placeholder reasoning, not language to ship. Life CFO operates
across the US, UK, and AU, each with a different privacy law framework
(a patchwork of US state laws, UK's post-GDPR regime, Australia's Privacy
Act/APPs) — those sections need an actual privacy lawyer, not a careful
product writer. Shipping this without that review is a real legal risk,
not a formality.

This is the actual page copy draft, companion to
docs/product/privacy-spec.md (the structural spec written first) — that
doc defines the sections and the plain-summary/formal-policy pattern;
this doc is the draft content itself.

---

## Plain-language summary (top of page, confident draft)

**What we collect.** The accounts and transactions you connect, basic
profile info, anything you choose to add — including notes about family
or pets — and some basic usage information about how you use the app.

**What we do with it.** We use it to show your financial picture, work
out things like what's safe to spend and what's coming up, and to answer
what you ask. Nothing here happens without you connecting or entering it
first.

**Who sees it.** People you've invited into your household, and the
service providers that help us run the app — the company that connects
your bank accounts, the systems that host the app, and the AI system
that powers conversations with Life CFO. We don't sell your data, and we
don't use it for advertising.

**Your control.** You can see exactly what's connected, export your
data, or delete your account and everything in it, at any time.

**About family and pets.** If you add a child's name or year of birth
under Family & pets, that's information you've chosen to add about your
own household — not something collected directly from a child, and never
used to advertise to anyone.

---

## Formal policy — structure and draft status by section

### 1. Data we collect — draft ready, confirm categories are complete
- Account and connection data (via bank-linking)
- Transaction data
- Profile and household data (including Family & pets entries)
- Goals, decisions, and notes entered in the app
- Basic usage/device data
- Support communications, if applicable

### 2. How we use data — draft ready, one line needs confirmation
To operate the app and provide analysis, forecasting, and Ask
conversations; to maintain security; for customer support. **[CONFIRM]:**
if any aggregated/anonymized data is used for product improvement, that
needs to be stated accurately — don't assert this without confirming
it's actually true of the current build.

### 3. Legal basis for processing — **[NEEDS LEGAL REVIEW]**
UK/EU-style regimes require a stated legal basis (consent, contract,
legitimate interest) per processing purpose. Not something to draft
without legal input — the wrong basis stated here is a real compliance
error, not a wording choice.

### 4. Third-party processors / sharing — **[NEEDS LEGAL REVIEW +
CONFIRM PROVIDERS]**
Structure: name the bank-linking provider, hosting provider, and AI
processing provider actually in use — I don't have confirmed provider
names to draft this accurately, and each one likely needs a Data
Processing Agreement, which is a legal/ops task, not a copy task.

### 5. Data retention — **[NEEDS LEGAL REVIEW + POLICY DECISION]**
Requires an actual internal decision on retention periods before this
can be written at all, then legal review of whether those periods are
compliant.

### 6. User rights — **[NEEDS LEGAL REVIEW — jurisdiction-specific]**
General categories to structure around: access, export, correction,
deletion. But the specific rights differ meaningfully by jurisdiction —
UK/EU-style rights (including a right to complain to a regulator like the
ICO), Australian Privacy Act/APP rights (complaint path to the OAIC), and
a patchwork of US state-level rights (e.g. California-specific
provisions). This section cannot be safely drafted without jurisdiction-
by-jurisdiction legal input.

### 7. Security measures — draft ready at a high level, confirm specifics
General language (encryption in transit and at rest, access controls) is
safe to draft in general terms, but the actual specifics should be
confirmed with whoever owns security/infrastructure before publishing,
not asserted from outside.

### 8. Children's data — draft ready
Life CFO is not directed at children as users. Where a child's name or
year of birth appears (via Family & pets), it's information voluntarily
added by the account holder about their own household, not collected
from a child directly.

### 9. International data transfers — **[NEEDS LEGAL REVIEW]**
Operating across US/UK/AU likely means data crosses borders depending on
hosting location — this requires a stated transfer mechanism, which is a
legal question, not a product-writing one.

### 10. Changes to this policy — draft ready
Standard structure: users will be notified of material changes, with a
visible "last updated" date on the page.

### 11. Contact — placeholder
Needs an actual contact method/responsible party filled in — not
something to invent.

---

## Recommendation

Treat sections marked draft-ready as genuinely usable starting points.
Treat every **[NEEDS LEGAL REVIEW]** section as blocked on actual legal
input before this page ships — not a formality to skip because the
surrounding sections read confidently.
