// Operations Timeline event model.
//
// Builds a normalized, urgency-grouped list of portfolio events (rent,
// leases, move-ins, maintenance, documents, payment setup) from real store
// records. Pure module: callers pass data that is already scoped to the
// current user via services/portal, and the builder additionally drops any
// record it cannot trace to a property in the caller's organization, so a
// stray cross-org record can never produce an event.

import { appDateKeyFromValue, differenceInAppCalendarDays } from "@/lib/app-time";
import { getLeaseBilling } from "@/lib/payment-charge";

export type OperationsEventType =
  | "RENT_OVERDUE"
  | "RENT_DUE"
  | "LEASE_START"
  | "LEASE_EXPIRATION"
  | "MOVE_IN"
  | "MOVE_OUT"
  | "MAINTENANCE_DUE"
  | "MAINTENANCE_SCHEDULED"
  | "DOCUMENT"
  | "PAYMENT_SETUP"
  | "REMINDER";

export type OperationsEventGroup = "overdue" | "today" | "week" | "month" | "later";

export type OperationsEvent = {
  id: string;
  type: OperationsEventType;
  title: string;
  description: string;
  date: string; // app date key YYYY-MM-DD
  group: OperationsEventGroup;
  priority: "high" | "normal";
  status: string;
  amountCents: number | null;
  propertyId?: string;
  unitId?: string;
  tenantId?: string;
  leaseId?: string;
  paymentId?: string;
  maintenanceId?: string;
  href: string;
  actionLabel: string;
  organizationId: string;
  propertyLabel?: string;
  unitLabel?: string;
  tenantLabel?: string;
};

export const OPERATIONS_GROUPS: Array<{ key: OperationsEventGroup; label: string }> = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "Next 30 days" },
  { key: "later", label: "Later" }
];

export const OPERATIONS_FILTERS = [
  { key: "all", label: "All" },
  { key: "rent", label: "Rent" },
  { key: "leases", label: "Leases" },
  { key: "maintenance", label: "Maintenance" },
  { key: "move-ins", label: "Move-ins" },
  { key: "documents", label: "Documents" },
  { key: "payment-setup", label: "Payment setup" }
] as const;

export type OperationsFilterKey = (typeof OPERATIONS_FILTERS)[number]["key"];

const FILTER_TYPES: Record<Exclude<OperationsFilterKey, "all">, OperationsEventType[]> = {
  rent: ["RENT_OVERDUE", "RENT_DUE"],
  leases: ["LEASE_START", "LEASE_EXPIRATION", "MOVE_OUT"],
  maintenance: ["MAINTENANCE_DUE", "MAINTENANCE_SCHEDULED"],
  "move-ins": ["MOVE_IN"],
  documents: ["DOCUMENT"],
  "payment-setup": ["PAYMENT_SETUP"]
};

export function normalizeOperationsFilter(value?: string | null): OperationsFilterKey {
  return OPERATIONS_FILTERS.some((filter) => filter.key === value) ? (value as OperationsFilterKey) : "all";
}

export function eventMatchesFilter(event: Pick<OperationsEvent, "type">, filter: OperationsFilterKey) {
  if (filter === "all") return true;
  return FILTER_TYPES[filter].includes(event.type);
}

