// lib/lifecfo/homeTone.ts
// HomeTone type for Home check-in answers.
//
// Tone is never computed from financial signals anymore -- see
// docs/product/ai-boundaries.md. The computation that used to derive "tight"
// from balance-vs-commitments (decideHomeTone, a Red-line-adjacent
// affordability signal) was deleted rather than left neutered.
// app/api/home/ask/route.ts's response shape still has a `tone` field, which
// it now sets to the constant "ok" directly.

export type HomeTone = "ok" | "tight" | "attention";
