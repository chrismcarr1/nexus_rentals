import Link from "next/link";
import { ArrowRight, Bot, Building2, CheckCircle2, CreditCard, Home, ShieldCheck, Sparkles, Wrench } from "lucide-react";

import { getSession } from "@/lib/auth";

const offerings = [
  {
    id: "portfolio",
    nav: "Portfolio",
    eyebrow: "01 Portfolio",
    title: "See every property, unit, lease, and tenant in one workspace.",
    body: "Nexus Rentals keeps the operational picture simple: occupancy, rent status, lease details, tenant records, and property context all live together.",
    Icon: Building2,
    stat: "98%",
    statLabel: "occupancy visibility",
    rows: ["Property and unit records", "Tenant profiles", "Lease timelines"]
  },
  {
    id: "financials",
    nav: "Financials",
    eyebrow: "02 Financials",
    title: "Turn rent, expenses, and cash flow into clear decisions.",
    body: "Track collections, categorize expenses, monitor overdue balances, and export the reports that owners and managers need.",
    Icon: CreditCard,
    stat: "$184k",
    statLabel: "monthly collections tracked",
    rows: ["Rent and transaction history", "Expense reporting", "Cash-flow summaries"]
  },
  {
    id: "maintenance",
    nav: "Maintenance",
    eyebrow: "03 Maintenance",
    title: "Move maintenance from scattered requests to managed work.",
    body: "Prioritize requests, document resolutions, and keep every issue tied to the right unit, property, and resident.",
    Icon: Wrench,
    stat: "2.1d",
    statLabel: "average resolution signal",
    rows: ["Request intake", "Priority queues", "Resolution notes"]
  },
  {
    id: "ai-assessments",
    nav: "AI Assessments",
    eyebrow: "04 AI Assessments",
    title: "Document move-out damage with more confidence.",
    body: "Use baseline records, photos, severity signals, and repair estimates to support fair, consistent move-out decisions.",
    Icon: Sparkles,
    stat: "86%",
    statLabel: "assessment confidence",
    rows: ["Photo comparison", "Repair estimates", "Charge documentation"]
  }
];

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="min-h-screen bg-[#080f0d] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080f0d]/[0.84] backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-[#0c1714]">N</span>
            <span className="text-sm font-semibold tracking-wide text-white/90">Nexus Rentals</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm text-white/[0.58] lg:flex">
            {offerings.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="transition hover:text-white">
                {item.nav}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href={session ? "/dashboard" : "/login"}
              className="rounded-full px-4 py-2 text-sm font-semibold text-white/[0.72] transition hover:bg-white/[0.08] hover:text-white"
            >
              Login
            </Link>
            <Link href="/signup" className="rounded-full bg-white px-4 py-2 text-sm font-semibold !text-black transition hover:bg-[#f4efe6]">
              Create account
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(35,103,93,0.34),transparent_34%),radial-gradient(circle_at_85%_20%,rgba(173,133,71,0.22),transparent_28%)]" />
        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:items-center lg:px-8 lg:py-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white/70">
              <ShieldCheck className="h-4 w-4 text-[#d7b878]" />
              Property operations, simplified
            </div>
            <h1 className="mt-8 max-w-4xl font-[var(--font-display)] text-5xl leading-[0.98] tracking-[-0.02em] text-white sm:text-6xl lg:text-7xl">
              Rental management with less noise and more control.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/[0.62] sm:text-lg">
              Nexus Rentals brings portfolio oversight, payments, maintenance, tenant records, and AI-assisted assessments into one focused workspace.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={session ? "/dashboard" : "/login"}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold !text-black transition hover:bg-[#f4efe6]"
              >
                Login
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.1]"
              >
                Create account
              </Link>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-5">
            <img src="/demo/property-cover.svg" alt="" className="aspect-[5/3] w-full rounded-2xl border border-white/10 object-cover" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                { label: "Portfolio", value: "42 active leases", Icon: Building2 },
                { label: "Financials", value: "$12.8k open", Icon: CreditCard },
                { label: "Maintenance", value: "14 requests", Icon: Wrench },
                { label: "AI", value: "4 photos reviewed", Icon: Bot }
              ].map(({ label, value, Icon }) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-[#0d1714] p-4">
                  <Icon className="h-4 w-4 text-[#d7b878]" />
                  <p className="mt-4 text-xs uppercase tracking-[0.2em] text-white/[0.34]">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {offerings.map((item, index) => {
        const Icon = item.Icon;
        return (
          <section key={item.id} id={item.id} className="scroll-mt-16 border-b border-white/10">
            <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:px-8">
              <div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-[#d7b878]">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-7 text-xs font-semibold uppercase tracking-[0.26em] text-white/40">{item.eyebrow}</p>
                <h2 className="mt-4 max-w-2xl font-[var(--font-display)] text-4xl leading-tight text-white sm:text-5xl">{item.title}</h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-white/[0.58]">{item.body}</p>
                <Link
                  href={index === offerings.length - 1 ? "/signup" : `#${offerings[index + 1].id}`}
                  className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white/[0.76] transition hover:text-white"
                >
                  {index === offerings.length - 1 ? "Create account" : "Next offering"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.18)] sm:p-6">
                <div className="grid gap-4 sm:grid-cols-[0.75fr_1.25fr]">
                  <div className="rounded-3xl border border-white/10 bg-[#0d1714] p-6">
                    <p className="text-xs uppercase tracking-[0.22em] text-white/[0.34]">Signal</p>
                    <p className="mt-8 font-[var(--font-display)] text-5xl text-white">{item.stat}</p>
                    <p className="mt-3 text-sm leading-6 text-white/[0.56]">{item.statLabel}</p>
                  </div>
                  <div className="space-y-3">
                    {item.rows.map((row) => (
                      <div key={row} className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#0d1714] px-4 py-3">
                        <span className="flex items-center gap-3 text-sm text-white/[0.76]">
                          <CheckCircle2 className="h-4 w-4 text-[#d7b878]" />
                          {row}
                        </span>
                        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-white/[0.42]">Live</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
        {[
          { title: "Role aware", body: "Manager, tenant, and admin paths stay separated.", Icon: ShieldCheck },
          { title: "Property centered", body: "Everything connects back to the unit and lease.", Icon: Home },
          { title: "Simple by default", body: "A focused interface for daily work, not another complicated system.", Icon: Sparkles }
        ].map(({ title, body, Icon }) => (
          <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <Icon className="h-5 w-5 text-[#d7b878]" />
            <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/[0.56]">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
