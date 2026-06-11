import Link from "next/link";

import { AddressFields, MAILING_ADDRESS_FORM_FIELDS } from "@/components/address-fields";
import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { PhoneInput } from "@/components/ui/phone-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signupAction } from "@/lib/actions";
import { getInviteByRawToken, getInviteStatus } from "@/lib/lease-connections";

export default async function SignupPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const inviteToken = params.invite;
  const inviteLookup = inviteToken ? await getInviteByRawToken(inviteToken) : null;
  const inviteEmail = inviteLookup?.invite && getInviteStatus(inviteLookup.invite) === "pending" ? inviteLookup.invite.tenantEmail : "";

  const errorMessage = params.error === "account-exists"
    ? "An account with that email already exists."
    : params.error === "reserved-admin"
      ? "That email is reserved for an approved administrator."
      : params.error === "server"
        ? "We could not create the account right now. Please try again shortly."
        : params.error === "invalid-address"
          ? "Complete each required part of the mailing address."
          : params.error === "missing-birthdate"
            ? "Enter your date of birth to continue."
            : params.error === "invalid-birthdate"
              ? "Enter a valid date of birth. Future or impossible dates cannot be accepted."
              : params.error === "underage"
                ? "You must be at least 18 years old to create a Nexus Rentals account."
                : params.error === "terms-required"
                  ? "You must agree to the Terms of Service and Privacy Policy to create an account."
                  : params.error
                    ? "Review the form and make sure both passwords match."
                    : null;

  return (
    <AuthShell
      wide
      eyebrow={inviteToken ? "Resident invitation" : "Start with Nexus"}
      title={inviteToken ? "Your rental details, in one place." : "Run your rentals with less friction."}
      description={inviteToken
        ? "Create your resident account to stay connected to your lease, payments, maintenance, documents, and messages."
        : "Set up a focused workspace for the properties, residents, payments, and work you manage every day."}
      cardTitle={inviteToken ? "Create your resident account" : "Create your account"}
      cardDescription={inviteToken
        ? "Use the same email address that received the invitation."
        : "A few details are all you need to get started."}
      noteTitle="Built for independent operators"
      note="Nexus helps small and mid-sized landlords stay in control without adding unnecessary complexity."
      footer={(
        <p>
          Already have an account?{" "}
          <Link href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"}>
            Sign in
          </Link>
        </p>
      )}
    >
      {errorMessage ? <div className="auth-alert auth-alert-error" role="alert">{errorMessage}</div> : null}

      <form action={signupAction} className="auth-form auth-form-grid">
        {inviteToken ? (
          <>
            <input type="hidden" name="inviteToken" value={inviteToken} />
            <input type="hidden" name="businessName" value="Resident Account" />
            <input type="hidden" name="role" value="TENANT" />
          </>
        ) : (
          <>
            <label className="block auth-grid-full">
              <span className="field-label">Organization or community name</span>
              <input name="businessName" required minLength={2} autoComplete="organization" className="field" placeholder="Your business or portfolio name" />
            </label>
            <label className="block auth-grid-full">
              <span className="field-label">Account type</span>
              <select name="role" required defaultValue="MANAGER" className="field">
                <option value="MANAGER">Landlord or property manager</option>
                <option value="TENANT">Resident</option>
              </select>
            </label>
          </>
        )}

        <label className="block">
          <span className="field-label">First name</span>
          <input name="firstName" required minLength={2} autoComplete="given-name" className="field" />
        </label>
        <label className="block">
          <span className="field-label">Last name</span>
          <input name="lastName" required minLength={2} autoComplete="family-name" className="field" />
        </label>
        <label className="block">
          <span className="field-label">Email address</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field"
            defaultValue={inviteEmail}
            readOnly={Boolean(inviteEmail)}
          />
        </label>
        <label className="block">
          <span className="field-label">Phone number <span>Optional</span></span>
          <PhoneInput name="phone" />
        </label>
        <PasswordField name="password" required minLength={8} autoComplete="new-password" label="Password" />
        <PasswordField name="confirmPassword" required minLength={8} autoComplete="new-password" label="Confirm password" />

        <label className="block auth-grid-full">
          <span className="field-label">Date of birth</span>
          <input name="birthDate" type="date" required autoComplete="bday" className="field" max={new Date().toISOString().slice(0, 10)} />
          <span className="mt-1 block text-xs text-[var(--muted)]">
            You must be at least 18 years old to create a Nexus Rentals account.
          </span>
        </label>

        <label className="auth-grid-full flex items-start gap-2.5 text-sm leading-5">
          <input type="checkbox" name="acceptLegal" required className="mt-0.5 shrink-0" />
          <span>
            I am at least 18 years old, and I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold underline">Terms of Service</Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link>.
          </span>
        </label>

        <fieldset className="auth-address-section auth-grid-full">
          <legend>Mailing address <span>Optional</span></legend>
          <p>Used only where account or rental records need a mailing address.</p>
          <AddressFields
            fieldNames={MAILING_ADDRESS_FORM_FIELDS}
            required={false}
            className="auth-address-fields"
            inputClassName="field"
          />
        </fieldset>

        <SubmitButton pendingLabel="Creating account..." className="auth-primary-button auth-grid-full">
          Create account
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
