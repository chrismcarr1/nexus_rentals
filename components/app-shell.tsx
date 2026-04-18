import Link from "next/link";
import { Bell, Search } from "lucide-react";

import { appNav } from "@/lib/constants";
import { initials } from "@/lib/utils";

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
    role: string;
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
  return (
    <div className="min-h-screen p-4 lg:p-6">
      <div className="grid min-h-[calc(100vh-2rem)] grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="glass card-shadow flex flex-col rounded-[32px] border border-white/60 p-5">
          <Link href="/dashboard" className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-lg font-bold text-white">N</div>
            <div>
              <p className="font-[var(--font-display)] text-xl text-[var(--text)]">Northstar Rent OS</p>
              <p className="text-sm text-[var(--muted)]">{user.organization.name}</p>
            </div>
          </Link>
          <nav className="space-y-1">
            {appNav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-[var(--muted)] transition hover:bg-white/70 hover:text-[var(--text)]"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-[28px] bg-[linear-gradient(135deg,#184c45,#2d756b)] p-5 text-white">
            <p className="text-sm uppercase tracking-[0.24em] text-white/70">Demo Mode</p>
            <h3 className="mt-2 font-[var(--font-display)] text-2xl">Damage AI Ready</h3>
            <p className="mt-2 text-sm text-white/80">Inspection workflow, financial rollups, and seeded demo data are active for local presentations.</p>
          </div>
        </aside>
        <main className="space-y-4">
          <header className="glass card-shadow sticky top-4 z-10 rounded-[28px] border border-white/60 px-5 py-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <form action="/dashboard" className="relative w-full max-w-xl">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  name="q"
                  defaultValue={searchQuery}
                  placeholder="Search properties, units, or tenants"
                  className="w-full rounded-2xl border border-[var(--line)] bg-white px-11 py-3 text-sm outline-none"
                />
                {searchQuery && searchResults ? (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] rounded-[24px] border border-[var(--line)] bg-white p-3 shadow-2xl">
                    {searchResults.properties.map((item) => (
                      <Link key={item.id} href={`/properties/${item.id}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-900/5">
                        Property: {item.name}
                      </Link>
                    ))}
                    {searchResults.units.map((item) => (
                      <Link key={item.id} href={`/units/${item.id}`} className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-900/5">
                        Unit: {item.property.name} {item.unitNumber}
                      </Link>
                    ))}
                    {searchResults.tenants.map((item) => (
                      <Link key={item.id} href="/tenants" className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-900/5">
                        Tenant: {item.firstName} {item.lastName}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </form>
              <div className="flex items-center gap-3">
                <div className="hidden rounded-2xl bg-white px-4 py-2 lg:block">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Role</p>
                  <p className="text-sm font-semibold text-[var(--text)]">{user.role}</p>
                </div>
                <div className="relative">
                  <button type="button" className="rounded-2xl border border-[var(--line)] bg-white p-3 text-stone-700">
                    <Bell className="h-4 w-4" />
                  </button>
                  <div className="absolute right-0 top-[calc(100%+8px)] hidden w-80 rounded-[24px] border border-[var(--line)] bg-white p-3 shadow-2xl lg:block">
                    {notifications.map((item) => (
                      <div key={item.id} className="rounded-2xl px-3 py-2 hover:bg-stone-900/5">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p className="text-xs text-stone-500">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-[22px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand)] text-sm font-bold text-white">
                    {initials(user.firstName, user.lastName)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-stone-500">{user.organization.name}</p>
                  </div>
                  <form action={logoutAction}>
                    <button type="submit" className="rounded-xl px-3 py-2 text-sm text-stone-500 hover:bg-stone-900/5">
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
