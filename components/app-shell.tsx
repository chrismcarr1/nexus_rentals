"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { BookOpen, ChevronDown, Gauge, LogOut, Settings } from "lucide-react";

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
  notifications: Array<{ id: string; title: string; body: string; href?: string; label?: string; isUnread?: boolean }>;
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
        <aside className="app-sidebar">
          <Link href="/dashboard" className="app-sidebar-brand">
            <div className="app-brand-mark flex h-8 w-8 items-center justify-center text-xs font-bold">NR</div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Nexus</p>
              <p className="truncate text-[11px] text-[var(--sidebar-muted)]">{user.organization.name}</p>
            </div>
          </Link>
          <div className="app-sidebar-scroll">
            <SidebarNav items={role.nav} />
          </div>
          <div className="app-sidebar-footer">
            {guideLink ? (
              <Link
                href={guideLink.href}
                className={cn(
                  "group flex items-center gap-2.5 px-3 py-2 transition duration-150",
                  pathname === guideLink.href
                    ? "bg-[var(--sidebar-active)] text-white"
                    : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[var(--sidebar-muted)] group-hover:text-white">
                  <BookOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{user.role === "MANAGER" ? "Manager guide" : "Renter guide"}</span>
                </span>
              </Link>
            ) : null}
            <div ref={accountMenuRef} className="relative">
              {accountOpen ? (
                <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-30 overflow-hidden border border-[var(--line)] bg-white shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
                  <div className="border-b border-[var(--line)] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Signed in as</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{user.firstName} {user.lastName}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{user.organization.name}</p>
                  </div>
                  <div className="p-1">
                    <Link href="/dashboard" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                      <Gauge className="h-4 w-4 shrink-0" />
                      Dashboard
                    </Link>
                    <Link href="/settings" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                      <Settings className="h-4 w-4 shrink-0" />
                      Settings &amp; profile
                    </Link>
                    {guideLink ? (
                      <Link href={guideLink.href} className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]" onClick={() => setAccountOpen(false)}>
                        <BookOpen className="h-4 w-4 shrink-0" />
                        {user.role === "MANAGER" ? "Manager guide" : "Renter guide"}
                      </Link>
                    ) : null}
                    <div className="my-1 h-px bg-[var(--line)]" />
                    <form action={logoutAction}>
                      <button type="submit" className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm font-semibold text-red-700 transition hover:bg-red-600/10">
                        <LogOut className="h-4 w-4 shrink-0" />
                        Sign out
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-expanded={accountOpen}
                className={cn(
                  "flex w-full items-center gap-2.5 border-t border-[var(--sidebar-line)] px-2 py-3 text-left transition hover:bg-[var(--sidebar-hover)]",
                  accountOpen && "bg-[var(--sidebar-hover)]"
                )}
              >
                <div className="avatar-mark flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
                  {initials(user.firstName, user.lastName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{user.firstName} {user.lastName}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--sidebar-muted)]">{role.label}</p>
                </div>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--sidebar-muted)] transition", accountOpen && "rotate-180")} />
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
          <div className="app-content"><div className="app-content-inner">{children}</div></div>
        </main>
      </div>
    </div>
  );
}
