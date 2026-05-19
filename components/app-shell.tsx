"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Bell, BookOpen, Search } from "lucide-react";

import { SidebarNav } from "@/components/sidebar-nav";
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
  notifications: Array<{ id: string; title: string; body: string }>;
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
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsHovered, setAlertsHovered] = useState(false);
  const [alertsHoverSuppressed, setAlertsHoverSuppressed] = useState(false);
  const showAlerts = alertsOpen || (alertsHovered && !alertsHoverSuppressed);
  const guideLink =
    user.role === "MANAGER"
      ? { href: "/manager-guide", label: "Tips to Being a Good Manager", description: "Simple habits for stronger operations." }
      : user.role === "TENANT"
        ? { href: "/renter-guide", label: "Tips to Being a Good Renter", description: "Practical ways to protect your home and record." }
        : null;

  function handleAlertsClick() {
    setAlertsOpen((open) => {
      const nextOpen = !open;
      setAlertsHoverSuppressed(!nextOpen);
      return nextOpen;
    });
  }

  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="surface-panel flex flex-col p-5 lg:p-6">
          <Link href="/dashboard" className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#1f6b5f,#174a43)] text-lg font-bold text-white shadow-[0_18px_32px_rgba(22,74,67,0.24)]">N</div>
            <div>
              <p className="text-xl font-semibold tracking-[-0.03em] text-[var(--text)]">Northstar Rent OS</p>
              <p className="text-sm text-[var(--muted)]">{user.organization.name}</p>
            </div>
          </Link>
          <div className="mb-6 rounded-[24px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(31,107,95,0.12),rgba(255,255,255,0.65))] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[var(--brand)]">{role.label}</p>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em]">{role.homeLabel}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{role.description}</p>
          </div>
          <SidebarNav items={role.nav} />
          <div className="mt-auto space-y-3">
            {guideLink ? (
              <Link
                href={guideLink.href}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition duration-200",
                  pathname === guideLink.href
                    ? "border-[var(--line-strong)] bg-[var(--panel-strong)] text-[var(--text)] shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                    : "border-[var(--line)] bg-white/60 text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition",
                    pathname === guideLink.href ? "bg-[var(--accent-soft)] text-[var(--brand)]" : "bg-white text-[var(--muted)] group-hover:bg-[var(--accent-soft)]"
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{guideLink.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{guideLink.description}</span>
                </span>
              </Link>
            ) : null}
            <div className="rounded-[28px] bg-[linear-gradient(145deg,#0f172a,#1d3557)] p-5 text-white">
              <p className="text-sm uppercase tracking-[0.24em] text-white/60">Operations Pulse</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Serious SaaS posture</h3>
              <p className="mt-2 text-sm leading-6 text-white/74">Role-aware access, scoped operational views, and cleaner decision support are now built into the platform shell.</p>
            </div>
          </div>
        </aside>
        <main className="space-y-4">
          <header className="surface-panel sticky top-4 z-10 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <form action="/dashboard" className="relative w-full max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="q"
                  defaultValue={searchQuery}
                  placeholder={user.role === "TENANT" ? "Search your records and notices" : "Search properties, units, or tenants"}
                  className="field app-shell-search-input"
                />
                {searchQuery && searchResults ? (
                  <div className="surface-panel absolute left-0 right-0 top-[calc(100%+8px)] p-3">
                    {searchResults.properties.map((item) => (
                      <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-100">
                        Property: {item.name}
                      </Link>
                    ))}
                    {searchResults.units.map((item) => (
                      <Link key={item.id} href={`/units/${item.id}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-100">
                        Unit: {item.property.name} {item.unitNumber}
                      </Link>
                    ))}
                    {searchResults.tenants.map((item) => (
                      <Link key={item.id} href="/tenants" className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-100">
                        Tenant: {item.firstName} {item.lastName}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </form>
              <div className="flex items-center gap-3">
                <div className="hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2 lg:block">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">Workspace</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{role.label}</p>
                </div>
                <div
                  className="relative"
                  onMouseEnter={() => {
                    setAlertsHovered(true);
                    setAlertsHoverSuppressed(false);
                  }}
                  onMouseLeave={() => {
                    setAlertsHovered(false);
                    setAlertsHoverSuppressed(false);
                  }}
                >
                  <button
                    onClick={handleAlertsClick}
                    type="button"
                    aria-label="Alerts"
                    aria-controls="alerts-menu"
                    aria-expanded={showAlerts}
                    className={cn(
                      "rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-3 text-slate-700 transition hover:-translate-y-0.5 hover:bg-white",
                      showAlerts && "border-[var(--line-strong)] bg-white text-[var(--brand)] shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    )}
                  >
                    <Bell className="h-4 w-4" />
                  </button>
                  <div
                    id="alerts-menu"
                    className={cn(
                      "absolute right-0 top-full z-20 w-80 max-w-[calc(100vw-2rem)] pt-2",
                      showAlerts ? "block" : "hidden"
                    )}
                  >
                    <div className="surface-panel p-3">
                      {notifications.length ? (
                        notifications.map((item) => (
                          <div key={item.id} className="rounded-2xl px-3 py-2 hover:bg-slate-100">
                            <p className="text-sm font-semibold">{item.title}</p>
                            <p className="text-xs text-[var(--muted)]">{item.body}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl px-3 py-2">
                          <p className="text-sm font-semibold">No alerts</p>
                          <p className="text-xs text-[var(--muted)]">You are all caught up.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#1f6b5f,#174a43)] text-sm font-bold text-white">
                    {initials(user.firstName, user.lastName)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{user.organization.name}</p>
                  </div>
                  <form action={logoutAction}>
                    <button type="submit" className="rounded-xl px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-slate-100 hover:text-[var(--text)]">
                      Logout
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
