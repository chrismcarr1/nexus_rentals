import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { SubmitButton } from "@/components/ui/submit-button";
import { isSystemAdminEmail } from "@/lib/admin";
import { acceptLegalTermsAction, logoutAction } from "@/lib/actions";
import { getCurrentUser } from "@/lib/auth";
import { MINIMUM_ACCOUNT_AGE, SUPPORT_EMAIL, hasVerifiedAdultBirthDate, requiresLegalAcceptance } from "@/lib/legal";

export const metadata = { title: "Accept terms - Nexus Rentals" };

// Forced acceptance gate for existing users. Uses getCurrentUser() directly
// (not requireUser) because requireUser redirects un-accepted users here.
export default async function LegalAcceptPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (!requiresLegalAcceptance(user)) {
    redirect(isSystemAdminEmail(user.email) ? "/admin" : "/dashboard");
  }

  const params = (await searchParams) ?? {};
  const needsBirthDate = !hasVerifiedAdultBirthDate(user);

  const errorMessage = params.error === "missing-birthdate"
    ? "Enter your date of birth to continue."
    : params.error === "invalid-birthdate"
      ? "Enter a valid date of birth. Future or impossible dates cannot be accepted."
      : params.error === "underage"
        ? `Nexus Rentals accounts are only available to people who are at least ${MINIMUM_ACCOUNT_AGE} years old, so we cannot unlock this account. If you believe this is a mistake, contact ${SUPPORT_EMAIL}.`
        : params.error === "terms-required"
          ? "You must agree to the Terms of Service and Privacy Policy to continue."
          : params.error
            ? "We could not record your acceptance. Please review the form and try again."
            : null;

  return (
    <main className="auth-page">
      <header className="auth-header">
        <span className="auth-brand">
          <span className="auth-brand-mark" aria-hidden="true">N</span>
          <span>Nexus Rentals</span>
        </span>
        <form action={logoutAction}>
          <button type="submit" className="auth-home-link">Sign out</button>
        </form>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-9.5rem)] w-[min(34rem,calc(100%-3rem))] items-center py-10">
        <section className="auth-card">
          <div className="auth-card-header">
            <h2>Review and accept to continue</h2>
            <p>
              Before you can keep using Nexus Rentals, you need to accept our current Terms of Service and
              Privacy Policy and confirm you are at least {MINIMUM_ACCOUNT_AGE} years old.
            </p>
          </div>
          <div className="auth-card-body">
            {errorMessage ? <div className="auth-alert auth-alert-error" role="alert">{errorMessage}</div> : null}

            <div className="auth-assurance !mt-0 !border-t-0 !pt-0">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              <div>
                <strong>Nexus is software only</strong>
                <p>
                  Nexus Rentals provides property management software. It is not a property manager, broker,
                  attorney, escrow service, or screening company, and it does not provide legal advice. Accounts
                  are only available to people who are at least {MINIMUM_ACCOUNT_AGE} years old.
                </p>
              </div>
            </div>

            <form action={acceptLegalTermsAction} className="auth-form mt-5">
              {needsBirthDate ? (
                <label className="block">
                  <span className="field-label">Date of birth</span>
                  <input name="birthDate" type="date" required autoComplete="bday" className="field" max={new Date().toISOString().slice(0, 10)} />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    You must be at least {MINIMUM_ACCOUNT_AGE} years old to use a Nexus Rentals account.
                  </span>
                </label>
              ) : null}

              <label className="flex items-start gap-2.5 text-sm leading-5">
                <input type="checkbox" name="acceptLegal" required className="mt-0.5 shrink-0" />
                <span>
                  I am at least {MINIMUM_ACCOUNT_AGE} years old, and I agree to the{" "}
                  <Link href="/terms" target="_blank" className="font-semibold underline">Terms of Service</Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link>.
                </span>
              </label>

              <SubmitButton pendingLabel="Saving..." className="auth-primary-button">
                Agree and continue
              </SubmitButton>
            </form>
          </div>
          <div className="auth-card-footer">
            <p>
              Questions? Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
