"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  MessageSquare,
  Receipt,
  Settings,
  ShieldCheck,
  TableProperties,
  Users,
  type LucideIcon
} from "lucide-react";

import type { NavIconName } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const icons: Record<NavIconName, LucideIcon> = {
  barChart3: BarChart3,
  bellRing: BellRing,
  building2: Building2,
  clipboardList: ClipboardList,
  creditCard: CreditCard,
  fileCheck2: FileCheck2,
  fileText: FileText,
  gauge: Gauge,
  home: Home,
  messageSquare: MessageSquare,
  receipt: Receipt,
  settings: Settings,
  shieldCheck: ShieldCheck,
  tableProperties: TableProperties,
  users: Users
};

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: NavIconName;
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return <SidebarItem key={item.href} item={item} active={active} />;
      })}
    </nav>
  );
}

export function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = icons[item.icon];

  return (
    <Link
      href={item.href}
      title={item.description}
      className={cn(
        "sidebar-nav-item group relative flex items-center gap-2.5 rounded-md border px-2 py-1.5 transition duration-150",
        active
          ? "border-[var(--brand)] bg-[var(--accent-soft)] text-[var(--text)] shadow-[0_0_0_1px_rgba(13,143,123,0.12)_inset]"
          : "border-transparent text-[var(--muted)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-sm bg-transparent transition",
          active && "bg-[var(--brand)]"
        )}
      />
      <span
        className={cn(
          "sidebar-nav-icon transition",
          active
            ? "border-[rgba(13,143,123,0.28)] bg-white text-[var(--brand)]"
            : "bg-transparent text-[var(--muted)] group-hover:border-[var(--line)] group-hover:bg-white group-hover:text-[var(--text)]"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{item.label}</span>
        <span className="sidebar-nav-description sr-only">{item.description}</span>
      </span>
    </Link>
  );
}
