import Link from "next/link";
import { ArrowRight, Check, KeyRound, LockKeyhole, ShieldCheck, Users } from "lucide-react";

import { PasswordField } from "@/components/password-field";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import { loginAction } from "@/lib/actions";
import { getInviteByRawToken, getInviteStatus } from "@/lib/lease-connections";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const inviteToken = params.invite;
  const inviteLookup = inviteToken ? await getInviteByRawToken(inviteToken) : null;
  const inviteEmail = inviteLookup?.invite && getInviteStatus(inviteLookup.invite) === "pending" ? inviteLookup.invite.tenantEmail : "";

  return (
    <main className="public-page">
      <PublicSiteHeader
        navItems={[
          { href: "#sign-in", label: "Sign in" },
          { href: "#security", label: "Security" },
          { href: "#mission", label: "Mission" },
          { href: "#about", label: "About us" }
        ]}
        accountHref="/"
        accountLabel="Home"
      />

      <section id="sign-in" className="public-login-hero public-anchor">
        <div className="public-container public-login-grid">
          <div className="public-login-intro">
            <p className="public-eyebrow">Secure account access</p>
            <h1>Welcome back to Nexus.</h1>
            <p>
              Sign in to manage your portfolio, review resident activity, track payments and maintenance, or access your resident account.
            </p>
            <div className="public-login-points">
              {[
                "Role-aware manager and resident workspaces",
                "Connected property, lease, and payment records",
                "Secure access to daily operational workflows"
              ].map((item) => (
                <span key={item}><Check className="h-4 w-4" />{item}</span>
              ))}
            </div>
          </div>

          <section className="public-login-panel">
            <div className="border-b border-[var(--line)] px-6 py-5">
              <p className="public-eyebrow">Account login</p>
              <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">Sign in to your workspace</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Enter the account email and password associated with your Nexus access.</p>
            </div>

            <div className="px-6 py-6">
              {(params.error || params.reset) ? (
                <div className="mb-5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)]" role="alert">
                  {params.error === "invalid-credentials"
                    ? "Invalid email or password."
                    : params.error === "rate-limited"
                      ? "Too many sign-in attempts. Wait a few minutes and try again."
                      : params.error === "server"
                        ? "Login could not reach the hosted database. Check the deployment database configuration."
                        : params.error
                          ? "Sign-in failed. Check your details and try again."
                          : "Password reset complete. Sign in with the new password."}
                </div>
              ) : null}

              <form action={loginAction} className="space-y-4">
                {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[var(--text)]">Email</span>
                  <input name="email" type="email" required className="field" placeholder="you@company.com" defaultValue={inviteEmail} />
                </label>
                <PasswordField name="password" required label="Password" placeholder="Enter your password" inputClassName="field pr-12" />
                <button type="submit" className="public-login-submit">
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between gap-4 text-sm">
                <Link href="/forgot-password" className="text-[var(--muted)] hover:text-[var(--text)]">Forgot password?</Link>
                <Link href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"} className="font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
                  Create account
                </Link>
              </div>

              <details className="public-demo-access">
                <summary>Demo account access</summary>
                <div>
                  <p><strong>Manager</strong> manager@nexusrentals.local / ManagerPass123!</p>
                  <p><strong>Tenant</strong> tenant@nexusrentals.local / TenantPass123!</p>
                </div>
              </details>
            </div>
          </section>
        </div>
      </section>

      <section id="security" className="public-section public-section-muted public-anchor">
        <div className="public-container">
          <div className="public-section-heading">
            <div>
              <p className="public-eyebrow">Security and access</p>
              <h2>Each person enters the workspace designed for their responsibilities.</h2>
            </div>
            <p>Nexus keeps manager operations and resident access intentionally separated while preserving the records they need to share.</p>
          </div>
          <div className="public-principles-grid">
            {[
              { title: "Role-aware access", body: "Managers, residents, and administrators receive distinct navigation and permissions.", Icon: KeyRound },
              { title: "Protected workflows", body: "Authenticated routes protect payments, leases, resident records, and operating actions.", Icon: LockKeyhole },
              { title: "Shared accountability", body: "Messages, documents, maintenance, and financial activity stay connected to the proper record.", Icon: Users }
            ].map(({ title, body, Icon }) => (
              <article key={title}>
                <Icon className="h-5 w-5 text-[var(--brand)]" />
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="mission" className="public-section public-anchor">
        <div className="public-container public-mission-grid">
          <div>
            <p className="public-eyebrow">Our mission</p>
            <h2 className="public-section-title">Make rental operations clearer, more accountable, and easier to manage.</h2>
          </div>
          <div className="public-mission-copy">
            <p>Nexus gives managers and residents a shared source of truth for the work, money, records, and communication behind every rental relationship.</p>
            <p>We build for less administrative friction, stronger records, and more confidence in what needs attention next.</p>
          </div>
        </div>
      </section>

      <section id="about" className="public-section public-section-muted public-anchor">
        <div className="public-container public-about-grid">
          <div className="public-about-index">
            <ShieldCheck className="h-6 w-6 text-[var(--brand)]" />
            <strong>Professional by design</strong>
            <span>Built to support real property portfolios, resident relationships, and daily operating decisions.</span>
          </div>
          <div>
            <p className="public-eyebrow">About us</p>
            <h2 className="public-section-title">Nexus is built around the connections that make rental operations work.</h2>
            <div className="public-about-copy">
              <p>Properties connect to units. Units connect to leases and residents. Payments, maintenance, documents, and messages connect back to all of them.</p>
              <p>Our platform keeps those relationships understandable so teams can operate with context instead of chasing information.</p>
            </div>
            <Link href="/#platform" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
              Explore Nexus <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </main>
  );
}
