"use client";

import Link from "next/link";
import { BookOpen, LogOut, Search, Settings, X } from "lucide-react";

import { NexusLogo } from "@/components/brand/nexus-logo";
import { SidebarNav } from "@/components/sidebar-nav";
import type { NavIconName } from "@/lib/rbac";
import { cn, initials } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: NavIconName;
  section?: string;
};

/**
 * Full-screen, top-down navigation sheet shown on phone-sized screens.
 * Replaces the desktop left sidebar below the mobile breakpoint.
 */
export function MobileMenuPanel({
  open,
  onClose,
  user,
  roleLabel,
  navItems,
  guideLink,
  searchPlaceholder,
  logoutAction
}: {
  open: boolean;
  onClose: () => void;
  user: { firstName: string; lastName: string; organization: { name: string } };
  roleLabel: string;
  navItems: NavItem[];
  guideLink: { href: string; label: string } | null;
  searchPlaceholder: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div
      id="mobile-menu"
      className={cn("mobile-menu-overlay", open && "mobile-menu-overlay-open")}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      <div className="mobile-menu-header">
        <Link href="/dashboard" className="mobile-menu-brand" onClick={onClose} aria-label="Nexus dashboard">
          <span className="min-w-0">
            <NexusLogo variant="full" size="xs" />
            <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">{user.organization.name}</span>
          </span>
        </Link>
        <button type="button" onClick={onClose} aria-label="Close navigation menu" className="mobile-menu-close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form action="/dashboard" className="mobile-menu-search" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sidebar-muted)]" aria-hidden="true" />
        <input
          name="q"
          autoComplete="off"
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="mobile-menu-search-input"
        />
      </form>

      <div className="mobile-menu-scroll">
        <SidebarNav items={navItems} ariaLabel="Mobile navigation" />
        {guideLink ? (
          <Link href={guideLink.href} onClick={onClose} className="mobile-menu-guide">
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">{guideLink.label}</span>
          </Link>
        ) : null}
      </div>

      <div className="mobile-menu-footer">
        <div className="mobile-menu-identity">
          <span className="avatar-mark flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
            {initials(user.firstName, user.lastName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{user.firstName} {user.lastName}</span>
            <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">{roleLabel}</span>
          </span>
        </div>
        <div className="mobile-menu-footer-actions">
          <Link href="/settings" onClick={onClose} className="mobile-menu-footer-link">
            <Settings className="h-4 w-4 shrink-0" />
            My Profile &amp; Settings
          </Link>
          <form action={logoutAction} className="contents">
            <button type="submit" className="mobile-menu-footer-link mobile-menu-logout">
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </form>
        </div>
        <div className="mobile-menu-legal">
          <Link href="/terms" target="_blank" onClick={onClose}>Terms</Link>
          <Link href="/privacy" target="_blank" onClick={onClose}>Privacy</Link>
          <Link href="/payment-terms" target="_blank" onClick={onClose}>Payment terms</Link>
          <Link href="/privacy-request" target="_blank" onClick={onClose}>Support</Link>
        </div>
      </div>
    </div>
  );
}
