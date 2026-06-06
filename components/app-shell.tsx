"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { BookOpen, Building2, ChevronDown, Gauge, LogOut, Settings, UserRound } from "lucide-react";

import { DropdownDismissListener } from "@/components/dropdown-dismiss-listener";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { useClickOutside } from "@/components/use-click-outside";
import { getRoleConfig } from "@/lib/rbac";
import { cn, initials } from "@/lib/utils";

export function AppShell({
  user,
  notifications,
  searchQuery,
  searchResults,
  logoutAction,
  children
}: {
  user: {
    firstName: string;
    lastName: string;
    role: "ADMIN" | "MANAGER" | "TENANT";
    organization: { name: string };
  };
  notifications: Array<{ id: string; title: string; body: string; href?: string; label?: string }>;
  searchQuery?: string;
  searchResults?: {
    properties: Array<{ id: string; name: string }>;
    units: Array<{ id: string; unitNumber: string; property: { name: string } }>;
    tenants: Array<{ id: string; firstName: string; lastName: string }>;
  };
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const role = getRoleConfig(user.role);
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(accountMenuRef, () => setAccountOpen(false), accountOpen);
  const guideLink =
    user.role === "MANAGER"
      ? { href: "/manager-guide", label: "Tips to Being a Good Manager", description: "Simple habits for stronger operations." }
      : user.role === "TENANT"
        ? { href: "/renter-guide", label: "Tips to Being a Good Renter", description: "Practical ways to protect your home and record." }
        : null;

  return (
    <div className="app-frame">
      <DropdownDismissListener />
      <div className="app-shell-layout">
        <aside className="surface-panel app-sidebar">
          <Link href="/dashboard" className="mb-4 flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition hover:bg-[var(--surface-hover)]">
            <div className="app-brand-mark flex h-10 w-10 items-center justify-center text-sm font-bold">NR</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text)]">Nexus Rentals</p>
              <p className="truncate text-xs text-[var(--muted)]">Property operations</p>
            </div>
          </Link>
          <div className="mb-2">
            <span className="role-tag">{role.label}</span>
          </div>
          <SidebarNav items={role.nav} />
          <div className="mt-auto space-y-3">
            {guideLink ? (
              <Link
                href={guideLink.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition duration-150",
                  pathname === guideLink.href
                    ? "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--text)]"
                    : "border-transparent bg-transparent text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
                    pathname === guideLink.href ? "border-[var(--brand)] bg-white text-[var(--brand)]" : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] group-hover:border-[var(--line-strong)]"
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{guideLink.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--muted)]">{guideLink.description}</span>
                </span>
              </Link>
            ) : null}
            <div ref={accountMenuRef} className="relative">
              {accountOpen ? (
                <div className="absolute bottom-[calc(100%+10px)] left-0 right-0 z-30 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.36)]">
                  <div className="px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Signed in as</p>
                    <p className="mt-1 truncate text-sm font-semibold text-[var(--text)]">{user.firstName} {user.lastName}</p>
                  </div>
                  <Link href="/dashboard" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                    <Gauge className="h-4 w-4" />
                    Dashboard
                  </Link>
                  <Link href="/settings" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                  <Link href="/settings" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                    <UserRound className="h-4 w-4" />
                    Account info
                  </Link>
                  {guideLink ? (
                    <Link href={guideLink.href} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                      <BookOpen className="h-4 w-4" />
                      {user.role === "MANAGER" ? "Manager tips" : "Renter tips"}
                    </Link>
                  ) : null}
                  <div className="my-2 h-px bg-[var(--line)]" />
                  <form action={logoutAction}>
                    <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-red-700 transition hover:bg-red-600/10">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </form>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border bg-[var(--panel)] p-2.5 text-left transition hover:bg-[var(--surface-hover)]",
                  accountOpen ? "border-[var(--brand)] shadow-[0_10px_24px_rgba(0,0,0,0.32)]" : "border-[var(--line)]"
                )}
              >
                <div className="avatar-mark flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
                  {initials(user.firstName, user.lastName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">{user.firstName} {user.lastName}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-[var(--muted)]">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {user.organization.name}
                  </p>
                </div>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--muted)] transition", accountOpen && "rotate-180")} />
              </button>
            </div>
          </div>
        </aside>
        <main className="app-main">
          <TopBar
            role={user.role}
            organizationName={user.organization.name}
            notifications={notifications}
            searchQuery={searchQuery}
            searchResults={searchResults}
          />
          <div className="app-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
