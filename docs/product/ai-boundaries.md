# Life CFO: the advice line

Not legal advice. This is the working framework. It is to be reviewed once by
a fintech lawyer, and that review then applies to all features.

## The line, in one sentence

Life CFO can organise, summarise, notice and calculate anything about a
household's money, but it must not express an opinion or recommendation
intended to influence a decision about a financial product.

(Basis: Corporations Act s766B financial product advice; personal advice
needs an AFSL; credit assistance needs an ACL; factual information is not
advice under ASIC RG 244 / RG 36; digital advice is covered by RG 255.)

## Question 1: what is it about?

- **Financial products (strict):** insurance, superannuation, investments,
  shares, crypto, loans/mortgages, credit cards, BNPL, bank/savings
  accounts, term deposits.
- **Everyday money (more room):** bills, utilities, phone/internet,
  groceries, subscriptions, rego, childcare, rates, cash-flow timing,
  household admin, who looks after what.

## Question 2: what kind of statement is it?

| Level | Example | Financial products | Everyday money |
|---|---|---|---|
| 1. Facts | "Car insurance $128/month, renews 8 Dec" | Allowed | Allowed |
| 2. Changes & patterns | "Up 15% on last year", "These 4 payments look monthly" | Allowed | Allowed |
| 3. Maths on request | "At $150/week you'd reach $5,000 by 14 June" | Allowed (user's numbers, working shown, no verdict) | Allowed |
| 4. Prompts & questions | "Renews in 3 weeks. Add a reminder?" | Allowed (neutral, never "compare"/"switch"/"shop around") | Allowed |
| 5. Neutral options | "3 streaming services total $52/month. Want to review them?" | Not allowed | Allowed |
| 6. Opinions & verdicts | "That's high", "You can afford it", "Good deal" | Not allowed | Not allowed |
| 7. Recommendations | "Switch insurer", "Pay this card first", "Cancel Netflix" | Not allowed (licence) | Avoid. Phrase as a question at level 5. |

The line: financial products stop at level 4. Everyday money stops at
level 5. Nothing above that without a licence or a licensed partner.

## The 5-question test

Every feature, every AI output, every piece of copy:

1. Is it about a financial product? If yes, stop at facts, changes, maths
   and reminders.
2. Does it judge? Banned words: should, ought, recommend, suggest (as
   advice), better, best, worth it, smart (as judgment), afford,
   affordable, suitable, safe to spend, enough, too much, on track,
   ideally. Rewrite.
3. Could a reasonable person read it as the app telling them what to do
   about a product? Rewrite.
4. Can the user check it against their own numbers? It must be yes.
5. Does the user choose the next step? It must be yes.

## Where Life CFO should be intelligent

All inside the line:

- Smart capture (messy text, email or receipt into a structured
  bill/renewal/reminder)
- Anticipation (upcoming clusters of renewals with totals)
- Memory and change ("since last month...")
- Detection (recurring payments, duplicates, gaps, unassigned items) with
  the user confirming
- What-if arithmetic on request, with no verdict
- Weekly/monthly plain-English digests
- Shared clarity (who looks after what)
- Preparing exports for accountants, brokers and advisers
- General concept explanations linking to Moneysmart

## Language: noticing and organising, not judging and deciding

Fine: "Life CFO noticed / summarised / remembers / keeps track of /
organised."

Not fine: anything that judges or decides for the user.

## Going above the line later

Only via an AFSL authorised-representative arrangement or a licensed
adviser/broker partner referral. That is a separate business decision.

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
like everything else. It currently covers 39 input cases (the pre-existing
19, plus 20 adversarial prompts probing synonym gaps, role-play/jailbreak
framing, prompt injection, third-person displacement, obfuscation, and
compound messages) and 50 output cases: the pre-existing 6, 6 output-guard
backstop checks for the adversarial prompts above, 7 cases for
banned-word-list phrases not previously covered ("safe to spend", "enough"
as a judgment, "too much", "ideally", "shop around", and "pressure" as in
"pressure signal"/"money pressure" -- scoped to that judgment phrasing
rather than the bare word, since "Blood pressure medication"/"Pressure
cooker" are legitimate factual item names), a negative case confirming
"enough" doesn't block a harmless "not enough data yet" disclaimer, 9
negative cases confirming factual bill/provider/item names ("Smart TV
subscription", "On Track Physio", "Pressure cooker", ...) aren't blocked
just for containing a judgment word, 3 cases confirming genuine
insurance/super/investment guidance is still caught, 1 case confirming
a bare topic word with no purpose given is still blocked, and 17 cases
proving the actual shipped copy on the What if? page and the Goals "$X a
month" line passes the guard.

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

## Rule

Every AI change must pass the eval suite. Every new feature or copy change
must pass the 5-question test.
