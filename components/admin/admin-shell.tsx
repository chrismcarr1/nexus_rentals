"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  FileDown,
  FileSearch,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X
} from "lucide-react";

import { cn, initials } from "@/lib/utils";

const navigation = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, section: "Control center" },
  { href: "/admin/growth", label: "Growth", icon: ChartNoAxesCombined, section: "Control center" },
  { href: "/admin/product-analytics", label: "Product Analytics", icon: BarChart3, section: "Control center" },
  { href: "/admin/users", label: "Users", icon: Users, section: "Accounts" },
  { href: "/admin/managers", label: "Managers", icon: ShieldCheck, section: "Accounts" },
  { href: "/admin/tenants", label: "Tenants", icon: Users, section: "Accounts" },
  { href: "/admin/properties", label: "Properties", icon: Building2, section: "Platform data" },
  { href: "/admin/applications", label: "Applications", icon: ClipboardCheck, section: "Platform data" },
  { href: "/admin/payments", label: "Payments", icon: CircleDollarSign, section: "Financial systems" },
  { href: "/admin/stripe", label: "Stripe", icon: CreditCard, section: "Financial systems" },
  { href: "/admin/email", label: "Email", icon: Mail, section: "Operations" },
  { href: "/admin/operations", label: "Operations", icon: FileSearch, section: "Operations" },
  { href: "/admin/reports", label: "Reports", icon: FileDown, section: "Operations" },
  { href: "/admin/system-health", label: "System Health", icon: HeartPulse, section: "System" },
  { href: "/admin/settings", label: "Settings", icon: Settings, section: "System" }
] as const;

export function AdminShell({
  user,
  logoutAction,
  children
}: {
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = navigation.reduce<Array<{ section: string; items: typeof navigation[number][] }>>((result, item) => {
    const current = result[result.length - 1];
    if (!current || current.section !== item.section) {
      result.push({ section: item.section, items: [item] });
    } else {
      current.items.push(item);
    }
    return result;
  }, []);
  const activeItem = navigation.find((item) =>
    item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  const navContent = (
    <nav className="sidebar-nav" aria-label="Admin navigation">
      {groups.map((group) => (
        <div key={group.section} className="sidebar-nav-group">
          <p className="sidebar-nav-label">{group.section}</p>
          <div className="sidebar-nav-list">
            {group.items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "sidebar-nav-item group relative flex items-center gap-2 px-3 transition duration-150",
                    active
                      ? "bg-[var(--sidebar-active)] text-white"
                      : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
                  )}
                >
                  <span className={cn("absolute inset-y-1 left-0 w-0.5 bg-transparent", active && "bg-[var(--brand)]")} />
                  <span className={cn("sidebar-nav-icon", active && "text-[var(--brand)]")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.label}</span>
                  {active ? <ChevronRight className="h-3.5 w-3.5 text-[var(--sidebar-muted)]" /> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="app-frame admin-frame">
      <div className="app-shell-layout">
        <aside className="app-sidebar">
          <Link href="/admin" className="app-sidebar-brand">
            <span className="app-brand-mark flex h-8 w-8 items-center justify-center text-xs font-bold">NX</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">Nexus Admin</span>
              <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">Platform control center</span>
            </span>
          </Link>
          <div className="app-sidebar-scroll">{navContent}</div>
          <div className="app-sidebar-footer">
            <div className="flex items-center gap-2.5 px-2 py-3">
              <span className="avatar-mark flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
                {initials(user.firstName, user.lastName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{user.firstName} {user.lastName}</span>
                <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">System admin</span>
              </span>
              <form action={logoutAction}>
                <button type="submit" aria-label="Log out" className="p-2 text-[var(--sidebar-muted)] hover:text-white">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </aside>
        <main className="app-main">
          <header className="app-topbar">
            <div className="app-topbar-inner flex min-w-0 items-center gap-3">
              <Link href="/admin" className="mobile-topbar-brand" aria-label="Admin overview">
                <span className="app-brand-mark flex h-8 w-8 items-center justify-center text-xs font-bold">NX</span>
              </Link>
              <p className="mobile-topbar-title">{activeItem?.label ?? "Admin"}</p>
              <form action="/admin/users" className="topbar-search relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  name="q"
                  placeholder="Search users, managers, tenants, or records"
                  className="field app-shell-search-input h-9 max-w-2xl text-sm"
                />
              </form>
              <div className="hidden items-center gap-2 border-l border-[var(--line)] pl-3 md:flex">
                <Activity className="h-4 w-4 text-[var(--brand)]" />
                <span className="text-xs font-semibold text-[var(--muted)]">Live platform view</span>
              </div>
              <div className="topbar-actions flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
                  aria-expanded={menuOpen}
                  aria-controls="admin-mobile-menu"
                  aria-haspopup="dialog"
                  className="mobile-nav-trigger topbar-icon-button"
                >
                  {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </header>
          <div className="app-content">
            <div className="app-content-inner">{children}</div>
          </div>
        </main>
      </div>
      <div
        id="admin-mobile-menu"
        className={cn("mobile-menu-overlay", menuOpen && "mobile-menu-overlay-open")}
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation menu"
      >
        <div className="mobile-menu-header">
          <Link href="/admin" className="mobile-menu-brand" onClick={() => setMenuOpen(false)} aria-label="Admin overview">
            <span className="app-brand-mark flex h-8 w-8 items-center justify-center text-xs font-bold">NX</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">Nexus Admin</span>
              <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">Platform control center</span>
            </span>
          </Link>
          <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close navigation menu" className="mobile-menu-close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mobile-menu-scroll">{navContent}</div>
        <div className="mobile-menu-footer">
          <div className="mobile-menu-identity">
            <span className="avatar-mark flex h-9 w-9 shrink-0 items-center justify-center text-xs font-bold">
              {initials(user.firstName, user.lastName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{user.firstName} {user.lastName}</span>
              <span className="block truncate text-[11px] text-[var(--sidebar-muted)]">System admin</span>
            </span>
          </div>
          <div className="mobile-menu-footer-actions">
            <form action={logoutAction} className="contents">
              <button type="submit" className="mobile-menu-footer-link mobile-menu-logout">
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
