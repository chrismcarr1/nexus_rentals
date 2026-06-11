import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";

// Shared shell for the public legal pages (/terms, /privacy, /payment-terms,
// /privacy-request) so they all match the public site styling.
export function LegalPageShell({
  title,
  effectiveDate,
  description,
  children
}: {
  title: string;
  effectiveDate: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="public-page">
      <PublicSiteHeader
        navItems={[
          { href: "/terms", label: "Terms" },
          { href: "/privacy", label: "Privacy" },
          { href: "/payment-terms", label: "Payment terms" }
        ]}
        accountHref="/login"
        accountLabel="Sign in"
      />
      <section className="public-container py-12">
        <div className="mx-auto max-w-3xl">
          <p className="public-eyebrow">Nexus Rentals legal</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)]">{title}</h1>
          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">Effective date: {effectiveDate}</p>
          <p className="mt-4 text-sm leading-7 text-[var(--muted-strong)]">{description}</p>
          <div className="mt-8 space-y-8">{children}</div>
        </div>
      </section>
      <PublicSiteFooter />
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-7 text-[var(--muted-strong)]">{children}</div>
    </section>
  );
}
