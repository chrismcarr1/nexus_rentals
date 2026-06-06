import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  ClipboardCheck,
  CreditCard,
  FileText,
  KeyRound,
  MessageSquare,
  ShieldCheck,
  Users,
  Wrench
} from "lucide-react";

import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const platformAreas = [
  {
    title: "Portfolio operations",
    description: "Properties, units, occupancy, tenants, leases, and move-ins stay connected in one operating record.",
    Icon: Building2,
    items: ["Property and unit registers", "Lease and tenant history", "Move-in coordination"]
  },
  {
    title: "Financial operations",
    description: "Collections, completed payments, categorized income, expenses, and exports remain clear and actionable.",
    Icon: CreditCard,
    items: ["Open balance workflow", "Payment activity", "Accounting-ready exports"]
  },
  {
    title: "Resident operations",
    description: "Maintenance, documents, notices, and direct messaging keep managers and residents working from the same facts.",
    Icon: MessageSquare,
    items: ["Maintenance tracking", "Resident messaging", "Lease documents"]
  }
];

const principles = [
  {
    title: "Operational clarity",
    description: "Daily priorities should be visible without digging through disconnected screens.",
    Icon: ClipboardCheck
  },
  {
    title: "Responsible records",
    description: "Property, lease, payment, and resident history should remain organized and explainable.",
    Icon: FileText
  },
  {
    title: "Trusted access",
    description: "Managers and residents should see the right information through role-aware workflows.",
    Icon: ShieldCheck
  }
];

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="public-page">
      <PublicSiteHeader
        navItems={[
          { href: "#overview", label: "Overview" },
          { href: "#platform", label: "Platform" },
          { href: "#mission", label: "Mission" },
          { href: "#about", label: "About us" }
        ]}
        accountHref={session ? "/dashboard" : "/login"}
        accountLabel={session ? "Open Nexus" : "Login"}
      />

      <section id="overview" className="public-hero public-anchor">
        <div className="public-container public-hero-grid">
          <div className="public-hero-copy">
            <p className="public-eyebrow">Property management software</p>
            <h1 className="public-display-title">Run rental operations from one dependable workspace.</h1>
            <p className="public-lead">
              Nexus Rentals connects portfolio oversight, resident records, lease administration, payments, maintenance, documents, and communication in a professional operating platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={session ? "/dashboard" : "/signup"} className="public-link-button public-link-button-primary min-h-11 px-5">
                {session ? "Open dashboard" : "Create account"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#platform" className="public-link-button public-link-button-secondary min-h-11 px-5">
                Explore the platform
              </a>
            </div>
            <div className="public-trust-row">
              {["Role-aware access", "Unified operating records", "Manager and resident workflows"].map((item) => (
                <span key={item}>
                  <Check className="h-3.5 w-3.5 text-[var(--brand)]" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="public-product-preview" aria-label="Nexus manager dashboard preview">
            <div className="public-preview-sidebar">
              <div className="public-preview-brand">
                <span>N</span>
                Nexus
              </div>
              {["Dashboard", "Properties", "Units", "Tenants", "Leases", "Payments", "Maintenance"].map((item, index) => (
                <div key={item} className={index === 0 ? "public-preview-nav-active" : ""}>{item}</div>
              ))}
            </div>
            <div className="public-preview-main">
              <div className="public-preview-topbar">
                <span>Portfolio overview</span>
                <span className="public-preview-search">Search operations</span>
              </div>
              <div className="public-preview-content">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand)]">Operations dashboard</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--text)]">Today across your portfolio</p>
                </div>
                <div className="public-preview-kpis">
                  {[
                    ["Rent roll", "$48,250"],
                    ["Occupancy", "96%"],
                    ["Open balances", "$3,120"],
                    ["Work orders", "7"]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="public-preview-table">
                  <div className="public-preview-table-head"><span>Property</span><span>Occupancy</span><span>Rent roll</span><span>Status</span></div>
                  {[
                    ["Juniper Court", "24 / 25", "$28,400", "On track"],
                    ["Park Avenue", "14 / 15", "$14,850", "Review"],
                    ["Westlake Duplex", "2 / 2", "$5,000", "On track"]
                  ].map((row) => (
                    <div key={row[0]} className="public-preview-table-row">
                      {row.map((cell) => <span key={cell}>{cell}</span>)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="public-section public-anchor">
        <div className="public-container">
          <div className="public-section-heading">
            <div>
              <p className="public-eyebrow">The platform</p>
              <h2>A connected system for the work behind every property.</h2>
            </div>
            <p>Nexus replaces fragmented spreadsheets, inbox threads, and isolated records with one structured operating environment.</p>
          </div>

          <div className="public-platform-grid">
            {platformAreas.map(({ title, description, Icon, items }) => (
              <article key={title} className="public-feature-column">
                <Icon className="h-5 w-5 text-[var(--brand)]" />
                <h3>{title}</h3>
                <p>{description}</p>
                <ul>
                  {items.map((item) => (
                    <li key={item}><Check className="h-3.5 w-3.5" />{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="public-workflow-strip">
            {[
              { label: "Managers", detail: "Operate properties, leases, finances, and service work.", Icon: KeyRound },
              { label: "Residents", detail: "Access payments, documents, maintenance, and messages.", Icon: Users },
              { label: "Operations", detail: "Keep every action connected to the right property record.", Icon: Wrench }
            ].map(({ label, detail, Icon }) => (
              <div key={label}>
                <Icon className="h-5 w-5" />
                <span><strong>{label}</strong>{detail}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="mission" className="public-section public-section-muted public-anchor">
        <div className="public-container public-mission-grid">
          <div>
            <p className="public-eyebrow">Our mission</p>
            <h2 className="public-section-title">Make rental operations clearer, more accountable, and easier to manage.</h2>
          </div>
          <div className="public-mission-copy">
            <p>
              Nexus Rentals exists to give property managers and residents a shared source of truth. We believe better records, clearer workflows, and timely communication create stronger rental experiences for everyone involved.
            </p>
            <p>
              Our goal is not to add more software noise. It is to reduce administrative friction so managers can protect their portfolios, residents can understand what is happening, and important work does not disappear between systems.
            </p>
          </div>
        </div>
        <div className="public-container public-principles-grid">
          {principles.map(({ title, description, Icon }) => (
            <article key={title}>
              <Icon className="h-5 w-5 text-[var(--brand)]" />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="public-section public-anchor">
        <div className="public-container public-about-grid">
          <div className="public-about-index">
            <span>Built for real operations</span>
            <strong>One platform</strong>
            <strong>Every property record</strong>
            <strong>Every daily workflow</strong>
          </div>
          <div>
            <p className="public-eyebrow">About us</p>
            <h2 className="public-section-title">We are building Nexus around the realities of rental management.</h2>
            <div className="public-about-copy">
              <p>
                Property operations are detailed, time-sensitive, and deeply connected. A payment affects a tenant record. A lease affects a unit. A maintenance request affects resident trust and asset performance.
              </p>
              <p>
                Nexus is designed around those connections. We focus on practical workflows, understandable data, and a professional interface that can grow from a small portfolio to a serious operating business.
              </p>
            </div>
            <Link href="/signup" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
              Start with Nexus <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="public-cta">
        <div className="public-container public-cta-inner">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">Nexus Rentals</p>
            <h2>Bring your property operations into focus.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="public-link-button public-link-button-light">Create account</Link>
            <Link href="/login" className="public-link-button public-link-button-dark-outline">Login</Link>
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </main>
  );
}
