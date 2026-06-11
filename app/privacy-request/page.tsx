import Link from "next/link";

import { LegalPageShell, LegalSection } from "@/components/legal-page";
import { PRIVACY_EMAIL, PRIVACY_VERSION } from "@/lib/legal";

export const metadata = { title: "Privacy Requests - Nexus Rentals" };

export default function PrivacyRequestPage() {
  return (
    <LegalPageShell
      title="Privacy Requests"
      effectiveDate={PRIVACY_VERSION}
      description="Use this page to request access to, correction of, deletion of, or an export of your personal information held by Nexus Rentals."
    >
      <LegalSection title="How to make a request">
        <p>
          Email <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold underline">{PRIVACY_EMAIL}</a> from
          the email address on your Nexus Rentals account and tell us which of the following you are requesting:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Access: a summary of the personal information we hold about you.</li>
          <li>Correction: fixing inaccurate account information.</li>
          <li>Deletion: removing your personal information, subject to legally required retention.</li>
          <li>Export: a portable copy of your personal information.</li>
        </ul>
        <p>
          We verify each request against the account email before acting on it and respond consistent with
          applicable law. Some records, such as payment records a landlord is required to keep, may be retained
          where the law allows or requires it.
        </p>
      </LegalSection>

      <LegalSection title="Related policies">
        <p>
          See the <Link href="/privacy" className="font-semibold underline">Privacy Policy</Link> for details on
          what we collect and how it is used, and the{" "}
          <Link href="/terms" className="font-semibold underline">Terms of Service</Link> for the rules that
          govern the service.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
