import { LegalSections } from "@/components/legal/LegalSections";
import { LEGAL_UPDATED, PRODUCT_POSITIONING, privacySections } from "@/lib/legal/betaLegalCopy";

export const metadata = {
  title: "Privacy Policy | Life CFO",
};

export default function PrivacyPage() {
  return (
    <LegalSections
      updated={LEGAL_UPDATED}
      intro={PRODUCT_POSITIONING}
      sections={privacySections}
    />
  );
}