export function eventMatchesSearch(
  event: Pick<OperationsEvent, "title" | "description" | "propertyLabel" | "unitLabel" | "tenantLabel">,
  query: string
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [event.title, event.description, event.propertyLabel, event.unitLabel, event.tenantLabel]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function classifyOperationsGroup(dateKey: string, todayKey: string): OperationsEventGroup {
  if (!dateKey || dateKey < todayKey) return "overdue";
  if (dateKey === todayKey) return "today";
  const days = differenceInAppCalendarDays(dateKey, todayKey);
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

type TimelineProperty = { id: string; organizationId: string; name: string };
type TimelineUnit = { id: string; propertyId: string; unitNumber: string; nickname?: string | null };
type TimelineTenant = { id: string; firstName: string; lastName: string };
type TimelineLease = {
  id: string;
  status: string;
  propertyId?: string;
  unitId?: string;
  tenantIds: string[];
  startDate?: string;
  endDate?: string;
  moveInDate?: string;
  monthlyRent: number;
  managerAbsorbsPaymentCharge?: boolean;
  paymentChargeResponsibility?: string;
  documentPath?: string;
};
type TimelinePayment = {
  id: string;
  unitId: string;
  leaseId?: string;
  tenantId?: string;
  description: string;
  amount: number;
  balanceDue: number;
  dueDate: string;
  status: string;
  categoryTag?: string;
};
type TimelineMaintenance = {
  id: string;
  propertyId: string;
  unitId?: string;
  title: string;
  status: string;
  priority: string;
  requestedAt: string;
};

export type OperationsTimelineInput = {
  organizationId: string;
  todayKey: string;
  properties: TimelineProperty[];
  units: TimelineUnit[];
  tenants: TimelineTenant[];
  leases: TimelineLease[];
  payments: TimelinePayment[];
  maintenance: TimelineMaintenance[];
  // Stripe Connect readiness for the signed-in manager; pass null to skip the
  // payment-setup event (e.g. on pages that already surface it elsewhere).
  paymentSetup?: { ready: boolean; detail?: string } | null;
};

const ACTIVE_LEASE_STATUSES = new Set(["ACTIVE", "active"]);
const CURRENT_LEASE_STATUSES = new Set(["ACTIVE", "UPCOMING", "active", "invited"]);
const LEASE_EXPIRATION_WINDOW_DAYS = 90;

export function buildOperationsTimeline(input: OperationsTimelineInput): OperationsEvent[] {
  const { organizationId, todayKey } = input;
  const orgProperties = new Map(
    input.properties.filter((property) => property.organizationId === organizationId).map((property) => [property.id, property])
  );
  const unitsById = new Map(input.units.map((unit) => [unit.id, unit]));
  const tenantsById = new Map(input.tenants.map((tenant) => [tenant.id, tenant]));

  function propertyForUnit(unitId?: string) {
    const unit = unitId ? unitsById.get(unitId) : undefined;
    return unit ? orgProperties.get(unit.propertyId) : undefined;
  }

  function leaseProperty(lease: TimelineLease) {
    return (lease.propertyId ? orgProperties.get(lease.propertyId) : undefined) ?? propertyForUnit(lease.unitId);
  }

  function unitLabelFor(unitId?: string) {
    const unit = unitId ? unitsById.get(unitId) : undefined;
    if (!unit) return undefined;
    return `Unit ${unit.unitNumber}${unit.nickname ? ` - ${unit.nickname}` : ""}`;
  }

  function tenantLabelFor(tenantId?: string) {
    const tenant = tenantId ? tenantsById.get(tenantId) : undefined;
    return tenant ? `${tenant.firstName} ${tenant.lastName}`.trim() : undefined;
  }

  const events: OperationsEvent[] = [];

  function push(
    event: Omit<OperationsEvent, "group" | "organizationId">,
    groupOverride?: OperationsEventGroup
  ) {
    events.push({
      ...event,
      group: groupOverride ?? classifyOperationsGroup(event.date, todayKey),
      organizationId
    });
  }

  for (const payment of input.payments) {
    if (payment.status === "PAID") continue;
    const property = propertyForUnit(payment.unitId);
    if (!property) continue;
    const dueKey = appDateKeyFromValue(payment.dueDate);
    if (!dueKey) continue;
    const overdue = dueKey < todayKey || payment.status === "LATE";
    const balance = payment.balanceDue > 0 ? payment.balanceDue : payment.amount;
    const category = (payment.categoryTag ?? "").toLowerCase();
    const kindLabel = category === "deposit" ? "Deposit" : category === "late fee" ? "Late fee" : "Rent";
    const tenantParam = payment.tenantId ? `tenantId=${encodeURIComponent(payment.tenantId)}` : "";
    push({
      id: `payment-${payment.id}`,
      type: overdue ? "RENT_OVERDUE" : "RENT_DUE",
      title: overdue ? `${kindLabel} overdue` : `${kindLabel} due`,
      description: payment.description,
      date: dueKey,
      priority: overdue ? "high" : "normal",
      status: payment.status,
      amountCents: Math.round(balance * 100),
      propertyId: property.id,
      unitId: payment.unitId,
      tenantId: payment.tenantId,
      leaseId: payment.leaseId,
      paymentId: payment.id,
      href: overdue
        ? `/transactions?status=overdue${tenantParam ? `&${tenantParam}` : ""}`
        : tenantParam
          ? `/transactions?${tenantParam}`
          : "/transactions",
      actionLabel: "View payment",
      propertyLabel: property.name,
      unitLabel: unitLabelFor(payment.unitId),
      tenantLabel: tenantLabelFor(payment.tenantId)
    }, overdue ? "overdue" : undefined);
  }

  for (const lease of input.leases) {
    const property = leaseProperty(lease);
    if (!property) continue;
    const tenantLabel = tenantLabelFor(lease.tenantIds?.[0]);
    const unitLabel = unitLabelFor(lease.unitId);
    const startKey = lease.startDate ? appDateKeyFromValue(lease.startDate) : "";
    const endKey = lease.endDate ? appDateKeyFromValue(lease.endDate) : "";
    const moveInKey = lease.moveInDate ? appDateKeyFromValue(lease.moveInDate) : "";
    const billing = getLeaseBilling(lease);

    if (CURRENT_LEASE_STATUSES.has(lease.status) && startKey && startKey >= todayKey) {
      push({
        id: `lease-start-${lease.id}`,
        type: "LEASE_START",
        title: "Lease starts",
        description: tenantLabel ? `New tenancy for ${tenantLabel}` : "New tenancy begins",
        date: startKey,
        priority: "normal",
        status: lease.status,
        amountCents: Math.round(billing.tenantFacingRent * 100),
        propertyId: property.id,
        unitId: lease.unitId,
        tenantId: lease.tenantIds?.[0],
        leaseId: lease.id,
        href: `/leases/${lease.id}`,
        actionLabel: "View lease",
        propertyLabel: property.name,
        unitLabel,
        tenantLabel
      });
    }

    if (CURRENT_LEASE_STATUSES.has(lease.status) && moveInKey && moveInKey >= todayKey && moveInKey !== startKey) {
      push({
        id: `move-in-${lease.id}`,
        type: "MOVE_IN",
        title: "Move-in scheduled",
        description: tenantLabel ? `${tenantLabel} moves in` : "Tenant move-in",
        date: moveInKey,
        priority: "normal",
        status: lease.status,
        amountCents: null,
        propertyId: property.id,
        unitId: lease.unitId,
        tenantId: lease.tenantIds?.[0],
        leaseId: lease.id,
        href: `/leases/${lease.id}`,
        actionLabel: "View move-in",
        propertyLabel: property.name,
        unitLabel,
        tenantLabel
      });
    }

    if (ACTIVE_LEASE_STATUSES.has(lease.status) && endKey && endKey >= todayKey) {
      const daysLeft = differenceInAppCalendarDays(endKey, todayKey);
      if (daysLeft <= LEASE_EXPIRATION_WINDOW_DAYS) {
        push({
          id: `lease-end-${lease.id}`,
          type: "LEASE_EXPIRATION",
          title: "Lease expires",
          description: `${daysLeft === 0 ? "Ends today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`} - renewal decision needed`,
          date: endKey,
          priority: daysLeft <= 30 ? "high" : "normal",
          status: lease.status,
          amountCents: null,
          propertyId: property.id,
          unitId: lease.unitId,
          tenantId: lease.tenantIds?.[0],
          leaseId: lease.id,
          href: `/leases/${lease.id}`,
          actionLabel: "View lease",
          propertyLabel: property.name,
          unitLabel,
          tenantLabel
        });
      }
    }

    if (lease.status === "invited" || lease.status === "draft") {
      push({
        id: `lease-document-${lease.id}`,
        type: "DOCUMENT",
        title: lease.status === "invited" ? "Tenant invite pending" : "Move-in setup incomplete",
        description:
          lease.status === "invited"
            ? "Waiting on the tenant to accept the portal invite"
            : "Draft lease has not been completed",
        date: startKey || todayKey,
        priority: startKey && startKey < todayKey ? "high" : "normal",
        status: lease.status,
        amountCents: null,
        propertyId: property.id,
        unitId: lease.unitId,
        tenantId: lease.tenantIds?.[0],
        leaseId: lease.id,
        href: `/leases/${lease.id}`,
        actionLabel: "View lease",
        propertyLabel: property.name,
        unitLabel,
        tenantLabel
      });
    }
  }

  for (const item of input.maintenance) {
    if (item.status !== "OPEN" && item.status !== "IN_PROGRESS") continue;
    const property = orgProperties.get(item.propertyId);
    if (!property) continue;
    const requestedKey = appDateKeyFromValue(item.requestedAt);
    const urgent = item.priority === "URGENT" || item.priority === "HIGH";
    push({
      id: `maintenance-${item.id}`,
      type: "MAINTENANCE_DUE",
      title: urgent ? "Urgent maintenance" : "Open maintenance",
      description: requestedKey ? `${item.title} - requested ${requestedKey}` : item.title,
      // Maintenance records have requestedAt but no due/scheduled field.
      // Keep open work actionable without presenting the request date as a
      // missed deadline.
      date: todayKey,
      priority: urgent ? "high" : "normal",
      status: item.status,
      amountCents: null,
      propertyId: property.id,
      unitId: item.unitId,
      maintenanceId: item.id,
      href: "/maintenance?status=active",
      actionLabel: "View work order",
      propertyLabel: property.name,
      unitLabel: unitLabelFor(item.unitId)
    });
  }

  if (input.paymentSetup && !input.paymentSetup.ready) {
    push({
      id: "payment-setup",
      type: "PAYMENT_SETUP",
      title: "Payment setup needs attention",
      description: input.paymentSetup.detail || "Connect Stripe to collect rent online.",
      date: todayKey,
      priority: "high",
      status: "ACTION_REQUIRED",
      amountCents: null,
      href: "/settings",
      actionLabel: "Open settings"
    });
  }

  return sortOperationsEvents(events);
}

const GROUP_ORDER: Record<OperationsEventGroup, number> = { overdue: 0, today: 1, week: 2, month: 3, later: 4 };

export function sortOperationsEvents(events: OperationsEvent[]) {
  return [...events].sort((a, b) => {
    if (GROUP_ORDER[a.group] !== GROUP_ORDER[b.group]) return GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function groupOperationsEvents(events: OperationsEvent[]) {
  return OPERATIONS_GROUPS.map((group) => ({
    ...group,
    events: events.filter((event) => event.group === group.key)
  })).filter((group) => group.events.length > 0);
}

export function filterOperationsEvents(events: OperationsEvent[], filter: OperationsFilterKey, query?: string) {
  return events.filter((event) => eventMatchesFilter(event, filter) && eventMatchesSearch(event, query ?? ""));
}
