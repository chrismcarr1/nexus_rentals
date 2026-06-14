import "server-only";

import { appDateKeyFromValue, differenceInAppCalendarDays, getAppDateKey } from "@/lib/app-time";
import {
  buildCashFlowSeries,
  buildCollectedSparkline,
  calculateExpectedRent,
  calculateExpensesInRange,
  calculateOccupancy,
  calculateOutstandingRent,
  calculateOverdueRent,
  calculateRentCollected,
  getDashboardDateRange,
  getDashboardInsight,
  getLeaseExpirations,
  getMaintenanceQueue,
  getPortfolioPulse,
  getPropertyPerformance,
  getRentStatusBreakdown,
  getUrgentTasks,
  maintenanceIsOpen,
  normalizeDashboardRangeKey,
  percentChange,
  type CashFlowPoint,
  type DashboardInsight,
  type DashboardRange,
  type LeaseExpirationRow,
  type MaintenanceQueueRow,
  type MetricExpense,
  type MetricLease,
  type MetricMaintenance,
  type MetricPayment,
  type MetricProperty,
  type MetricTenant,
  type MetricUnit,
  type PropertyPerformanceRow,
  type PulseRow,
  type RentStatusSegment,
  type UrgentTask
} from "@/lib/dashboard-metrics";
import { managerOwnsApplication } from "@/lib/applications";
import { getDiscussionPageData } from "@/lib/discussions";
import { getStripeConnectState } from "@/lib/stripe-connect";
import { timeAsync } from "@/lib/perf";
import { getOrganizationSnapshot, type User } from "@/lib/store";
import { formatCurrency } from "@/lib/utils";
import { getPortalContext } from "@/services/portal";

export type DashboardActivityItem = {
  id: string;
  title: string;
  detail: string;
  date: string;
  kind: "payment" | "maintenance" | "notification";
  href?: string;
};

export type DashboardMessagePreview = {
  conversationKey: string;
  tenantName: string;
  propertyName: string;
  unitNumber?: string;
  snippet?: string;
  lastMessageAt?: string;
  hasUnread: boolean;
};

export type DashboardKpis = {
  occupancy: { occupiedUnits: number; rentableUnits: number; rate: number };
  collected: { total: number; count: number; expected: number; rateOfExpected: number | null; trend: number | null };
  outstanding: { total: number; count: number; partiesAffected: number };
  overdue: { total: number; count: number; partiesAffected: number };
  maintenance: { open: number; urgent: number };
  leaseExpirations: { within30: number; within60: number; within90: number };
  netCashFlow: { collected: number; expenses: number; net: number; hasExpenseData: boolean; trend: number | null };
};

export type ManagerDashboardData = {
  range: DashboardRange;
  emptyState: "onboarding" | "setup" | null;
  organizationName: string;
  kpis: DashboardKpis;
  collectedSparkline: number[];
  cashFlowSeries: CashFlowPoint[];
  rentStatusBreakdown: { segments: RentStatusSegment[]; totalTracked: number };
  urgentTasks: UrgentTask[];
  portfolioPulse: PulseRow[];
  recentActivity: DashboardActivityItem[];
  maintenanceQueue: MaintenanceQueueRow[];
  leaseExpirations: LeaseExpirationRow[];
  propertyPerformance: PropertyPerformanceRow[];
  tenantMessages: DashboardMessagePreview[];
  unreadMessageCount: number;
  insight: DashboardInsight;
  stripe: { ready: boolean; label: string; detail: string };
  pendingApplicationCount: number;
  counts: { properties: number; units: number; tenants: number; activeLeases: number };
};

/* Explicit field picks. The portal scope objects are full store records; only
   these neutral fields may cross into dashboard data (and therefore into
   client component props). Never spread the source objects here. */

