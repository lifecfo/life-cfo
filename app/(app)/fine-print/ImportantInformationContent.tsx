import Link from "next/link";

import { Card, CardContent } from "@/components/ui";

const sections = [
  {
    title: "What Life CFO does",
    body: "Life CFO helps households understand their money information and think through decisions.",
  },
  {
    title: "What Life CFO does not do",
    body: "Life CFO provides analysis and decision support, not financial, legal, tax, or other professional advice. It does not make decisions for you.",
  },
  {
    title: "Your money data",
    body: "You may connect accounts through Basiq or Plaid, upload bank files, or add information manually. Bank files may contain personal financial information. Only upload files you are comfortable using with Life CFO.",
  },
  {
    title: "Ask and AI",
    body: "Ask may use your question and relevant household information to prepare an answer. Answers may be incomplete or wrong, so check important information before relying on it.",
  },
  {
    title: "Household sharing",
    body: "Other members of your household may be able to see information shared with that household.",
  },
  {
    title: "Your choices",
    body: "You choose what to connect, upload, enter, confirm, and save.",
  },
];

export default function ImportantInformationContent() {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent>
        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} className="space-y-1">
              <h2 className="text-sm font-semibold text-zinc-900">{section.title}</h2>
              <p className="text-sm leading-6 text-zinc-700">{section.body}</p>
            </section>
          ))}

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-900">Privacy and terms</h2>
            <p className="text-sm leading-6 text-zinc-700">
              Read the{" "}
              <Link className="font-medium text-zinc-900 underline underline-offset-2" href="/privacy">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-900">Version and date</h2>
            <div className="text-sm leading-6 text-zinc-700">
              <div>Content version: v1</div>
              <div>Effective date: 1 July 2026</div>
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
