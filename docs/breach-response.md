# Life CFO – data breach response plan (sole operator)

This is the plan for when you suspect personal information has been lost, accessed or shared without permission. That could be a leaked key, a database rule bug, a household seeing another household's data, a hacked admin account, or a lost laptop that's still signed in. Follow the OAIC's steps: **Contain → Assess → Notify → Review.** It's a plain-English plan, not legal advice.

## 1. Contain (same day)
- **Stop the leak.** Rotate any exposed keys: Supabase service role key, Vercel env vars, OpenAI/Anthropic keys, GitHub tokens.
- **Switch off the affected feature.** Turn AI off with `LIFE_CFO_AI_ENABLED`, disable the route, or roll back to the last safe Vercel deployment.
- **Lock down accounts.** Change your passwords for Supabase, Vercel, GitHub and email, confirm MFA is on, and sign out other sessions.
- **Don't destroy evidence.** Screenshot or export logs before they expire, because Supabase free plan logs only last about a day.
- **Start the log** (template below).

## 2. Assess (as fast as possible, and finish within 30 days)
- What information was involved? Emails, household figures, receipt photos and names of children are more sensitive than usage counts.
- How many people were affected, and which households?
- Who got it, and is it still exposed?
- **Decide: is serious harm likely?** Think about financial fraud, identity theft, family or domestic violence risk, and embarrassment. If you can't decide, assume yes.
- If you act quickly and fix it so serious harm is no longer likely (for example, a link that was public for minutes and never opened), you may not need to notify. Write down why.

## 3. Notify (as soon as practicable once you've decided serious harm is likely)
- **The OAIC.** Use the online Notifiable Data Breach form: https://www.oaic.gov.au/privacy/notifiable-data-breaches/report-a-data-breach (phone 1300 363 992).
  - The scheme legally binds you only if you're covered by the Privacy Act. Your policy promises you'll follow it anyway.
- **The people affected.** Email them directly from admin@life-cfo.com. Tell them:
  - what happened and when
  - what information was involved
  - what you've done
  - what they should do, such as changing their password, watching for scam emails or calls, or contacting IDCARE
  - how to reach you.
- **Your providers.** If a provider caused the breach or is involved, contact Supabase support, Vercel support, or OpenAI/Anthropic.
- **Other contacts:**
  - **IDCARE:** free identity and cyber support for affected people, 1800 595 160, idcare.org
  - **ReportCyber:** report cybercrime at cyber.gov.au
  - **Police:** if there's theft or extortion
  - **Your insurer:** if you have cyber insurance.

## 4. Review (within 2 weeks of containing it)
- Fix the root cause, add a check or test so it can't happen again, and update the privacy policy if anything changed.

## Breach log template (keep one per incident, even for "no harm" ones)

| Field | Entry |
|---|---|
| Date/time discovered (Australia/Hobart) | |
| How discovered | |
| What happened | |
| Information involved | |
| Households/people affected (count) | |
| Containment steps and times | |
| Serious harm likely? Yes/No, with reasons | |
| Date assessment finished (≤30 days) | |
| OAIC notified? Date and reference | |
| Individuals notified? Date and method | |
| Root-cause fix and date | |
| Follow-up actions | |

Source: OAIC, *Data breach preparation and response*: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/preventing-preparing-for-and-responding-to-data-breaches/data-breach-preparation-and-response