function pickPayment(payment: {
  id: string;
  unitId: string;
  leaseId?: string;
  tenantId?: string;
  description: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  status: string;
  balanceDue: number;
  amountPaid?: number;
  stripeAmountPaidCents?: number;
  stripePaidAt?: string;
  categoryTag?: string;
}): MetricPayment {
  return {
    id: payment.id,
    unitId: payment.unitId,
    leaseId: payment.leaseId,
    tenantId: payment.tenantId,
    description: payment.description,
    amount: payment.amount,
    dueDate: payment.dueDate,
    paidDate: payment.paidDate,
    status: payment.status,
    balanceDue: payment.balanceDue,
    amountPaid: payment.amountPaid,
    stripeAmountPaidCents: payment.stripeAmountPaidCents,
    stripePaidAt: payment.stripePaidAt,
    categoryTag: payment.categoryTag
  };
}

function pickUnit(unit: { id: string; propertyId: string; unitNumber: string; occupancyStatus: string; monthlyRent: number }): MetricUnit {
  return {
    id: unit.id,
    propertyId: unit.propertyId,
    unitNumber: unit.unitNumber,
    occupancyStatus: unit.occupancyStatus,
    monthlyRent: unit.monthlyRent
  };
}

function pickLease(lease: {
  id: string;
  nexusLeaseId?: string;
  unitId?: string;
  propertyId?: string;
  tenantIds: string[];
  status: string;
  startDate?: string;
  endDate?: string;
  monthlyRent: number;
}): MetricLease {
  return {
    id: lease.id,
    nexusLeaseId: lease.nexusLeaseId,
    unitId: lease.unitId,
    propertyId: lease.propertyId,
    tenantIds: lease.tenantIds,
    status: lease.status,
    startDate: lease.startDate,
    endDate: lease.endDate,
    monthlyRent: lease.monthlyRent
  };
}

function pickExpense(expense: { id: string; propertyId: string; amount: number; incurredAt: string }): MetricExpense {
  return { id: expense.id, propertyId: expense.propertyId, amount: expense.amount, incurredAt: expense.incurredAt };
}

function pickMaintenance(item: {
  id: string;
  propertyId: string;
  unitId?: string;
  title: string;
  status: string;
  priority: string;
  requestedAt: string;
  assignedTo?: string;
}): MetricMaintenance {
  return {
    id: item.id,
    propertyId: item.propertyId,
    unitId: item.unitId,
    title: item.title,
    status: item.status,
    priority: item.priority,
    requestedAt: item.requestedAt,
    assignedTo: item.assignedTo
  };
}

function pickProperty(property: { id: string; name: string; status?: string }): MetricProperty {
  return { id: property.id, name: property.name, status: property.status };
}

function pickTenant(tenant: { id: string; firstName: string; lastName: string }): MetricTenant {
  return { id: tenant.id, firstName: tenant.firstName, lastName: tenant.lastName };
}

const VISIBLE_LEASE_STATUSES = new Set(["ACTIVE", "UPCOMING", "active", "invited"]);

function buildRecentActivity(input: {
  payments: MetricPayment[];
  maintenance: MetricMaintenance[];
  notifications: Array<{ id: string; title: string; body: string; createdAt: string; href?: string }>;
}): DashboardActivityItem[] {
  const items: DashboardActivityItem[] = [
    ...input.payments
      .filter((payment) => payment.status === "PAID" || payment.status === "PARTIAL")
      .map((payment) => ({
        id: `payment-${payment.id}`,
        title: payment.status === "PARTIAL" ? "Partial payment received" : "Payment received",
        detail: `${payment.description} — ${formatCurrency(payment.amountPaid ?? payment.amount)}`,
        date: payment.paidDate ?? payment.stripePaidAt ?? payment.dueDate,
        kind: "payment" as const,
        href: `/transactions?tab=payments&payment=${payment.id}`
      })),
    ...input.maintenance.map((item) => ({
      id: `maintenance-${item.id}`,
      title: maintenanceIsOpen(item) ? "Maintenance request" : "Maintenance resolved",
      detail: `${item.title} (${item.priority.toLowerCase()} priority)`,
      date: item.requestedAt,
      kind: "maintenance" as const,
      href: `/maintenance?workOrder=${item.id}`
    })),
    ...input.notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.title,
      detail: notification.body,
      date: notification.createdAt,
      kind: "notification" as const,
      href: notification.href
    }))
  ];

  return items
    .filter((item) => Boolean(item.date))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);
}

