import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { resetPasswordAction } from "@/lib/actions";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const token = params.token ?? "";

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password."
      description="Use a password you do not use elsewhere. Once saved, any older Nexus sessions will be signed out."
      cardTitle="Set your password"
      cardDescription="Your new password must contain at least eight characters."
      noteTitle="A clean restart"
      note="Changing your password invalidates existing sessions tied to the account."
      footer={<p>Need another link? <Link href="/forgot-password">Request a new reset</Link></p>}
    >
      {params.error ? (
        <div className="auth-alert auth-alert-error" role="alert">
          {params.error === "invalid-form"
            ? "Use at least eight characters and make sure both passwords match."
            : "This reset link is invalid or has expired."}
        </div>
      ) : null}

      {token ? (
        <form action={resetPasswordAction} className="auth-form">
          <input name="token" type="hidden" value={token} readOnly />
          <PasswordField name="password" required minLength={8} autoComplete="new-password" label="New password" />
          <PasswordField name="confirmPassword" required minLength={8} autoComplete="new-password" label="Confirm new password" />
          <SubmitButton pendingLabel="Saving password..." className="auth-primary-button">
            Save password
          </SubmitButton>
        </form>
      ) : (
        <div className="auth-alert auth-alert-neutral" role="status">
          Open the password reset link from your email to continue.
        </div>
      )}
    </AuthShell>
  );
}
