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
    body: "Ask lists figures, dates, and items you typed. It can also turn messy notes into a structured list for you to confirm, summarise what was typed, explain those figures in plain language, or restate a decision with the factors and questions you raised and a review date you named. It does not choose an option. It refuses recommendations, product names, and questions about debt, credit, super, insurance, and investments, and points you to Moneysmart and the National Debt Helpline. AI is off until you opt in and the operator switches it on. If it is on, the text and the household figures needed to answer are sent to OpenAI or Anthropic, which may process them outside Australia. Requests are sent with settings that ask the provider not to store them for training where the provider allows that.",
  },
];

export const termsSections: LegalSection[] = [
  {
    title: "This beta",
    body: "Life CFO is an invite-only beta operated from Australia. It organises information a household types. Access can be withdrawn, and the product can change, while it is in beta. Contact: admin@life-cfo.com.",
  },
  {
    title: "Who may use it",
    body: "You must be 18 or older and live in Australia. You confirm both before you use Life CFO. That confirmation is what you tell us. Life CFO does not check your identity.",
  },
  {
    title: "No advice, no products, and no payments",
    body: "Life CFO shows sums, dates, and lists from what you typed. It does not give personal financial, credit, or investment advice, and it does not recommend a product or say what you should do. This beta does not connect to banks. Life CFO does not move money and does not take payments. You decide what any figure means.",
  },
  {
    title: "Your household",
    body: "You are responsible for the information you type and for inviting only people who should see that household. People you add may see household information.",
  },
  {
    title: "Acceptable use",
    body: "Do not misuse the service, attempt to access another household, or store information you are not allowed to store.",
  },
  {
    title: "Figures can be wrong",
    body: "The beta is provided as available. Figures depend on what was typed and can be wrong or incomplete. Do not use Life CFO as a record for tax, lending, or professional advice. Nothing in these terms takes away rights you have under the Australian Consumer Law that cannot be excluded.",
  },
  {
    title: "Ending your use",
    body: "You can download your data and delete your account from Settings. We may suspend access that breaks these terms or puts the service at risk.",
  },
];

export const privacySections: LegalSection[] = [
  {
    title: "Who we are",
    body: `This policy describes the Life CFO typed-household beta. It was last updated on ${LEGAL_UPDATED}. Life CFO is operated from Australia. Contact: admin@life-cfo.com.`,
  },
  {
    title: "What we collect",
    body: "We collect the email address and sign-in details you use for your account, handled by our authentication provider. We collect information you type, such as household names, bills, renewals, income, dates, notes, and decisions. If you add a photo of a receipt or bill, we store that image in Supabase in the same Sydney region (ap-southeast-2). We collect the confirmations you give (that you are 18 or older, that you live in Australia, and that you accept these terms) and a copy of the text you accepted. We ask for your birth year only to check that you are 18 or older, and we do not store that year. We may look at your browser timezone and language to show a warning if they do not look Australian, and we do not store them. If you join the public waitlist, we store that email address until you ask us to remove it by writing to admin@life-cfo.com. We store usage events in our own database: sign-up, finishing the first setup, using the brain dump, inviting a household member, and a daily note that a household opened the shared picture. We use those counts to see whether households keep using the beta. We do not send them to a separate analytics company. We collect technical logs needed to run and protect the service. We do not ask you to connect a bank in this beta, and we do not collect bank passwords.",
  },
  {
    title: "Why we collect it",
    body: "We use this information to run your account, show your household what was typed, keep the service secure, tell waitlist addresses when a place is open, count whether households keep using the beta, and honour a deletion or export request. We do not sell personal information. We do not use it to recommend products or to decide whether something is suitable for you.",
  },
  {
    title: "Household sharing",
    body: "People you add to a household may see information stored for that household, including items, due-date reminders, and decisions. Where the product has a visibility setting, it applies to accounts marked shared, balance only, or private.",
  },
  {
    title: "Where information is processed",
    body: "This beta is set up so the database is intended to be in Sydney (ap-southeast-2) and the app functions are configured for Sydney (syd1). If those regions are not the ones selected, information may be processed outside Australia. AI is off until you opt in and the operator switches it on. If it is used, OpenAI or Anthropic may process the question and selected household figures outside Australia. A receipt or bill photo is sent to OpenAI or Anthropic only if you opt in and the operator switches AI on. Requests are sent with settings that ask the provider not to store them for training where the provider allows that. You can turn your opt-in off again in Settings.",
  },
  {
    title: "Access, correction, export, and deletion",
    body: "You can see and edit what you typed in the app. You can download a copy of your data from Settings. You can delete your account from Settings. Deletion removes the live account and the live household rows that only you hold. The free Supabase plan does not include dashboard access to automatic backups. Paid plans do: the Pro plan keeps daily backups for 7 days. Supabase has said a free project may still have backups that become available only if the project is upgraded, and that this may stop. Log retention on the free plan is 1 day. A backup a provider keeps, if any, is not guaranteed to be erased the same day you delete the account. A free project pauses after one week without use. If you are the only owner of a household that still has other members, you need to add another owner or remove those members first. If other people share a household and you are not the only owner, deleting your account removes your membership and what you personally stored. Information the household still needs can remain for the other members.",
  },
  {
    title: "Complaints",
    body: "Write to admin@life-cfo.com and we will respond. If you are not satisfied, you can contact the Office of the Australian Information Commissioner (oaic.gov.au).",
  },
];

function renderSections(heading: string, sections: LegalSection[]): string {
  return [heading, ...sections.flatMap((section) => [section.title, section.body])].join("\n");
}

/** Stable text stored with each acceptance. Any change produces a new hash. */
export function legalPackCanonicalText(): string {
  return [
    `Last updated ${LEGAL_UPDATED}`,
    PRODUCT_POSITIONING,
    renderSections("Important information", importantInformationSections),
    renderSections("Terms", termsSections),
    renderSections("Privacy", privacySections),
  ].join("\n\n");
}
