import Link from "next/link";
import { ArrowRight, Building2, CreditCard, FileText, Home, KeyRound, UserPlus } from "lucide-react";

import { Card } from "@/components/ui/card";

function SetupStep({
  href,
  icon: Icon,
  title,
  detail,
  done
}: {
  href: string;
  icon: typeof Building2;
  title: string;
  detail: string;
  done?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--brand)]"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
          done ? "bg-emerald-600/10 text-emerald-700" : "bg-[var(--accent-soft)] text-[var(--brand)]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[var(--text)] transition group-hover:text-[var(--brand)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:text-[var(--brand)]" />
    </Link>
  );
}

// New-manager onboarding view shown instead of a wall of zero-value KPI cards.
export function EmptyDashboardState({
  mode,
  organizationName,
  stripeReady,
  hasProperties,
  hasUnits
}: {
  mode: "onboarding" | "setup";
  organizationName: string;
  stripeReady: boolean;
  hasProperties: boolean;
  hasUnits: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[rgba(13,143,123,0.18)] bg-[var(--accent-soft)] p-6">
        <p className="section-kicker">Getting started</p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
          {mode === "onboarding" ? `Welcome to Nexus, ${organizationName}` : "Finish setting up your portfolio"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-strong)]">
          {mode === "onboarding"
            ? "Start by adding your first property. Once your portfolio has units, leases, and payments, this dashboard becomes your daily command center: rent collected, outstanding balances, maintenance, renewals, and per-property performance."
            : "Your properties are in. Connect tenants and leases next so collections, occupancy, and renewals start tracking automatically."}
        </p>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2">
        {mode === "onboarding" ? (
          <>
            <SetupStep href="/properties?create=1" icon={Building2} title="Add your first property" detail="Create the building or home you manage." />
            <SetupStep href="/units?create=1" icon={Home} title="Add units" detail="Define the rentable units and their monthly rent." />
            <SetupStep href="/move-ins/new" icon={UserPlus} title="Invite a tenant" detail="Create a lease, schedule rent, and send the invite in one flow." />
            <SetupStep href="/settings" icon={CreditCard} title="Connect payments" detail={stripeReady ? "Stripe is connected and ready." : "Set up Stripe payouts to collect rent online."} done={stripeReady} />
          </>
        ) : (
          <>
            <SetupStep href="/move-ins/new" icon={UserPlus} title="Add tenants and leases" detail="Start a move-in to create the lease and rent schedule." />
            <SetupStep href={hasUnits ? "/units" : "/units?create=1"} icon={Home} title={hasUnits ? "Review units" : "Add units"} detail={hasUnits ? "Confirm rent amounts and occupancy status." : "Define the rentable units and their monthly rent."} done={hasUnits} />
            <SetupStep href="/settings" icon={CreditCard} title="Configure payments" detail={stripeReady ? "Stripe is connected and ready." : "Connect Stripe to collect rent online."} done={stripeReady} />
            <SetupStep href="/documents" icon={FileText} title="Upload documents" detail="Attach lease agreements and property files." />
          </>
        )}
      </div>
      {hasProperties ? (
        <div className="border-t border-[var(--line)] px-5 py-4">
          <Link href="/properties" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
            <KeyRound className="h-4 w-4" />
            View your properties
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
