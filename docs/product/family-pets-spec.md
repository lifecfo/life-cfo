# Family & pets — page spec (handoff, v1)

**This page already exists and is largely well-built** — this spec
formalizes what's there, flags one real inconsistency worth checking, and
adds it properly to page-ownership-map.md, which didn't account for this
page at all. Not a redesign.

## Its one job

Descriptive context about people and pets relevant to the household's
financial reasoning — not an access or membership concept. A child, a
pet, or an ageing parent can all be genuinely relevant context (school
fees ahead, ongoing vet costs, a parent who may need support) without
ever being an app user.

## Boundary with Household (new — this distinction wasn't previously
documented anywhere)

- **Household** owns who has login access and what role they hold —
  membership/access/roles/invitations.
- **Family & pets** owns descriptive context about people and pets
  relevant to financial reasoning, independent of app access.

The same person can appear in both (a partner who's a Household member
*and* has a Family entry with their own notes) — this is not duplication,
it's two different concerns about the same person. A dependant child or a
pet will typically only ever appear in Family & pets, never in Household.

## What it sees (as currently built, confirmed good)

- **"Me" card** — optional, editable: name (defaults "Me"), year of birth
  (optional), free-text "About" for values/goals/constraints.
- **Family section** — list of people (partner, child, parent, etc.),
  each with name, relationship (optional), year of birth (optional),
  free-text "About." Empty state: "No family added yet," with example
  text as gentle guidance, not a requirement.
- **Pets section** — same shape, empty state: "No pets added yet," with
  example text ("Dog, cat, or any pet with regular care or costs").

## Confirmed: Pets already has its own properly-tailored form

Checked directly against the built UI — Pets does NOT reuse the Family
form. It has its own fields: Name, Type (optional, "e.g. Dog, cat"), and
About (optional, "Care, routines, or regular costs" — a better-tailored
prompt than Family's "values, goals, constraints"). No inconsistency
here; an earlier version of this spec speculated Pets might be reusing
Family's "Relationship" field — confirmed false, no action needed.

## Non-goals — explicit, to protect what's already right

- **No "complete your profile" nagging, no completion percentage, no
  progress indicator implying an unfinished state.** "No family added
  yet" next to soft example text is correct as-is. The moment this
  becomes a nudge or a badge, it violates the same non-engagement-is-
  success principle governing every other page in the app.
- No required fields beyond a name — everything else stays optional,
  as currently built.
- No visible use of this data to construct financial verdicts ("you have
  3 dependants, therefore...") — this page stores context; how it's used
  in reasoning elsewhere (Ask, Decisions) is a separate concern, not
  displayed as judgment here.

## Note on data sensitivity

Year of birth for children is the kind of detail worth handling with
ordinary care in storage/privacy terms — not a special UI treatment
here, just worth confirming it falls under the same privacy handling
already covered in Settings, rather than being a special case nobody
thought to include.

## Action needed

Add this page to page-ownership-map.md — it was missing entirely from
that doc despite already existing in the built app. Suggested entry:
placed alongside Household under a shared "Household" nav grouping (as
currently built), with the boundary above stated explicitly so it
doesn't get merged into Household by a future cleanup pass that doesn't
know why they're separate.
