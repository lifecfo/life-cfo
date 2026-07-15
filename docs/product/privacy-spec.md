# Privacy — page spec (handoff, v1)

Design-stage output, first full version — **with a real limitation
flagged upfront.** This spec covers structure and the plain-language
layer confidently. The formal legal content — retention periods,
jurisdiction-specific rights, legal basis for processing — genuinely
needs a privacy lawyer, not a design pass. Life CFO operates across US,
UK, and AU, and each has a different framework (UK's post-GDPR regime,
Australia's Privacy Act and the APPs, and a patchwork of US state laws).
Getting those wrong isn't a copy problem, it's a compliance problem —
this doc does not pretend a well-written page solves that, and the
sections below are marked accordingly.

Build to this, not to what may currently exist in the repo — see
"Known gap in the current live page" below, which is a correctness
finding, not a design opinion.

## Its one job

Explain what data is collected, how it's used, who it's shared with, how
long it's kept, and what rights the person has over it.

## Structure — a pattern worth adopting on its own merits

A short plain-language summary at the top (the pattern Notion, Basecamp,
and a few others use well), followed by the fuller formal policy beneath.
This is genuinely on-brand, not just a workaround: it's the same
"plain language carries trust" principle from day one, applied to the one
page in the app most tempted to default into legalese.

**Division of labor, stated plainly:** the summary layer is something
that can be drafted with confidence in this design pass. The formal
policy beneath it needs legal review before shipping — structure and
section coverage can be specified now (below); final legal text cannot.

## Sections the formal policy needs to cover (structure, not final text)

1. **What data is collected** — account/transaction data via
   bank-linking, profile info, Family & pets notes, usage data.
2. **How it's used** — powering analysis, forecasting, Ask conversations.
3. **Third parties/processors** — needs particular care, easy to
   under-scope if treated as an afterthought. Must disclose: bank-linking
   providers, hosting infrastructure, and the AI provider processing Ask
   conversations.
4. **Retention and deletion** — how long data is kept, how someone
   deletes it.
5. **User rights** (access, export, correct, delete) — genuinely
   different per jurisdiction; the section most in need of real legal
   drafting, not a design-stage placeholder.
6. **Security measures** (high-level).
7. **Children's data** — worth a line given Family & pets can include a
   child's name and birth year. Life CFO isn't directed at children as
   users, but the data exists in the system, and that's worth
   acknowledging explicitly rather than leaving unaddressed.
8. **Policy changes and contact information.**

## Known gap in the current live page — found during this review, not a design opinion

The app already has a live `/privacy` page in the repo. Checked it
directly against this spec's §3 (third parties/processors): it discloses
**Basiq** (Australian bank-linking) and the AI provider (OpenAI/Anthropic,
correctly already covered), but has **zero mention of Plaid** — the US
bank-linking provider the app's own `/connections` page and
`/api/money/plaid/*` routes actively support. It also has no UK-specific
language, no GDPR/Privacy Act/APP references, and no children's-data
section.

This isn't a hypothetical risk this spec is warning about in the
abstract — it's a live page currently under-disclosing one of its two
real bank-linking processors. Worth prioritizing as a correctness fix
independent of the rest of this redesign, since it's the exact failure
mode §3 above calls out ("easy to under-scope if treated as an
afterthought").

## Visual system

Plain, text-forward — same as Important information. No category
palette, no charts, no monetary figures, no tabular-numeral concerns.

## Layout

1. Plain-language summary (short, confident, drafted at design stage).
2. Formal policy, section-by-section per the structure above — final
   text pending legal review.
3. Links: Important information, How Life CFO works (cross-references,
   not duplicated content).

## Non-goals

- No functional/mechanical explanation of how answers are produced (→
  How Life CFO works).
- No financial-advice disclaimer content (→ Important information) —
  this page is about data handling, not what Life CFO will or won't do
  with a person's money.
- No final legal text drafted in this pass — structure only, pending
  legal review per jurisdiction.

## Empty state

Not applicable — static content, not data-driven.
