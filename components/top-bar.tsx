"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Bell, Search } from "lucide-react";

import { QuickActionMenu } from "@/components/quick-action-menu";
import { useClickOutside } from "@/components/use-click-outside";
import { cn } from "@/lib/utils";

export function TopBar({
  role,
  organizationName,
  notifications,
  searchQuery,
  searchResults
}: {
  role: "ADMIN" | "MANAGER" | "TENANT";
  organizationName: string;
  notifications: Array<{ id: string; title: string; body: string; href?: string; label?: string }>;
  searchQuery?: string;
  searchResults?: {
    properties: Array<{ id: string; name: string }>;
    units: Array<{ id: string; unitNumber: string; property: { name: string } }>;
    tenants: Array<{ id: string; firstName: string; lastName: string }>;
  };
}) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(alertsMenuRef, () => setAlertsOpen(false), alertsOpen);

  return (
    <header className="surface-panel app-topbar">
      <div className="flex min-w-0 items-center gap-2">
        <form action="/dashboard" className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <input
            name="q"
            defaultValue={searchQuery}
            placeholder={role === "TENANT" ? "Search your records" : "Search properties, units, tenants"}
            className="field app-shell-search-input h-10 text-sm"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)] sm:inline-flex">
            /
          </span>
          {searchQuery && searchResults ? (
            <div className="surface-panel absolute left-0 right-0 top-[calc(100%+8px)] z-40 p-2">
              {searchResults.properties.map((item) => (
                <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-hover)]">
                  Property: {item.name}
                </Link>
              ))}
              {searchResults.units.map((item) => (
                <Link key={item.id} href={`/units/${item.id}`} className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-hover)]">
                  Unit: {item.property.name} {item.unitNumber}
                </Link>
              ))}
              {searchResults.tenants.map((item) => (
                <Link key={item.id} href="/tenants" className="block rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-hover)]">
                  Tenant: {item.firstName} {item.lastName}
                </Link>
              ))}
            </div>
          ) : null}
        </form>

        <QuickActionMenu role={role} />

        <div ref={alertsMenuRef} className="relative">
          <button
            onClick={() => setAlertsOpen((open) => !open)}
            type="button"
            aria-label="Alerts"
            aria-controls="alerts-menu"
            aria-expanded={alertsOpen}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
              alertsOpen && "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--brand)]"
            )}
          >
            <Bell className="h-4 w-4" />
          </button>
          <div id="alerts-menu" className={cn("absolute right-0 top-[calc(100%+8px)] z-40 w-80 max-w-[calc(100vw-2rem)]", alertsOpen ? "block" : "hidden")}>
            <div className="surface-panel p-2">
              {notifications.length ? (
                notifications.map((item) =>
                  item.href ? (
                    <Link key={item.id} href={item.href} className="block rounded-md px-3 py-2 hover:bg-[var(--surface-hover)]" onClick={() => setAlertsOpen(false)}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold">{item.title}</p>
                        {item.label ? <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">{item.label}</span> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.body}</p>
                    </Link>
                  ) : (
                    <div key={item.id} className="rounded-md px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold">{item.title}</p>
                        {item.label ? <span className="rounded bg-[var(--panel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</span> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.body}</p>
                    </div>
                  )
                )
              ) : (
                <div className="rounded-md px-3 py-2">
                  <p className="text-sm font-semibold">No alerts</p>
                  <p className="text-xs text-[var(--muted)]">You are all caught up.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="workspace-chip flex h-10 min-w-44 max-w-72 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3">
          <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{organizationName}</p>
        </div>
      </div>
    </header>
  );
}
