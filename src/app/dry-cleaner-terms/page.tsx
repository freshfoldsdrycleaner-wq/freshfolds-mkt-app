import SitePage from "@/components/SitePage";
import { TermsBody } from "@/components/DryCleanerTermsForm";
import { TERMS_VERSION } from "@/lib/dryCleanerTerms";

export const metadata = { title: "Dry-cleaner partner terms | Fresh Folds" };

export default function Page() {
  return (
    <SitePage title="Dry-cleaner partner terms">
      <p style={{ color: "#64748b", marginBottom: 16 }}>Version {TERMS_VERSION}</p>
      <TermsBody />
    </SitePage>
  );
}
