import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  Settings,
  Wrench,
  type LucideIcon
} from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  groupOperationsEvents,
  type OperationsEvent,
  type OperationsEventGroup,
  type OperationsEventType
} from "@/lib/operations-timeline";
import { formatCurrency } from "@/lib/utils";

const eventIcons: Record<OperationsEventType, LucideIcon> = {
  RENT_OVERDUE: AlertCircle,
  RENT_DUE: CreditCard,
  LEASE_START: Home,
  LEASE_EXPIRATION: CalendarClock,
  MOVE_IN: KeyRound,
  MOVE_OUT: KeyRound,
  MAINTENANCE_DUE: Wrench,
  MAINTENANCE_SCHEDULED: Wrench,
  DOCUMENT: FileText,
  PAYMENT_SETUP: Settings,
  REMINDER: CalendarClock
};

const groupTone: Record<OperationsEventGroup, string> = {
  overdue: "operations-group-overdue",
  today: "operations-group-today",
  week: "operations-group-week",
  month: "operations-group-month",
  later: "operations-group-later"
};

function typeLabel(type: OperationsEventType) {
  switch (type) {
    case "RENT_OVERDUE":
      return "Overdue rent";
    case "RENT_DUE":
      return "Rent";
    case "LEASE_START":
      return "Lease start";
    case "LEASE_EXPIRATION":
      return "Lease expiration";
    case "MOVE_IN":
      return "Move-in";
    case "MOVE_OUT":
      return "Move-out";
    case "MAINTENANCE_DUE":
    case "MAINTENANCE_SCHEDULED":
      return "Maintenance";
    case "DOCUMENT":
      return "Document";
    case "PAYMENT_SETUP":
      return "Payment setup";
    default:
      return "Reminder";
  }
}

function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function OperationsEventRow({ event, compact = false }: { event: OperationsEvent; compact?: boolean }) {
  const Icon = eventIcons[event.type];
  return (
    <Link href={event.href} className={`operations-event ${event.priority === "high" ? "operations-event-high" : ""}`}>
      <span className="operations-event-icon" aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="operations-type-badge">{typeLabel(event.type)}</span>
          <span className="text-xs font-medium text-[var(--muted)]">{formatEventDate(event.date)}</span>
        </span>
        <span className="mt-1.5 block font-semibold text-[var(--text)]">{event.title}</span>
        {!compact ? <span className="mt-1 block text-sm leading-5 text-[var(--muted)]">{event.description}</span> : null}
        <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
          {event.propertyLabel ? <span>{event.propertyLabel}</span> : null}
          {event.unitLabel ? <span>{event.unitLabel}</span> : null}
          {event.tenantLabel ? <span>{event.tenantLabel}</span> : null}
        </span>
      </span>
      <span className="operations-event-action">
        {event.amountCents !== null ? <strong>{formatCurrency(event.amountCents / 100)}</strong> : null}
        <span>
          {event.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </span>
    </Link>
  );
}

export function OperationsTimelineList({
  events,
  emptyMessage = "No upcoming portfolio deadlines."
}: {
  events: OperationsEvent[];
  emptyMessage?: string;
}) {
  const groups = groupOperationsEvents(events);
  if (!groups.length) {
    return (
      <Card className="operations-empty">
        <CalendarClock className="h-6 w-6 text-[var(--brand)]" />
        <h2>No upcoming portfolio deadlines.</h2>
        <p>{emptyMessage}</p>
      </Card>
    );
  }

  return (
    <div className="operations-timeline">
      {groups.map((group) => (
        <section key={group.key} className={`operations-group ${groupTone[group.key]}`}>
          <div className="operations-group-header">
            <div>
              <p>{group.label}</p>
              <span>{group.events.length} {group.events.length === 1 ? "item" : "items"}</span>
            </div>
          </div>
          <div className="operations-group-events">
            {group.events.map((event) => <OperationsEventRow key={event.id} event={event} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export function UpcomingOperationsCard({
  events,
  href,
  title = "Upcoming Operations"
}: {
  events: OperationsEvent[];
  href?: string;
  title?: string;
}) {
  const important = events.slice(0, 5);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <p className="section-kicker">Command center</p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        </div>
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand)]">
            View full timeline
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {important.length ? (
          important.map((event) => <OperationsEventRow key={event.id} event={event} compact />)
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="font-semibold">No upcoming portfolio deadlines.</p>
            <p className="mt-1 text-sm text-[var(--muted)]">New events will appear as leases, payments, and maintenance are added.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
