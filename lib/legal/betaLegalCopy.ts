export const LEGAL_UPDATED = "23 October 2026";

export const PRODUCT_POSITIONING =
  "Life CFO organises what a household types. It does not connect banks or tell you what to do.";

export type LegalSection = { title: string; body: string };

export const importantInformationSections: LegalSection[] = [
  {
    title: "What Life CFO does",
    body: "Life CFO organises what a household types: bills, income, a budget, goals, family notes, and decisions. It shows those figures, dates, and lists back to the household.",
  },
  {
    title: "What Life CFO does not do",
    body: "Life CFO does not connect banks in this beta. It does not move money or take payments. It does not recommend products, say whether something is affordable or suitable, or tell you what to do about debt, credit, super, tax, or investments.",
  },
  {
    title: "Who it is for",
    body: "It is for adults who live in Australia and want a private place to type household figures. You confirm that you are 18 or older and that you live in Australia before you use it.",
  },
  {
    title: "Who it is not for",
    body: "It is not for anyone under 18. It is not a bank, lender, broker, or financial adviser. It is not for choosing a product, getting out of debt, or deciding whether you can afford something. If you need that help, use the free official services below.",
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
    body: "Ask lists figures, dates, and items you typed. It refuses questions about what you should do, products, debt, super, and investments, and points you to Moneysmart and, for debt, the National Debt Helpline. An optional AI answer is off unless you turn it on in Settings. If you turn it on, that question and the household figures needed to answer it are sent to OpenAI or Anthropic, which may process them outside Australia.",
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
    body: "We collect the email address and sign-in details you use for your account, handled by our authentication provider. We collect information you type, such as household names, bills, income, budget items, goals, family and pet notes, and decisions. We collect the confirmations you give (that you are 18 or older, that you live in Australia, and that you accept these terms) and a copy of the text you accepted. We collect technical logs needed to run and protect the service. We do not ask you to connect a bank in this beta, and we do not collect bank passwords.",
  },
  {
    title: "Why we collect it",
    body: "We use this information to run your account, show your household what was typed, keep the service secure, and honour a deletion or export request. We do not sell personal information. We do not use it to recommend products or to decide whether something is suitable for you.",
  },
  {
    title: "Household sharing",
    body: "People you add to a household may see information stored for that household. Where the product has a visibility setting, it applies to accounts marked shared, balance only, or private.",
  },
  {
    title: "Ask and overseas processing",
    body: "AI Ask is off unless you turn it on. If you leave it off, your questions are not sent to an AI provider. If you turn it on, we send your question and selected household figures to the configured AI provider, OpenAI or Anthropic. Those providers may process that information outside Australia. Hosting and database providers (Vercel and Supabase) may also process account and household information outside Australia. You can turn AI Ask off again at any time in Settings.",
  },
  {
    title: "Access, correction, export, and deletion",
    body: "You can see and edit what you typed in the app. You can download a copy of your data from Settings. You can delete your account from Settings. Deletion removes the account and the household data that only you hold. If you are the only owner of a household that still has other members, you need to add another owner or remove those members first. If other people share a household and you are not the only owner, deleting your account removes your membership and what you personally stored. Information the household still needs can remain for the other members. A bank connection, if a developer has one, has to be cleared before deletion.",
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
