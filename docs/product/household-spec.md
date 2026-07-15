# Household — page spec (handoff, v1)

Design-stage output, first full version. Build to this, not to what may
currently exist in the repo.

## Its one job

Household identity, membership, roles, and access — the shared workspace
boundary. This is explicitly NOT real household financial transparency
(granular control over who sees what detail of whose spending) — that
remains deferred, future-scope work per the original project brief. This
page owns "who's in the household and what role they hold," not "what
they're permitted to see of each other's money."

## Why this stays architecturally real despite a minimal beta UI

Per page-ownership-map.md: "Household is the global workspace and access
boundary, its model should be treated as architectural even when the UI
remains minimal." Concretely: roles and access-boundary fields need to
exist in the data model now, even though the UI only exposes a simple
member list for beta — so that real transparency features later don't
require a schema rework, just new UI surfacing data that already exists
structurally.

## Visual system

Deliberately minimal — same register as Set up/Settings, and consistent
with Bills/Income/Accounts' plainness. No category palette (nothing here
is financial data), no charts, no rings. This is intentional, not
unfinished — not every page in the app is meant to compete visually with
Money Map, Budget, or Goals.

## Layout

- Household name/label.
- Plain member list: avatar/initials, name, role (Owner/Member), status
  (active, or invited-pending with a distinct visual treatment — dashed
  border/clock icon rather than a full avatar, so pending invites read
  clearly as not-yet-active without needing a status color).
- Invite affordance at the bottom.

## What a person can do

- Invite a new member (email-based invite).
- Edit their own display details.
- Remove a member (owner-only action).
- Leave the household.

## Non-goals for beta

- No granular shared-vs-personal visibility controls per account or page
  — that's the deferred real-transparency work.
- No dependant/family financial-reasoning inputs beyond basic membership.
- No per-member permission granularity beyond Owner/Member.

## Note on invite as a real action

Sending an invite is a real outbound action (email/notification), not a
passive display — should follow the same confirm-before-sending pattern
as any other outbound communication in the app, not fire silently on
form submission.
