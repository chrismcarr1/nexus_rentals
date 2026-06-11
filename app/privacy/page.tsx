import Link from "next/link";

import { LegalPageShell, LegalSection } from "@/components/legal-page";
import { MINIMUM_ACCOUNT_AGE, PRIVACY_EMAIL, PRIVACY_VERSION } from "@/lib/legal";

export const metadata = { title: "Privacy Policy - Nexus Rentals" };

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      effectiveDate={PRIVACY_VERSION}
      description="This Privacy Policy explains what information Nexus Rentals collects, how it is used, and the choices you have. It applies to the Nexus Rentals property management software."
    >
      <LegalSection title="1. Information we collect">
        <p>
          We collect the information you provide when you create and use an account: name, email address, phone
          number, organization details, mailing address, and date of birth (used only to verify that you are at
          least {MINIMUM_ACCOUNT_AGE} years old). We also store the rental records you and your organization
          enter: properties, units, leases, charges, maintenance requests, documents, and messages.
        </p>
        <p>
          When you accept our legal terms, we record the version accepted, the time of acceptance, and, where
          available, the IP address and browser user agent used, as an audit record of your consent.
        </p>
      </LegalSection>

      <LegalSection title="2. How we use information">
        <p>
          We use your information to operate the service: authenticating you, showing your rental records to the
          people they belong to, sending service emails, processing payments through our payment processor, and
          keeping the service secure. We do not sell your personal information.
        </p>
        <p>
          Your date of birth is visible only to you and to system administration where strictly necessary. It is
          not shown to landlords, managers, tenants, or other users, and it is not used for analytics.
        </p>
      </LegalSection>

      <LegalSection title="3. Payments">
        <p>
          Online payments are processed by third-party payment processors (currently Stripe). Payment card and
          bank details are provided directly to the processor and are handled under its privacy policy. Nexus
          Rentals is not an escrow service, bank, or trust account.
        </p>
      </LegalSection>

      <LegalSection title="4. Children">
        <p>
          Nexus Rentals is not directed to children. We do not knowingly allow anyone under{" "}
          {MINIMUM_ACCOUNT_AGE} years old to create an account, and we delete accounts that we learn belong to
          users under {MINIMUM_ACCOUNT_AGE}.
        </p>
      </LegalSection>

      <LegalSection title="5. Your rights and choices">
        <p>
          You may request access to, correction of, deletion of, or an export of your personal information by
          contacting us at <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold underline">{PRIVACY_EMAIL}</a>{" "}
          or through the <Link href="/privacy-request" className="font-semibold underline">privacy request page</Link>.
          We will respond consistent with applicable law. Note that some records (for example, payment records your
          landlord is required to keep) may be retained where the law allows or requires it.
        </p>
      </LegalSection>

      <LegalSection title="6. Security and retention">
        <p>
          We use industry-standard safeguards such as encrypted connections, hashed passwords, and role-based
          access controls. We retain information for as long as your account is active or as needed to provide
          the service, comply with legal obligations, and resolve disputes.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. When we make material changes, we will require you
          to review and accept the updated policy before continuing to use the service.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Privacy questions and requests:{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="font-semibold underline">{PRIVACY_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
