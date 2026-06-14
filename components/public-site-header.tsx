import Link from "next/link";

import { NexusLogo } from "@/components/brand/nexus-logo";

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
          <NexusLogo variant="full" size="sm" className="public-brand-full" priority />
          <NexusLogo variant="icon" size="sm" className="public-brand-icon" priority />
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
