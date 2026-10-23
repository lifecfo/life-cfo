import { LegalSections } from "@/components/legal/LegalSections";
import { LEGAL_UPDATED, PRODUCT_POSITIONING, termsSections } from "@/lib/legal/betaLegalCopy";

export const metadata = {
  title: "Terms | Life CFO",
};

export default function TermsPage() {
  return (
    <LegalSections
      updated={LEGAL_UPDATED}
      intro={PRODUCT_POSITIONING}
      sections={termsSections}
    />
  );
}