export async function getManagerDashboardData(
  user: User & { organization: { name: string } },
  rangeParam?: string
): Promise<ManagerDashboardData> {
  const portal = await timeAsync("[perf:dashboard] aggregation.portalContext", () => getPortalContext(user));
  const todayKey = getAppDateKey();
  const range = getDashboardDateRange(normalizeDashboardRangeKey(rangeParam), todayKey);

  const properties = portal.scope.properties.map(pickProperty);
  const units = portal.scope.units.map(pickUnit);
  const leases = portal.scope.leases.map(pickLease);
  const payments = portal.scope.payments.map(pickPayment);
  const expenses = portal.scope.expenses.map(pickExpense);
  const maintenance = portal.scope.maintenance.map(pickMaintenance);
  const tenants = portal.scope.tenants.map(pickTenant);

  const stripeState = getStripeConnectState(user);

  const occupancy = calculateOccupancy(units);
  const collected = calculateRentCollected(payments, range);
  const prevRange = { start: range.prevStart, end: range.prevEnd };
  const prevCollected = calculateRentCollected(payments, prevRange);
  const expected = calculateExpectedRent(payments, range);
  const prevExpected = calculateExpectedRent(payments, prevRange);
  const outstanding = calculateOutstandingRent(payments, range);
  const overdue = calculateOverdueRent(payments, todayKey);
  const expensesInRange = calculateExpensesInRange(expenses, range);
  const prevExpenses = calculateExpensesInRange(expenses, prevRange);
  const net = collected.total - expensesInRange;
  const prevNet = prevCollected.total - prevExpenses;

  const openMaintenance = maintenance.filter(maintenanceIsOpen);
  const urgentMaintenance = openMaintenance.filter((item) => item.priority === "URGENT" || item.priority === "HIGH");

  const leaseExpirations90 = getLeaseExpirations(leases, { todayKey, windowDays: 90, tenants, units, properties });
  const within30 = leaseExpirations90.filter((row) => row.daysRemaining <= 30).length;
  const within60Rows = leaseExpirations90.filter((row) => row.daysRemaining <= 60);

  const activeLeaseUnitIds = new Set(
    leases.filter((lease) => VISIBLE_LEASE_STATUSES.has(lease.status) && lease.unitId).map((lease) => lease.unitId as string)
  );
  const vacantUnitsWithoutActiveLease = units.filter(
    (unit) => unit.occupancyStatus !== "OCCUPIED" && !activeLeaseUnitIds.has(unit.id)
  ).length;

  const collectionRate = expected > 0 ? collected.total / expected : null;
  const prevCollectionRate = prevExpected > 0 ? prevCollected.total / prevExpected : null;

  const propertyPerformance = getPropertyPerformance({
    properties,
    units,
    payments,
    leases,
    maintenance,
    range,
    todayKey
  });

  // Pending application submissions are not part of the portal scope; count
  // them the same way the applications page does (manager-owned links only).
  // Reuse the request-cached org snapshot's store instead of a second full read.
  const snapshot = await timeAsync("[perf:dashboard] aggregation.orgSnapshot", () =>
    getOrganizationSnapshot(user.organizationId)
  );
  const store = snapshot.store;
  const ownedApplicationIds = new Set(
    store.rentalApplications.filter((application) => managerOwnsApplication(store, user, application)).map((item) => item.id)
  );
  const pendingApplicationCount = store.applicationSubmissions.filter(
    (submission) =>
      ownedApplicationIds.has(submission.applicationId) &&
      (submission.status === "SUBMITTED" || submission.status === "UNDER_REVIEW")
  ).length;

  const urgentTasks = getUrgentTasks({
    overdue,
    urgentMaintenanceCount: urgentMaintenance.length,
    openMaintenanceCount: openMaintenance.length,
    leasesExpiring30: within30,
    vacantUnitsWithoutActiveLease,
    stripeReady: stripeState.ready,
    pendingApplicationCount,
    formatCurrency
  });

  const portfolioPulse = getPortfolioPulse({
    occupancyRate: occupancy.rate,
    hasUnits: units.length > 0,
    collectionRate,
    openMaintenanceCount: openMaintenance.length,
    urgentMaintenanceCount: urgentMaintenance.length,
    leasesExpiring30: within30,
    leasesExpiring60: within60Rows.length,
    stripeReady: stripeState.ready
  });

  const insight = getDashboardInsight({
    stripeReady: stripeState.ready,
    hasProperties: properties.length > 0,
    propertyPerformance,
    overdue,
    leaseExpirations: leaseExpirations90,
    collectionRate,
    prevCollectionRate,
    vacantUnitsWithoutActiveLease,
    formatCurrency
  });

  const discussions = await timeAsync("[perf:dashboard] aggregation.discussions", () =>
    getDiscussionPageData(user, undefined, store)
  );
  const tenantMessages: DashboardMessagePreview[] = discussions.conversations
    .filter((conversation) => conversation.messageCount > 0 || conversation.hasUnread)
    .sort((a, b) => Number(b.hasUnread) - Number(a.hasUnread) || String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? "")))
    .slice(0, 4)
    .map((conversation) => ({
      conversationKey: conversation.key,
      tenantName: conversation.tenantName,
      propertyName: conversation.propertyName,
      unitNumber: conversation.unitNumber,
      snippet: conversation.lastMessageBody,
      lastMessageAt: conversation.lastMessageAt,
      hasUnread: conversation.hasUnread
    }));
  const unreadMessageCount = discussions.conversations.filter((conversation) => conversation.hasUnread).length;

  const recentActivity = buildRecentActivity({
    payments,
    maintenance,
    notifications: portal.notifications.slice(0, 10).map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      createdAt: notification.createdAt,
      href: notification.href
    }))
  });

  const visibleLeases = leases.filter((lease) => VISIBLE_LEASE_STATUSES.has(lease.status));
  const emptyState: ManagerDashboardData["emptyState"] =
    properties.length === 0 ? "onboarding" : visibleLeases.length === 0 ? "setup" : null;

  return {
    range,
    emptyState,
    organizationName: user.organization.name,
    kpis: {
      occupancy,
      collected: {
        total: collected.total,
        count: collected.count,
        expected,
        rateOfExpected: collectionRate,
        trend: percentChange(collected.total, prevCollected.total)
      },
      outstanding,
      overdue,
      maintenance: { open: openMaintenance.length, urgent: urgentMaintenance.length },
      leaseExpirations: {
        within30,
        within60: within60Rows.length,
        within90: leaseExpirations90.length
      },
      netCashFlow: {
        collected: collected.total,
        expenses: expensesInRange,
        net,
        hasExpenseData: expenses.length > 0,
        trend: percentChange(net, prevNet)
      }
    },
    collectedSparkline: buildCollectedSparkline(payments, range),
    cashFlowSeries: buildCashFlowSeries(payments, expenses, range),
    rentStatusBreakdown: getRentStatusBreakdown(payments, range, todayKey),
    urgentTasks,
    portfolioPulse,
    recentActivity,
    maintenanceQueue: getMaintenanceQueue(maintenance, { units, properties }).slice(0, 6),
    leaseExpirations: within60Rows,
    propertyPerformance,
    tenantMessages,
    unreadMessageCount,
    insight,
    stripe: { ready: stripeState.ready, label: stripeState.label, detail: stripeState.detail },
    pendingApplicationCount,
    counts: {
      properties: properties.length,
      units: units.length,
      tenants: tenants.length,
      activeLeases: visibleLeases.length
    }
  };
}

export function describeDashboardRange(range: DashboardRange) {
  const startKey = appDateKeyFromValue(range.start);
  const endKey = appDateKeyFromValue(range.end);
  const spanDays = differenceInAppCalendarDays(endKey, startKey) + 1;
  return { startKey, endKey, spanDays };
}
