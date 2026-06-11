import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestResetAction } from "@/lib/actions";

export default async function ForgotPasswordPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Let’s get you back in."
      description="Enter your account email and we will send a secure link to choose a new password."
      cardTitle="Reset your password"
      cardDescription="For your privacy, we show the same confirmation whether or not an account exists."
      noteTitle="A link that expires"
      note="Password reset links are single-use and remain valid for one hour."
      footer={<p>Remember your password? <Link href="/login">Return to sign in</Link></p>}
    >
      {params.error ? (
        <div className="auth-alert auth-alert-error" role="alert">Enter a valid email address.</div>
      ) : null}
      {params.success ? (
        <div className="auth-alert auth-alert-success" role="status">
          If that email belongs to an account, a reset link is on its way.
        </div>
      ) : null}

      <form action={requestResetAction} className="auth-form">
        <label className="block">
          <span className="field-label">Email address</span>
          <input name="email" type="email" required autoComplete="email" className="field" placeholder="you@example.com" />
        </label>
        <SubmitButton pendingLabel="Sending link..." className="auth-primary-button">
          Send reset link
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
