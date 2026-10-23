import Link from "next/link";

import { Card, CardContent } from "@/components/ui";
import { LEGAL_UPDATED, PRODUCT_POSITIONING, importantInformationSections } from "@/lib/legal/betaLegalCopy";

export default function ImportantInformationContent() {
  return (
    <Card className="border-zinc-200 bg-white">
      <CardContent>
        <div className="space-y-6">
          <p className="text-sm leading-6 text-zinc-800">{PRODUCT_POSITIONING}</p>
          {importantInformationSections.map((section) => (
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
                privacy policy
              </Link>{" "}
              and the{" "}
              <Link className="font-medium text-zinc-900 underline underline-offset-2" href="/terms">
                terms
              </Link>
              .
            </p>
          </section>

          <p className="text-xs text-zinc-500">Last updated {LEGAL_UPDATED}</p>
        </div>
      </CardContent>
    </Card>
  );
}
