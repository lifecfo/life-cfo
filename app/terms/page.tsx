import { LegalSections } from "@/components/legal/LegalSections";
import { LEGAL_UPDATED, TERMS_TITLE, termsLead, termsSections } from "@/lib/legal/betaLegalCopy";

export const metadata = {
  title: "Terms | Life CFO",
};

export default function TermsPage() {
  return <LegalSections title={TERMS_TITLE} updated={LEGAL_UPDATED} intro={termsLead} sections={termsSections} />;
}
