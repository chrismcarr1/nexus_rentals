import Link from "next/link";
import { ArrowRight, Bot, Building2, CheckCircle2, CreditCard, Home, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { PasswordField } from "@/components/password-field";
import { loginAction } from "@/lib/actions";
import { getInviteByRawToken, getInviteStatus } from "@/lib/lease-connections";

const sections = [
  {
    id: "operations",
    eyebrow: "01 Operations",
    title: "One workspace for every property detail.",
    body: "Keep properties, units, tenants, leases, and tasks moving from the same calm command center.",
    Icon: Building2,
    metrics: ["98% occupancy", "42 active leases", "8 renewals pending"],
    rows: ["Portfolio dashboard", "Lease and tenant records", "Role-aware access"]
  },
  {
    id: "finance",
    eyebrow: "02 Financials",
    title: "Collections, expenses, and NOI stay visible.",
    body: "Track rent, operating costs, overdue balances, and report-ready financial summaries without digging through separate tools.",
    Icon: CreditCard,
    metrics: ["$184k collected", "$12.8k open", "6.4% expense lift"],
    rows: ["Transaction exports", "Expense categories", "Monthly cash flow"]
  },
  {
    id: "maintenance",
    eyebrow: "03 Maintenance",
    title: "Requests become organized work.",
    body: "Route issues, assign priority, monitor status, and keep residents informed as each repair moves from intake to resolution.",
    Icon: Wrench,
    metrics: ["14 open requests", "3 urgent", "2.1 day average"],
    rows: ["Priority queues", "Resolution history", "Tenant updates"]
  },
  {
    id: "ai",
    eyebrow: "04 AI Assessments",
    title: "Move-out damage estimates with context.",
    body: "Compare photos, baseline records, severity, and cost ranges so managers can document decisions with more confidence.",
    Icon: Sparkles,
    metrics: ["86% confidence", "$740 estimate", "4 photos reviewed"],
    rows: ["Baseline comparison", "Repair recommendations", "Charge documentation"]
  }
];

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const params = (await searchParams) ?? {};
  const inviteToken = params.invite;
  const inviteLookup = inviteToken ? await getInviteByRawToken(inviteToken) : null;
  const inviteEmail = inviteLookup?.invite && getInviteStatus(inviteLookup.invite) === "pending" ? inviteLookup.invite.tenantEmail : "";

  return (
    <main className="min-h-screen bg-[#080f0d] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080f0d]/[0.82] backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-[#0c1714]">N</span>
            <span className="text-sm font-semibold tracking-wide text-white/90">Nexus Rentals</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-white/[0.58] lg:flex">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} className="transition hover:text-white">
                {section.eyebrow.split(" ")[1]}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href="#login" className="rounded-full px-4 py-2 text-sm font-semibold text-white/[0.72] transition hover:bg-white/[0.08] hover:text-white">
              Login
            </a>
            <Link href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"} className="rounded-full bg-white px-4 py-2 text-sm font-semibold !text-black transition hover:bg-[#f4efe6]">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <section id="login" className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(35,103,93,0.34),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(173,133,71,0.22),transparent_28%)]" />
        <div className="marketing-split relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/70">
              <ShieldCheck className="h-4 w-4 text-[#d7b878]" />
              Secure property operations
            </div>
            <h1 className="marketing-title mt-8 max-w-4xl font-[var(--font-display)] text-white">
              Rental management with less noise and more control.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/[0.62] sm:text-lg">
              Nexus Rentals brings portfolio oversight, payments, maintenance, tenant records, and AI-assisted assessments into one focused workspace.
            </p>
            <div className="marketing-metric-grid mt-10 max-w-2xl">
              {["Portfolio view", "Financial reports", "AI assessments"].map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white/[0.74]">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <section className="rounded-2xl border border-white/[0.12] bg-[#f7f5ef] p-5 text-[var(--text)] shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--brand)]">Login</p>
            <h2 className="mt-3 font-[var(--font-display)] text-4xl leading-tight">Welcome back</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Use a seeded demo account or your local organization account.</p>

            {(params.error || params.reset) && (
              <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm">
                {params.error === "invalid-credentials"
                  ? "Invalid email or password."
                  : params.error === "server"
                    ? "Login could not reach the hosted database. Check DATABASE_URL in .env.local and Vercel."
                    : "Password reset complete. Sign in with the new password."}
              </div>
            )}

            <form action={loginAction} className="mt-7 space-y-4">
              {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
              <label className="block">
                <span className="mb-2 block text-sm font-medium">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none transition focus:border-[var(--brand)]/40 focus:ring-4 focus:ring-[var(--brand)]/10"
                  placeholder="you@company.com"
                  defaultValue={inviteEmail}
                />
              </label>
              <PasswordField
                name="password"
                required
                label="Password"
                placeholder="Password"
                inputClassName="outline-none transition focus:border-[var(--brand)]/40 focus:ring-4 focus:ring-[var(--brand)]/10"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#23675d,#184c45)] px-4 py-3 font-semibold text-white shadow-[0_12px_26px_rgba(24,76,69,0.20)] transition hover:shadow-[0_15px_30px_rgba(24,76,69,0.24)]"
              >
                Log in
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted)]">
              <Link href="/forgot-password" className="transition hover:text-[var(--text)]">
                Forgot password?
              </Link>
              <Link href={inviteToken ? `/signup?invite=${encodeURIComponent(inviteToken)}` : "/signup"} className="font-semibold text-[var(--brand)] transition hover:text-[#184c45]">
                Create account
              </Link>
            </div>

            <div className="mt-7 rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm text-[var(--muted)]">
              <p className="font-semibold text-[var(--text)]">Demo credentials</p>
              <p className="mt-2">Manager: manager@nexusrentals.local / ManagerPass123!</p>
              <p>Tenant: tenant@nexusrentals.local / TenantPass123!</p>
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-[#d7b878]">Platform</p>
          <h2 className="marketing-section-title mt-4 font-[var(--font-display)] text-white">
            Designed around the daily rhythm of rental operations.
          </h2>
        </div>

        <div className="mt-12 space-y-10">
          {sections.map((section, index) => {
            const Icon = section.Icon;
            return (
              <section
                key={section.id}
                id={section.id}
                className="marketing-split scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_20px_56px_rgba(0,0,0,0.16)] sm:p-6 lg:p-8"
              >
                <div className="flex flex-col justify-between">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-[#d7b878]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.26em] text-white/40">{section.eyebrow}</p>
                    <h3 className="mt-4 max-w-xl font-[var(--font-display)] text-3xl leading-tight text-white sm:text-4xl">{section.title}</h3>
                    <p className="mt-4 max-w-xl text-sm leading-7 text-white/[0.58] sm:text-base">{section.body}</p>
                  </div>
                  <Link href={index === sections.length - 1 ? "/signup" : `#${sections[index + 1].id}`} className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white/[0.76] transition hover:text-white">
                    {index === sections.length - 1 ? "Create account" : "Next section"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-[#0d1714] p-4 lg:mt-0">
                  <div className="marketing-metric-grid">
                    {section.metrics.map((metric) => (
                      <div key={metric} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/[0.34]">Signal</p>
                        <p className="mt-3 text-lg font-semibold text-white">{metric}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-3">
                    {section.rows.map((row) => (
                      <div key={row} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="h-4 w-4 text-[#d7b878]" />
                          <span className="text-sm text-white/[0.76]">{row}</span>
                        </div>
                        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/[0.42]">Live</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="border-t border-white/10">
        <div className="marketing-feature-grid mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:px-8">
          {[
            { title: "Role aware", body: "Manager, tenant, and admin paths stay separated.", Icon: ShieldCheck },
            { title: "Property centered", body: "Everything connects back to the unit and lease.", Icon: Home },
            { title: "AI assisted", body: "Assessment workflows help document damage faster.", Icon: Bot }
          ].map(({ title, body, Icon }) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
              <Icon className="h-5 w-5 text-[#d7b878]" />
              <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/[0.56]">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
