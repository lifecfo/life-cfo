import { PRODUCT_DESCRIPTOR } from "@/lib/brand";

export const LEGAL_UPDATED = "23 October 2026";

export const PRODUCT_POSITIONING = PRODUCT_DESCRIPTOR;

export type LegalSection = { title: string; body: string };

export const importantInformationSections: LegalSection[] = [
  {
    title: "What Life CFO does",
    body: "Life CFO turns notes a household types into one shared picture: bills, renewals, dates, and who is looking after each item. Reminders for those dates stay in the app, where every household member can see them. It shows the figures, dates, and lists that were typed. It is not a budgeting score.",
  },
  {
    title: "What Life CFO does not do",
    body: "Life CFO does not connect banks in this beta. It does not move money or take payments. It does not recommend products, say whether something is affordable or suitable, or tell you what to do about debt, credit, super, tax, or investments.",
  },
  {
    title: "Who it is for",
    body: "It is for adults who live in Australia, including couples and families where one person carries the money and admin load, and households that do not want to share bank logins. You confirm that you are 18 or older and that you live in Australia before you use it.",
  },
  {
    title: "Who it is not for",
    body: "It is not for anyone under 18 or anyone who does not live in Australia. It is not for people who want a bank connection, a budget score, or someone to say what they should do. It is not a bank, lender, broker, or financial adviser. If you need that help, use the free official services below.",
  },
  {
    title: "If you need help now",
    body: "If you are in immediate danger, call 000. For crisis support in Australia, Lifeline is 13 11 14 (lifeline.org.au). If you are worried about debt, the National Debt Helpline is 1800 007 007. For free official money information, see Moneysmart at moneysmart.gov.au.",
  },
  {
    title: "Your information",
    body: "You choose what to type. Other people in your household may see what that household stores. Do not type something you do not want those people to see. You can download a copy of your data and delete your account from Settings.",
  },
  {
    title: "Sample data",
    body: "If a screen says the figures are sample data, they come from a demo household. They are not your money.",
  },
  {
    title: "Ask",
    body: "Ask lists figures, dates, and items you typed. It can also turn messy notes into a structured list for you to confirm, summarise what was typed, explain those figures in plain language, or restate a decision with the factors and questions you raised and a review date you named. It does not choose an option. It refuses recommendations, product names, and questions about debt, credit, super, insurance, and investments, and points you to Moneysmart and the National Debt Helpline. AI is off until you opt in and the operator switches it on. If it is on, the text and the household figures needed to answer are sent to OpenAI or Anthropic, which may process them outside Australia. These providers don't use that information to train their models under their standard business terms. They may keep it for up to 30 days for safety and abuse monitoring.",
  },
];

export const TERMS_TITLE = "Terms of Use – Life CFO (invite-only beta)";

export const termsLead = `These terms are an agreement between you and Emily Manungo, trading as Life CFO, a sole trader in Tasmania, Australia (ABN 75 107 976 704) ("we", "us"). By creating an account or using Life CFO, you agree to these terms. Please also read our Privacy Policy and the "Before you start" information.

Contact: **admin@life-cfo.com**`;

