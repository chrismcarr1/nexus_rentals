import Link from "next/link";

import { LegalPageShell, LegalSection } from "@/components/legal-page";
import { PAYMENT_TERMS_VERSION, SUPPORT_EMAIL } from "@/lib/legal";

export const metadata = { title: "Payment Terms - Nexus Rentals" };

export default function PaymentTermsPage() {
  return (
    <LegalPageShell
      title="Payment Terms"
      effectiveDate={PAYMENT_TERMS_VERSION}
      description="These Payment Terms apply when you set up or use online payments in Nexus Rentals. They supplement the Terms of Service."
    >
      <LegalSection title="1. Third-party payment processing">
        <p>
          Online rent and charge payments in Nexus Rentals are processed by third-party payment processors
          (currently Stripe, including Stripe Connect for landlord payouts). When you pay or receive payments
          online, you also agree to the processor&apos;s applicable terms, and your payment details are handled
          directly by the processor.
        </p>
      </LegalSection>

      <LegalSection title="2. Nexus is not an escrow service">
        <p>
          Nexus Rentals is not an escrow service, money transmitter, bank, or trust account. Funds move from the
          payer to the recipient through the payment processor. Nexus Rentals does not hold, control, or guarantee
          funds, and it is not a party to the underlying rental obligation between tenants and landlords.
        </p>
      </LegalSection>

      <LegalSection title="3. Fees">
        <p>
          A platform fee may be added to online payments and is shown in the checkout total before you pay.
          The payment processor may charge its own fees to the receiving account under its agreement with the
          account holder.
        </p>
      </LegalSection>

      <LegalSection title="4. Payment disputes, refunds, and errors">
        <p>
          Disputes about whether rent or other charges are owed are between the tenant and the landlord or
          manager. Refunds, chargebacks, and payment errors are handled through the payment processor&apos;s
          processes and the parties&apos; own agreement. Record-keeping in Nexus Rentals reflects what the parties
          and the processor report; it is not a determination of legal rights.
        </p>
      </LegalSection>

      <LegalSection title="5. Compliance">
        <p>
          Landlords and managers are responsible for ensuring that the charges they create and collect comply
          with applicable law, including limits on fees, deposits, and late charges. See the{" "}
          <Link href="/terms" className="font-semibold underline">Terms of Service</Link> for the full statement
          of user responsibilities.
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <p>
          Questions about these payment terms:{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
