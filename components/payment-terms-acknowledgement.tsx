import Link from "next/link";

// One-time (per payment-terms version) acknowledgement required before online
// checkout. The server action enforces this (ensurePaymentTermsAccepted); the
// checkbox records consent. Every form that posts a Stripe checkout or Connect
// action must render this when the acting user has not accepted the current
// PAYMENT_TERMS_VERSION, or the action will bounce with payment-terms-required.
export function PaymentTermsAcknowledgement() {
  return (
    <label className="flex items-start gap-2 text-xs leading-5 text-[var(--muted-strong)]">
      <input type="checkbox" name="acceptPaymentTerms" required className="mt-0.5 shrink-0" />
      <span>
        I understand payments are processed by third-party processors and that Nexus is not an escrow service,
        bank, or trust account. I agree to the{" "}
        <Link href="/payment-terms" target="_blank" className="font-semibold underline">Payment Terms</Link>.
      </span>
    </label>
  );
}
