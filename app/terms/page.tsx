import Link from "next/link";

import { LegalPageShell, LegalSection } from "@/components/legal-page";
import { MINIMUM_ACCOUNT_AGE, SUPPORT_EMAIL, TERMS_VERSION } from "@/lib/legal";

export const metadata = { title: "Terms of Service - Nexus Rentals" };

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      effectiveDate={TERMS_VERSION}
      description="These Terms of Service govern your use of the Nexus Rentals property management software. By creating an account or using Nexus Rentals, you agree to these terms."
    >
      <LegalSection title="1. Nexus Rentals is software only">
        <p>
          Nexus Rentals provides software tools for managing properties, units, tenants, leases, rent and payment
          tracking, maintenance requests, documents, messages, and related records. Nexus Rentals is a software
          provider only. It is not a property manager, real estate broker, landlord, attorney, law firm, credit
          bureau, tenant screening company, debt collector, bank, escrow service, or trust account.
        </p>
        <p>Nexus Rentals does not provide legal, tax, financial, or compliance advice.</p>
      </LegalSection>

      <LegalSection title="2. Eligibility and age requirement">
        <p>
          You must be at least {MINIMUM_ACCOUNT_AGE} years old to create or use a Nexus Rentals account. Nexus
          Rentals does not knowingly allow users under {MINIMUM_ACCOUNT_AGE} to create accounts. We may require
          you to verify your date of birth, and we may suspend or close accounts that do not meet this requirement.
        </p>
      </LegalSection>

      <LegalSection title="3. Your responsibilities">
        <p>
          You are solely responsible for how you use the software and for complying with all laws that apply to
          your rental activity, including landlord-tenant, fair housing, security deposit, privacy, payment,
          and tax laws in your jurisdiction. Content you enter into Nexus Rentals (leases, charges, notices,
          messages, documents) is your content and your responsibility.
        </p>
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and for all
          activity that occurs under your account.
        </p>
      </LegalSection>

      <LegalSection title="4. Payments">
        <p>
          Online rent payments are processed by third-party payment processors (currently Stripe). Nexus Rentals
          is not a party to payments between tenants and landlords and does not hold, escrow, or guarantee funds.
          Use of online payments is also subject to the{" "}
          <Link href="/payment-terms" className="font-semibold underline">Payment Terms</Link> and the payment
          processor&apos;s own terms.
        </p>
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>
          You may not use Nexus Rentals to violate any law, infringe the rights of others, transmit malicious
          code, attempt to access other users&apos; data, or interfere with the operation of the service.
        </p>
      </LegalSection>

      <LegalSection title="6. Disclaimers and limitation of liability">
        <p>
          The service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
          express or implied. To the maximum extent permitted by law, Nexus Rentals is not liable for indirect,
          incidental, special, consequential, or punitive damages, or for loss of profits, data, or goodwill,
          arising from your use of the service.
        </p>
      </LegalSection>

      <LegalSection title="7. Changes to these terms">
        <p>
          We may update these Terms of Service from time to time. When we make material changes, we will require
          you to review and accept the updated terms before continuing to use the service. The effective date at
          the top of this page identifies the current version.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
