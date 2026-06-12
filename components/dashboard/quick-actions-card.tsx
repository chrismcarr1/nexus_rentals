import Link from "next/link";
import { Building2, CreditCard, Download, FileText, Home, KeyRound, UserPlus, Wrench } from "lucide-react";

import { DetailSection } from "@/components/detail-section";

// Every action links to an existing flow; no new routes are introduced here.
const ACTIONS = [
  { href: "/properties?create=1", label: "Add property", icon: Building2 },
  { href: "/units?create=1", label: "Add unit", icon: Home },
  { href: "/move-ins/new", label: "Invite tenant", icon: UserPlus },
  { href: "/leases", label: "Create lease", icon: KeyRound },
  { href: "/transactions?create=record&tab=payments#new-payment", label: "Record payment", icon: CreditCard },
  { href: "/maintenance?create=1", label: "New work order", icon: Wrench },
  { href: "/documents", label: "Upload document", icon: FileText },
  { href: "/reports", label: "Export report", icon: Download }
];

export function QuickActionsCard() {
  return (
    <DetailSection title="Quick actions" description="Start the most common workflows.">
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className="group flex items-center gap-2.5 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--brand)]" />
              <span className="truncate">{action.label}</span>
            </Link>
          );
        })}
      </div>
    </DetailSection>
  );
}
