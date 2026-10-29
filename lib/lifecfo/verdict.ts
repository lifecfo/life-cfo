// lib/lifecfo/verdict.ts
// Verdict type for "should we / can we afford / decision outcomes" answers.
//
// The values below other than INSUFFICIENT_DATA are never produced anymore
// -- see docs/product/ai-boundaries.md. The computation that used to choose
// between them (decideVerdict, an affordability/suitability judgment) was
// deleted rather than left neutered. The type stays because
// app/api/home/ask/route.ts's response shape still has a `verdict` field,
// which it now sets to the constant "INSUFFICIENT_DATA" directly.

export type Verdict =
  | "CLEAR_YES"
  | "YES_NEEDS_PLANNING"
  | "NOT_YET"
  | "NEEDS_ATTENTION"
  | "NO"
  | "INSUFFICIENT_DATA";
