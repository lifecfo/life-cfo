"use client";

import Link from "next/link";

import { Page } from "@/components/Page";
import { Card, CardContent, Chip } from "@/components/ui";
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

const lifeCfoSections = [
  {
    title: "Type what you want to keep",
    body: "Enter bills, income, a budget, goals, and notes. This beta does not connect banks.",
  },
  {
    title: "See the figures",
    body: `${PRODUCT_NAME} shows the sums, dates, and lists you typed.`,
  },
  {
    title: "Ask about those figures",
    body: "You can ask what was entered, such as which bills are listed and when they are due. Ask can restate a note and list the factors you raised. It does not say what you should do.",
  },
  {
    title: "Who it is for",
    body: "Adults who live in Australia. It is not for choosing a product, managing debt, or getting investment or super guidance.",
  },
  {
    title: "If you need help",
    body: "For free official money information, see moneysmart.gov.au. If you are worried about debt, call the National Debt Helpline on 1800 007 007. If you are in danger, call 000.",
  },
];

export default function HowLifeCfoWorksPage() {
  return (
    <Page title={`How ${PRODUCT_NAME} works`} subtitle={PRODUCT_DESCRIPTOR}>
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardContent className="space-y-6 p-6">
            {lifeCfoSections.map((section) => (
              <section key={section.title} className="space-y-1">
                <h2 className="text-base font-semibold text-zinc-900">
                  {section.title}
                </h2>
                <p className="text-sm leading-6 text-zinc-600">{section.body}</p>
              </section>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Link href="/money/setup">
            <Chip>Start here</Chip>
          </Link>
          <Link href="/fine-print">
            <Chip>Important information</Chip>
          </Link>
        </div>
      </div>
    </Page>
  );
}
