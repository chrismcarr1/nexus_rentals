"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellRing,
  Building2,
  ClipboardList,
  CreditCard,
  FileCheck2,
  Gauge,
  Home,
  MessageSquare,
  Receipt,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";

import type { NavIconName } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const iconMap = {
  bellRing: BellRing,
  building2: Building2,
  clipboardList: ClipboardList,
  creditCard: CreditCard,
  fileCheck2: FileCheck2,
  gauge: Gauge,
  home: Home,
  messageSquare: MessageSquare,
  receipt: Receipt,
  settings: Settings,
  shieldCheck: ShieldCheck,
  users: Users
} satisfies Record<NavIconName, React.ComponentType<{ className?: string }>>;

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: NavIconName;
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-2">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group flex items-start gap-3 rounded-2xl border px-4 py-3.5 transition duration-200",
              active
                ? "border-[var(--line-strong)] bg-[var(--panel-strong)] text-[var(--text)] shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--panel)] hover:text-[var(--text)]"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition",
                active ? "bg-[var(--accent-soft)] text-[var(--brand)]" : "bg-white text-[var(--muted)] group-hover:bg-[var(--accent-soft)]"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
