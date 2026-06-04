import Link from "next/link";

import { AddressFields, MAILING_ADDRESS_FORM_FIELDS } from "@/components/address-fields";
import { PasswordField } from "@/components/password-field";
import { signupAction } from "@/lib/actions";

export default async function SignupPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const inviteToken = params.invite;

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <div className="glass card-shadow w-full max-w-3xl rounded-2xl border border-white/60 p-6 sm:p-8 lg:p-10">
        <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Create Account</p>
        <h1 className="mt-3 font-[var(--font-display)] text-4xl">Join Nexus Rentals</h1>
        <p className="mt-3 text-sm text-stone-500">
          {inviteToken ? "Create a tenant account with the same email that received the invite." : "Choose a manager or tenant account. Admin access is reserved for approved organization owners."}
        </p>
        {params.error ? (
          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-stone-900/5 px-4 py-3 text-sm">
            {params.error === "account-exists"
              ? "An account with that email already exists."
              : params.error === "reserved-admin"
                ? "That admin email is reserved. Use the manually provisioned admin account to sign in."
                : params.error === "server"
                  ? "Signup could not reach the hosted database. Check DATABASE_URL in .env.local and Vercel."
                  : params.error === "invalid-address"
                    ? "Enter a complete mailing address with street, city, state, ZIP or postal code, and country."
                  : "Please complete all required fields and make sure both passwords match."}
          </div>
        ) : null}
        <form action={signupAction} className="form-grid-2 mt-8">
          {inviteToken ? (
            <>
              <input type="hidden" name="inviteToken" value={inviteToken} />
              <input type="hidden" name="businessName" value="Resident Account" />
              <input type="hidden" name="role" value="TENANT" />
            </>
          ) : (
            <>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium">Organization or community name</span>
                <input name="businessName" required minLength={2} className="field" />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium">Account type</span>
                <select name="role" required defaultValue="MANAGER" className="field">
                  <option value="MANAGER">Manager</option>
                  <option value="TENANT">Tenant</option>
                </select>
              </label>
            </>
          )}
          <label className="block">
            <span className="mb-2 block text-sm font-medium">First name</span>
            <input name="firstName" required minLength={2} className="field" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Last name</span>
            <input name="lastName" required minLength={2} className="field" />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Email</span>
            <input name="email" type="email" required className="field" />
          </label>
          <PasswordField name="password" required minLength={8} label="Password" />
          <PasswordField name="confirmPassword" required minLength={8} label="Confirm password" />
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Phone</span>
            <input name="phone" className="field" />
          </label>
          <AddressFields
            fieldNames={MAILING_ADDRESS_FORM_FIELDS}
            required={false}
            className="space-y-4 md:col-span-2"
            inputClassName="field"
          />
          <button type="submit" className="mt-2 rounded-xl bg-[var(--brand)] px-4 py-3 font-semibold text-white md:col-span-2">
            Create account
          </button>
        </form>
        <div className="mt-6 text-sm text-stone-500">
          Already have an account?{" "}
          <Link href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"} className="font-semibold text-[var(--brand)]">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
