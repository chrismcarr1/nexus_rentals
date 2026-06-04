"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Building2, ChevronDown, ClipboardList, CreditCard, FileCheck2, Home, KeyRound, Plus } from "lucide-react";

import { useClickOutside } from "@/components/use-click-outside";
import { cn } from "@/lib/utils";

const managerActions = [
  { href: "/properties?create=1", label: "New Property", icon: Building2 },
  { href: "/units?create=1", label: "New Unit", icon: Home },
  { href: "/leases", label: "New Lease", icon: KeyRound },
  { href: "/move-ins/new", label: "New Move-In", icon: Plus },
  { href: "/applications/new", label: "New Application", icon: FileCheck2 },
  { href: "/transactions?create=1", label: "Record Payment", icon: CreditCard }
];

const adminActions = [
  { href: "/properties?create=1", label: "New Property", icon: Building2 },
  { href: "/units?create=1", label: "New Unit", icon: Home },
  { href: "/leases", label: "New Lease", icon: KeyRound },
  { href: "/transactions?create=1", label: "Record Payment", icon: CreditCard },
  { href: "/maintenance", label: "Work Order", icon: ClipboardList }
];

export function QuickActionMenu({
  role,
  compact = false
}: {
  role: "ADMIN" | "MANAGER" | "TENANT";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setOpen(false), open);
  const actions = role === "TENANT" ? [] : role === "ADMIN" ? adminActions : managerActions;

  if (!actions.length) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]",
          compact && "w-10 px-0"
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="h-4 w-4" />
        {compact ? <span className="sr-only">Quick actions</span> : <span>New</span>}
        {compact ? null : <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 rounded-md border border-[var(--line)] bg-[var(--surface-strong)] p-1.5 shadow-[0_18px_38px_rgba(20,33,30,0.14)]">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-hover)]"
              >
                <Icon className="h-4 w-4 text-[var(--muted)]" />
                {action.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
