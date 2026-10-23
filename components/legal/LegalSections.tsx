import type { LegalSection } from "@/lib/legal/betaLegalCopy";

export function LegalSections({
  updated,
  intro,
  sections,
}: {
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-zinc-500">Last updated {updated}</p>
      <p className="mt-4 text-base leading-7 text-zinc-800">{intro}</p>
      <div className="mt-8 space-y-6">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-lg font-semibold text-zinc-950">{section.title}</h2>
            <p className="text-sm leading-6 text-zinc-700">{section.body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
