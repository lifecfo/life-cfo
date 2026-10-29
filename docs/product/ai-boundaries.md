# AI boundaries

What Life CFO's AI is allowed to do, in four tiers, and what must never come
back. Written after a 2026-10-23 pivot removed a cluster of AI features that
crossed into financial advice (see commits `1e0f999` and `6fa3616`), and a
2026-10-29 pass that deleted the dead code those removals left behind instead
of leaving it neutered.

## The tiers

**Tier 1 -- factual summary of the user's own data.**
Restate, list, or total what the household typed or connected. No
derivation beyond arithmetic a person could do by hand on numbers they can
see (sums, counts, date lists). No framing, no judgment.
*Example: "Recurring bills entered: $420. Recurring income entered: $1,200."*

**Tier 2 -- detection, or user-driven "what-if" arithmetic.**
A derived number computed purely from the household's own entered figures
(a ratio, a subtraction, a runway-in-months calculation), OR an explicitly
user-initiated calculation ("if I spent $X this week, what would be left").
The output is a number or a short factual description of a pattern --
never a verdict, a label like "safe"/"tight"/"on track", or a recommendation
about what to do with the number.
*Example: "Recurring bills entered are about 42% of recurring income
entered." "Cash entered minus bills typed for the next 30 days: $380."*

**Tier 3 -- everyday-spending alternatives, needing legal sign-off before
shipping.**
Suggesting a cheaper everyday option (a provider switch, a subscription to
reconsider, a lower-cost merchant). Not currently built, and not to be
built without an explicit legal/compliance review first -- this is the
tier most likely to drift into regulated advice if the wording isn't
watched carefully.

**Red line -- never.**
Recommending or comparing financial products (insurance, loans, credit,
bank accounts, super, investments). Judging affordability or suitability.
Giving debt, tax, or super strategy. Choosing a course of action on the
user's behalf (decide now / delay / gather more information). No feature
flag, opt-in, or wording change moves something out of this tier -- it
simply isn't built.

## Never revive

These three were live in this product before 2026-10-23 and were removed
because they are Red line, not because they were unpolished. Don't bring
any of them back under a different name, flag, or wording:

- **Affordability verdict** -- a tiered judgment (`fits_comfortably` /
  `tight` / `doesn't_fit_now`) on whether a typed amount "fits," generated
  from cash/income ratios with pressure-based downgrades.
- **`suggested_default` decision recommendation** -- the AI choosing
  `decide_now` / `delay` / `gather_info` for a logged decision, with
  "reasoning" and a computed review cadence.
- **Recommend-if-asked** -- a conversational escape hatch that let the AI
  recommend a choice as long as the user explicitly asked for one. The
  current rule is unconditional: *"Do not recommend, even if the person
  asks for a recommendation."*

## The eval suite is the gate

`lib/ai/aiGuardEvalSuite.test.ts` is the one eval suite every AI-adjacent
change must pass -- input-guard prompts (`guardAskQuestion`/`guardAiInput`)
and output-guard backstop checks (`screenAiOutput`), run via `npm test`
like everything else. It currently covers 39 input cases and 10 output
cases (the pre-existing 19 + 6 from `askGuard.test.ts`/`outputGuard.test.ts`,
plus 20 adversarial prompts added 2026-10-29 probing synonym gaps,
role-play/jailbreak framing, prompt injection, third-person displacement,
obfuscation, and compound messages).

Before shipping any new AI-adjacent surface (a new Ask mode, a new prompt,
a new output field that could carry model text):

1. Add prompts to the eval suite that specifically probe the new surface.
2. Run `npm test` -- every case must end in a refusal, or an answer built
   only from figures/dates/items the household typed.
3. If a gap is found, prefer tightening the **input** allow-list
   (`lib/ask/askGuard.ts`'s `ALLOW` patterns are a narrow, fail-closed
   whitelist -- this is why growing the block-list rarely matters there)
   over growing a block-list. The **output** guard
   (`lib/ai/outputGuard.ts`) is inherently block-list-based, since it
   scans free-text model output rather than matching against a fixed set
   of permitted phrasings -- gaps there are closed by adding patterns.

## Re-introduction order for Tier 1/2 (not yet scheduled, for reference)

If any removed Tier 1/2 feature is revived, it ships behind its own new
per-user flag (default off), in this order, each phase gated on eval-suite
coverage for that feature's specific wording:

1. Pure listings already Tier 1 (upcoming bills/income within a window).
2. Single ratios on the household's own figures (% of income committed,
   months of runway), reworded to strip judgment language ("committed",
   "room", "buffer").
3. Plain subtraction (cash minus a bill window), no visual allocation bar,
   no "flexible"/"planned" labels.
4. User-initiated "what if I spent $X" arithmetic -- result only, no
   fits/tight/doesn't-fit verdict labels.
5. Pattern-derived estimates (e.g. a grocery estimate from transaction
   history) -- ships last, must show its own basis inline.
