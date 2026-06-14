"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  Home,
  Megaphone,
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
  calendarClock: CalendarClock,
  clipboardList: ClipboardList,
  creditCard: CreditCard,
  fileCheck2: FileCheck2,
  fileText: FileText,
  gauge: Gauge,
  home: Home,
  megaphone: Megaphone,
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
  section?: string;
};

export function SidebarNav({
  items,
  collapsed = false,
  ariaLabel = "Primary navigation"
}: {
  items: NavItem[];
  collapsed?: boolean;
  ariaLabel?: string;
}) {
  const pathname = usePathname();
  const groups = items.reduce<Array<{ label?: string; items: NavItem[] }>>((result, item) => {
    const current = result[result.length - 1];
    if (!current || current.label !== item.section) {
      result.push({ label: item.section, items: [item] });
    } else {
      current.items.push(item);
    }
    return result;
  }, []);

  return (
    <nav className="sidebar-nav" aria-label={ariaLabel} data-collapsed={collapsed}>
      {groups.map((group, groupIndex) => (
        <div key={`${group.label ?? "navigation"}-${groupIndex}`} className="sidebar-nav-group">
          {group.label ? <p className="sidebar-nav-label">{group.label}</p> : null}
          <div className="sidebar-nav-list">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return <SidebarItem key={item.href} item={item} active={active} />;
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = icons[item.icon];

  return (
    <Link
      href={item.href}
      title={`${item.label}: ${item.description}`}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "sidebar-nav-item group relative flex items-center gap-2.5 px-3 transition duration-150",
        active
          ? "bg-[var(--sidebar-active)] text-[var(--sidebar-active-text)]"
          : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-transparent transition",
          active && "bg-[var(--brand)]"
        )}
      />
      <span
        className={cn(
          "sidebar-nav-icon transition",
          active
            ? "text-[var(--brand)]"
            : "text-[var(--sidebar-muted)] group-hover:text-white"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="sidebar-nav-text min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-5">{item.label}</span>
      </span>
    </Link>
  );
}