export const termsSections: LegalSection[] = [
  {
    title: "1. What Life CFO is",
    body: `Life CFO is a household record-keeping web app. It lets a household keep one shared record of its bills, income, renewals, dates, receipts and notes, and shows totals, dates and lists based on what the household adds.

Life CFO does **not**:
- connect to banks or ask for banking passwords
- hold, move or pay money
- recommend financial products, or tell you what you should do about debt, credit, super, insurance, tax or investments
- check whether anything is affordable or suitable for you.`,
  },
  {
    title: "2. Information only, not advice",
    body: `Life CFO shows factual information: the figures, dates and lists you or your household entered or confirmed, and sums and summaries of them. It doesn't consider your objectives, financial situation or needs, and it isn't financial, credit, tax or legal advice. You decide what any figure means and what to do.

For free, independent help:
- Moneysmart: moneysmart.gov.au
- National Debt Helpline: 1800 007 007
- A licensed adviser, for personal advice.`,
  },
  {
    title: "3. This is a beta",
    body: `Life CFO is an early, invite-only beta and is free during the beta.
- It may have bugs, change as we improve it, or be unavailable at times.
- We'll try to tell you in advance about big changes that affect you.
- Please keep your own copies of important records, such as tax receipts. Life CFO isn't designed to be your only or official record.`,
  },
  {
    title: "4. Who can use it",
    body: "You must be 18 or older and live in Australia. You must use Life CFO for your own household, not for a business or for clients. You confirm these things when you sign up. We don't verify your identity, so please be honest.",
  },
  {
    title: "5. Your account and household",
    body: `- Keep your sign-in secure. Tell us at once if you think someone else has accessed your account.
- Everyone in a household can see and edit what that household stores. Only invite people you're comfortable sharing it with.
- Only add information about other people (for example a partner, children, or people named in transactions or receipts) if you're allowed to. Only upload a bank file if you're allowed to share that account's transactions with your household.`,
  },
  {
    title: "6. Acceptable use",
    body: `Please don't:
- access, or try to access, another household's information, or test or bypass our security
- upload anything unlawful, harmful or infringing, or malware
- use Life CFO to harass, monitor or control another person without their knowledge
- overload the service, scrape it or use automated tools on it, or resell it
- store information you're not allowed to hold, such as other people's banking passwords, tax file numbers or ID documents.`,
  },
  {
    title: "7. Your content",
    body: `- You own what you add.
- You give us permission to store, copy, process and display it only as needed to run Life CFO for you and your household, including sending it to AI providers if AI is on. This permission ends when the content is deleted, except for short-term copies held as described in our Privacy Policy.
- We don't sell your content or use it for advertising.
- You're responsible for making sure you're allowed to add what you add.`,
  },
  {
    title: "8. AI features",
    body: "AI is optional and only works if you turn it on and we've switched it on for the beta. AI can make mistakes: it can misread a receipt, put something in the wrong category, or summarise wrongly. Always check AI results before you confirm them. AI in Life CFO organises and explains your own information. It won't give recommendations. How AI handles your information is explained in the Privacy Policy.",
  },
  {
    title: "9. Our content",
    body: "We, or our licensors, own the Life CFO name, design, software and sample data. You may use them only to use Life CFO under these terms.",
  },
  {
    title: "10. Accuracy",
    body: "Figures and summaries depend on what was added and how it was read, so they can be wrong or incomplete. Please check anything important against your bills, statements or other source documents.",
  },
  {
    title: "11. Your consumer rights",
    body: `Under the Australian Consumer Law you may have consumer guarantees, such as a right to services provided with due care and skill. They can't be excluded, and nothing in these terms excludes, restricts or changes them, or any other right you have by law that can't be excluded.

Subject to those rights:
- We provide the beta as it is, without promises beyond those the law requires.
- We aren't responsible for loss caused by:
  - things outside our reasonable control
  - information you or your household entered, or decisions you made using Life CFO
  - your breach of these terms.
- We aren't responsible for loss that wasn't reasonably foreseeable.

This doesn't limit our responsibility for loss caused by our own negligence, fraud or breach of the law, to the extent the law doesn't allow it to be limited.`,
  },
  {
    title: "12. Ending or pausing your use",
    body: `- **You** can stop using Life CFO at any time. You can download your data and delete your account in Settings.
- **We** may suspend or close an account if it seriously or repeatedly breaks these terms, puts the service or other people at risk, or the law requires it. Where it's reasonable, we'll tell you first and give you a chance to fix the problem.
- **If we end the beta or close Life CFO,** we'll give you at least 30 days' notice by email where possible, so you can download your data.`,
  },
  {
    title: "13. Changes to these terms",
    body: "We may update these terms as Life CFO changes, or to meet legal requirements. For a change that significantly affects you, we'll tell you in the app or by email before it applies and ask you to accept the new terms. If you don't agree, you can stop using Life CFO and delete your account. We won't charge you without your clear agreement (see section 14).",
  },
  {
    title: "14. Paid plans (not active yet)",
    body: `Life CFO is free during the beta, and we won't charge you without your clear agreement. If we introduce a paid plan (we expect about A$7 a month or A$59 a year), we'll do the following before you're charged:
- tell you the price, what's included, how billing and renewal work and how to cancel
- ask you to choose the plan yourself
- let you continue on any free option we offer, or delete your account without being charged.

Before a paid plan starts, we'll update these terms to set out cancellation and refunds, with notice as described above. Nothing in these terms limits your rights to a refund under the Australian Consumer Law.`,
  },
  {
    title: "15. Emails",
    body: "We'll send you emails needed to run your account, such as sign-in links, invites and important notices. We'll only send product news if you agree, and you can unsubscribe at any time.",
  },
  {
    title: "16. General",
    body: `- These terms are governed by the laws of Tasmania, Australia. You and we can bring disputes in the courts of Tasmania, or in any other Australian court that has jurisdiction.
- If you have a problem, please email admin@life-cfo.com first, and we'll try to fix it with you.
- If part of these terms can't be enforced, the rest still applies.
- These terms, the Privacy Policy and the "Before you start" information are the whole agreement about the beta.`,
  },
];

