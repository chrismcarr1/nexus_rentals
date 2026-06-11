import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "@/lib/actions";
import { getInviteByRawToken, getInviteStatus } from "@/lib/lease-connections";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const inviteToken = params.invite;
  const inviteLookup = inviteToken ? await getInviteByRawToken(inviteToken) : null;
  const inviteEmail = inviteLookup?.invite && getInviteStatus(inviteLookup.invite) === "pending" ? inviteLookup.invite.tenantEmail : "";

  const message = params.error === "invalid-credentials"
    ? "The email or password is incorrect."
    : params.error === "rate-limited"
      ? "Too many sign-in attempts. Please wait a few minutes and try again."
      : params.error === "server"
        ? "We could not reach the account service. Please try again shortly."
        : params.error
          ? "Sign-in failed. Check your details and try again."
          : params.reset
            ? "Your password has been updated. You can sign in now."
            : null;

  return (
    <AuthShell
      eyebrow="Account access"
      title="Welcome back."
      description="Sign in to manage properties, residents, payments, maintenance, and the details that keep your rental business moving."
      cardTitle="Sign in"
      cardDescription="Use the email associated with your Nexus account."
      noteTitle="One private workspace"
      note="Your portfolio records and resident activity stay organized under your account."
      footer={(
        <p>
          New to Nexus?{" "}
          <Link href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"}>
            Create an account
          </Link>
        </p>
      )}
    >
      {message ? (
        <div className={params.reset ? "auth-alert auth-alert-success" : "auth-alert auth-alert-error"} role="status">
          {message}
        </div>
      ) : null}

      {inviteEmail ? (
        <div className="auth-invite-note">
          Sign in with <strong>{inviteEmail}</strong> to continue your invitation.
        </div>
      ) : null}

      <form action={loginAction} className="auth-form">
        {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
        <label className="block">
          <span className="field-label">Email address</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field"
            placeholder="you@example.com"
            defaultValue={inviteEmail}
          />
        </label>
        <PasswordField
          name="password"
          required
          autoComplete="current-password"
          label="Password"
          placeholder="Enter your password"
        />
        <div className="auth-form-meta">
          <span />
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
        <SubmitButton pendingLabel="Signing in..." className="auth-primary-button">
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
