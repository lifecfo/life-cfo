import { LegalSections } from "@/components/legal/LegalSections";
import { LEGAL_UPDATED, PRIVACY_TITLE, privacyLead, privacySections } from "@/lib/legal/betaLegalCopy";

export const metadata = {
  title: "Privacy Policy | Life CFO",
};

export default function PrivacyPage() {
  return <LegalSections title={PRIVACY_TITLE} updated={LEGAL_UPDATED} intro={privacyLead} sections={privacySections} />;
}