export const PRIVACY_TITLE = "Privacy Policy – Life CFO (invite-only beta)";

export const privacyLead =
  "This policy explains how Life CFO handles personal information. We aim to follow the Australian Privacy Principles (APPs) in the Privacy Act 1988 (Cth).";

export const privacySections: LegalSection[] = [
  {
    title: "Who we are",
    body: `Life CFO is a household record-keeping web app at life-cfo.com. It is run by Emily Manungo, a sole trader in Tasmania, Australia (ABN 75 107 976 704). "We" and "us" in this policy mean Life CFO.

Contact: **admin@life-cfo.com**`,
  },
  {
    title: "What Life CFO is (and isn't)",
    body: "Life CFO helps a household keep one shared record of its bills, income, renewals, dates and notes. People add their own figures by typing, pasting, photographing a receipt or bill, or uploading a bank file or spreadsheet. Life CFO does not connect to banks, ask for banking passwords, move money or give financial advice.",
  },
  {
    title: "What we collect",
    body: `**Account details**
- Your email address and sign-in details. Your password, if you use one, is held in scrambled (hashed) form by our sign-in provider. We never see it.
- Your invite code.

**Confirmations at sign-up**
- That you are 18 or older and live in Australia.
- The name you type to accept the terms, and a copy of the terms you accepted, with the date.
- Your birth year, used once to check you are 18 or older. We don't save it.
- Your browser's time zone and language, which may be read to show a warning if they don't look Australian. We don't save them.

**What you and your household add**
- Household names, bills, income, renewals, due dates, reminders, notes, decision notes and categories.
- Photos of receipts or bills, and the text read from them.
- Rows from a bank file (CSV): only the date, description and amount, plus an account nickname you choose.
- Rows from a spreadsheet that you confirm.
- Questions you ask in Ask and the answers shown, if you use it.

**Information about other people.** What you add may include information about other people, such as your partner, children, pets, or people and businesses named in a transaction or receipt. See "Information about other people" below.

**Usage and technical information**
- Simple usage events stored in our own database: signing up, finishing setup, using the brain dump, inviting a household member, and a daily note that a household opened the app. We use these counts to see whether the beta is useful. We don't use a separate analytics company or advertising trackers.
- Technical logs kept by our hosting providers, such as IP address, browser type, time and error details. These keep the service running and secure.

**Waitlist.** If you join the public waitlist, we collect only your email address.

**What we don't collect**
- Bank logins or passwords.
- Account numbers, BSBs or running balances from bank files. These are removed before anything is saved.
- Tax file numbers or government ID numbers. Please don't type them in.`,
  },
  {
    title: "Why we collect it",
    body: `We use personal information to:
- create and run your account and household
- show your household the information it has added
- read receipts and organise or summarise your own figures, but only if you've turned AI on (see below)
- keep the service secure and fix problems
- see whether households keep using the beta, using counts only
- email you about your account, such as sign-in links, household invites and important service or policy changes
- email waitlist members when a place opens
- respond to requests and complaints, and meet legal obligations.

We don't sell personal information, use it for advertising, or use it to recommend financial products. We don't use automated programs to make decisions that significantly affect your rights or interests.`,
  },
  {
    title: "Information about other people",
    body: `Life CFO is shared by a household, so you may add information about other people.
- Only add information about someone else if you are allowed to. Let other adults in your household know you use Life CFO and that this policy explains how their information is handled.
- Before you upload a bank file, you confirm that you are allowed to share that account's transactions with everyone in your household.
- Avoid adding more about other people than the household needs. For example, don't add children's health details.`,
  },
  {
    title: "Household sharing",
    body: "Everyone you invite to your household can see and edit what's stored for that household. This includes entries, photos, imported rows, reminders and decision notes. Only invite people you're comfortable seeing this information. A household owner can remove a member on the Household page.",
  },
  {
    title: "AI (optional)",
    body: `AI is off unless two things are true: you've turned it on in Settings, and we've switched it on for the beta. If AI is on, the text, photo or household figures needed for the task are sent to an AI provider, OpenAI or Anthropic, in the United States. They're sent to read a receipt, organise a brain dump, summarise or explain your figures, or answer a question in Ask.

- These providers don't use the information to train their models under their standard business terms.
- They may keep it for up to 30 days for safety and abuse monitoring, and longer if their systems flag it or the law requires.
- AI can be wrong. Always check figures it reads or organises before you confirm them.
- AI in Life CFO lists, organises and explains your own information. It doesn't give recommendations or financial advice.
- You can turn AI off at any time in Settings. Turning it off stops future sending. It doesn't recall information already sent.`,
  },
  {
    title: "Receipt and bill photos",
    body: `Photos are stored privately for your household. Only signed-in members of your household can view them, through short-lived links.
- Photos can show card digits, addresses, loyalty numbers or other people's names. Please crop or cover anything you don't need.
- You can delete a photo at any time.
- A photo is read by AI only if AI is on, as described above.`,
  },
  {
    title: "Bank files and spreadsheets",
    body: `You choose when to upload a file.
- Life CFO reads the file while processing your upload and doesn't keep the file itself.
- From a bank file, it saves only the date, description and amount of each row. Account numbers, BSBs and balances are removed.
- From a spreadsheet, rows are saved only after you confirm them.
- We never ask for your banking password and never log in to your bank.`,
  },
  {
    title: "Who we share information with",
    body: `We share personal information only with the service providers who help us run Life CFO, and only as needed:

| Provider | What it does | Where information is held or processed |
|---|---|---|
| Supabase Inc. | Database, sign-in and photo storage | Singapore (data stored in the ap-southeast-1 region). Supabase is a US company and may access data from other countries for support. |
| Vercel Inc. | Hosts the website and app | App functions run in Sydney, Australia. Some logs and website delivery may be handled in other countries, including the United States. |
| OpenAI and Anthropic | AI features, only if AI is on | United States |
| Our email provider (we will name it here before we use one other than Supabase) | Sends sign-in, invite and waitlist emails | Usually the United States |

We may also disclose information if the law requires it, or to protect someone's safety.`,
  },
  {
    title: "Information held overseas",
    body: "Your household information is stored in Singapore, and some processing happens in the United States, as listed above. We choose established providers and use their security settings. These providers aren't bound by Australian privacy law, though, and we can't guarantee they'll handle information exactly as the APPs require. By using Life CFO, you agree to your information being handled overseas as described here. If you don't want that, please don't use Life CFO.",
  },
  {
    title: "How we keep information secure",
    body: `- Data is encrypted in transit (HTTPS) and at rest by our providers.
- Database rules let each household's members see only their own household's data.
- Photos are kept in a private storage area.
- Only the operator can access admin tools, using multi-factor authentication.
- We keep collection to a minimum. For example, raw bank files and birth years are not stored.

No online service is perfectly secure. Please use a strong, unique password, and don't share your sign-in.`,
  },
  {
    title: "If there is a data breach",
    body: "If we suspect a data breach, we'll act quickly to contain it and will assess it within 30 days. If it's likely to cause someone serious harm, we'll tell the people affected and the Office of the Australian Information Commissioner (OAIC) as soon as practicable, including what happened and what you can do. We do this even though, as a small business, the Notifiable Data Breaches scheme may not legally apply to us.",
  },
  {
    title: "How long we keep information",
    body: `| Information | How long |
|---|---|
| Account and household data | Until you delete it or delete your account. |
| Photos | Until you delete the photo or your account, unless a shared household still holds them (see below). |
| Accepted-terms records and usage counts | Until you delete your account. |
| Waitlist emails | Until you unsubscribe, ask us to remove you, or the waitlist closes, and no more than 12 months after the beta ends. |
| Copies held by AI providers | Up to 30 days (longer if flagged or legally required). |
| Hosting logs | Short periods set by our providers, usually days to weeks. |
| Backups | Backups held by our providers, if any, are overwritten on their own schedule and aren't restored except to recover the service. |`,
  },
  {
    title: "Your choices: access, correction, download and deletion",
    body: `- **See and correct:** you can view and edit your household's information in the app at any time.
- **Download:** you can download a copy of the information your account can see from Settings. Photos are listed but not included in the download. Ask us if you need copies.
- **Delete:** you can delete your account from Settings. This removes your sign-in, your profile, your terms records, your usage counts, and any household (including its photos) where you are the only member.
  - If you share a household, the information that household holds stays for the other members.
  - If you're the only owner of a household with other members, you'll need to make someone else an owner, or remove the members, before you can delete your account.
- **Ask us:** you can email admin@life-cfo.com to ask for access to, or correction of, any personal information we hold about you, including if you aren't a user but think a user has added information about you. It's free.
  - We'll reply within 30 days, and may need to confirm your identity first.
  - If we can't do what you ask, we'll explain why in writing.`,
  },
  {
    title: "Emails",
    body: "We send account emails, such as sign-in links, invites and important notices, because they're needed to run the service. We send waitlist and product update emails only to people who asked for them. Every one of these includes a way to unsubscribe, and we act on it within 5 working days.",
  },
  {
    title: "Complaints",
    body: `If you have a privacy concern, email admin@life-cfo.com.
- We'll acknowledge it within 7 days and aim to respond fully within 30 days.
- If you're not satisfied, you can contact the Office of the Australian Information Commissioner at oaic.gov.au or on 1300 363 992.`,
  },
  {
    title: "Changes to this policy",
    body: "If we make a significant change, we'll show it in the app and ask you to review it before you keep using Life CFO. The date at the top shows the latest version.",
  },
];

function renderDocument(heading: string, lead: string, sections: LegalSection[]): string {
  return [heading, lead, ...sections.flatMap((section) => [section.title, section.body])].join("\n");
}

function renderSections(heading: string, sections: LegalSection[]): string {
  return [heading, ...sections.flatMap((section) => [section.title, section.body])].join("\n");
}

/** Stable text stored with each acceptance. Any change produces a new hash. */
export function legalPackCanonicalText(): string {
  return [
    `Last updated ${LEGAL_UPDATED}`,
    PRODUCT_POSITIONING,
    renderSections("Important information", importantInformationSections),
    renderDocument(TERMS_TITLE, termsLead, termsSections),
    renderDocument(PRIVACY_TITLE, privacyLead, privacySections),
  ].join("\n\n");
}
