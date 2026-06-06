import Link from "next/link";

type PublicNavItem = {
  href: string;
  label: string;
};

export function PublicSiteHeader({
  navItems,
  accountHref,
  accountLabel
}: {
  navItems: PublicNavItem[];
  accountHref: string;
  accountLabel: string;
}) {
  return (
    <header className="public-header">
      <div className="public-header-inner">
        <Link href="/" className="public-brand" aria-label="Nexus Rentals home">
          <span className="public-brand-mark">N</span>
          <span>
            <span className="block text-sm font-semibold text-[var(--text)]">Nexus Rentals</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--muted)]">Property operations</span>
          </span>
        </Link>

        <nav className="public-nav" aria-label="Public navigation">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="public-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="public-header-actions">
          <Link href="/signup" className="public-link-button public-link-button-secondary">
            Create account
          </Link>
          <Link href={accountHref} className="public-link-button public-link-button-primary">
            {accountLabel}
          </Link>
        </div>
      </div>
    </header>
  );
}
