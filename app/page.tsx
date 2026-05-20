import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, Sparkles } from "lucide-react";

import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="grid-bg min-h-screen px-6 py-8 lg:px-10 lg:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col rounded-[36px] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,248,240,0.76))] p-6 shadow-[0_30px_80px_rgba(28,22,14,0.08)] lg:p-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-[var(--brand)]">Nexus Rentals</p>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl">Built by property managers, for property managers.</h1>
          </div>
          <div className="flex gap-3">
            <Link
              href={session ? "/dashboard" : "/login"}
              className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold"
            >
              Login
            </Link>
            <Link href="/signup" className="rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white">
              Create account
            </Link>
          </div>
        </header>
        <section className="mt-12 grid gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-full bg-[var(--brand)]/10 px-4 py-2 text-sm font-semibold text-[var(--brand)]">
              Rental operations with role-based access
            </div>
            <h2 className="mt-6 max-w-3xl font-[var(--font-display)] text-6xl leading-[1.05] text-[var(--text)]">
              Portfolio control, financial clarity, and damage intelligence in one workspace.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
              Manage properties, leases, tenants, collections, maintenance, and move-out charge analysis from one workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href={session ? "/dashboard" : "/login"} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white">
                Launch platform
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-semibold">
                Demo credentials
              </Link>
            </div>
          </div>
          <div className="rounded-[32px] border border-[var(--line)] bg-[linear-gradient(135deg,#184c45,#0f2f2b)] p-6 text-white shadow-[0_30px_60px_rgba(14,39,36,0.26)]">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "Secure auth", body: "Role-aware authentication, password reset, and protected navigation.", Icon: ShieldCheck },
                { title: "Portfolio dashboard", body: "Occupancy, NOI, overdue rent, recent expenses, and notifications.", Icon: Building2 },
                { title: "AI damage engine", body: "Structured photo-based repair estimates with confidence and recommended next steps.", Icon: Sparkles }
              ].map(({ title, body, Icon: ItemIcon }, index) => {
                return (
                  <div key={title} className={`rounded-[28px] bg-white/${index === 0 ? "12" : "8"} p-5 ${index === 2 ? "sm:col-span-2" : ""}`}>
                    <ItemIcon className="h-5 w-5" />
                    <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm text-white/80">{body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
