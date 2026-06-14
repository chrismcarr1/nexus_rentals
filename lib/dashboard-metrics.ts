// Pure, organization-agnostic dashboard math. Every metric on the manager
// dashboard is computed here from already-scoped records so the formulas are
// unit-testable and never recomputed ad hoc inside JSX. This module must stay
// free of "server-only" imports so tests can exercise it directly.

import {
  addDaysToDateKey,
  addMonthsToDateKey,
  appDateKeyFromValue,
  differenceInAppCalendarDays
} from "@/lib/app-time";

/* ── Structural input types ────────────────────────────────────────────────
   Subsets of the store types. Callers may pass richer objects; outputs only
   ever contain fields explicitly picked here, which is what keeps sensitive
   store fields (password hashes, tokens, legal IPs) out of client props. */

export type MetricPayment = {
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
};

export type MetricUnit = {
  id: string;
  propertyId: string;
  unitNumber: string;
  occupancyStatus: string;
  monthlyRent: number;
};

export type MetricLease = {
  id: string;
  nexusLeaseId?: string;
  unitId?: string;
  propertyId?: string;
  tenantIds: string[];
  status: string;
  startDate?: string;
  endDate?: string;
  monthlyRent: number;
};

export type MetricExpense = {
  id: string;
  propertyId: string;
  amount: number;
  incurredAt: string;
};

export type MetricMaintenance = {
  id: string;
  propertyId: string;
  unitId?: string;
  title: string;
  status: string;
  priority: string;
  requestedAt: string;
  assignedTo?: string;
};

export type MetricProperty = {
  id: string;
  name: string;
  status?: string;
};

export type MetricTenant = {
  id: string;
  firstName: string;
  lastName: string;
};

/* ── Date ranges ─────────────────────────────────────────────────────────── */

export type DashboardRangeKey = "this-month" | "last-month" | "last-30" | "last-90" | "ytd";

export const DASHBOARD_RANGE_OPTIONS: Array<{ key: DashboardRangeKey; label: string }> = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-90", label: "Last 90 days" },
  { key: "ytd", label: "Year to date" }
];

export type DashboardRange = {
  key: DashboardRangeKey;
  label: string;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
};

export function normalizeDashboardRangeKey(value?: string | null): DashboardRangeKey {
  const match = DASHBOARD_RANGE_OPTIONS.find((option) => option.key === value);
  return match?.key ?? "this-month";
}

export function getDashboardDateRange(key: DashboardRangeKey, todayKey: string): DashboardRange {
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const label = DASHBOARD_RANGE_OPTIONS.find((option) => option.key === key)?.label ?? "This month";

  if (key === "last-month") {
    const prevMonthStart = addMonthsToDateKey(monthStart, -1);
    const prevMonthEnd = addDaysToDateKey(monthStart, -1);
    return {
      key,
      label,
      start: prevMonthStart,
      end: prevMonthEnd,
      prevStart: addMonthsToDateKey(monthStart, -2),
      prevEnd: addDaysToDateKey(prevMonthStart, -1)
    };
  }
  if (key === "last-30") {
    return {
      key,
      label,
      start: addDaysToDateKey(todayKey, -29),
      end: todayKey,
      prevStart: addDaysToDateKey(todayKey, -59),
      prevEnd: addDaysToDateKey(todayKey, -30)
    };
  }
  if (key === "last-90") {
    return {
      key,
      label,
      start: addDaysToDateKey(todayKey, -89),
      end: todayKey,
      prevStart: addDaysToDateKey(todayKey, -179),
      prevEnd: addDaysToDateKey(todayKey, -90)
    };
  }
  if (key === "ytd") {
    return {
      key,
      label,
      start: `${todayKey.slice(0, 4)}-01-01`,
      end: todayKey,
      prevStart: `${Number(todayKey.slice(0, 4)) - 1}-01-01`,
      prevEnd: addMonthsToDateKey(todayKey, -12)
    };
  }
  // this-month (month to date): the comparable prior period is the same
  // day-window of the previous calendar month.
  return {
    key: "this-month",
    label,
    start: monthStart,
    end: todayKey,
    prevStart: addMonthsToDateKey(monthStart, -1),
    prevEnd: addMonthsToDateKey(todayKey, -1)
  };
}

function dateKeyInRange(dateKey: string, start: string, end: string) {
  return Boolean(dateKey) && dateKey >= start && dateKey <= end;
}

/* ── Payment helpers (mirror the transactions page semantics) ────────────── */

export function paymentPaidDateKey(payment: Pick<MetricPayment, "paidDate" | "stripePaidAt">) {
  return appDateKeyFromValue(payment.paidDate ?? payment.stripePaidAt);
}

export function paymentPaidAmount(payment: Pick<MetricPayment, "amount" | "amountPaid" | "stripeAmountPaidCents">) {
  if (typeof payment.amountPaid === "number") return payment.amountPaid;
  if (typeof payment.stripeAmountPaidCents === "number") return payment.stripeAmountPaidCents / 100;
  return payment.amount;
}

export function paymentBalanceDue(payment: Pick<MetricPayment, "status" | "amount" | "balanceDue" | "amountPaid">) {
  if (payment.status === "PAID") return 0;
  if (payment.balanceDue > 0) return payment.balanceDue;
  if (typeof payment.amountPaid === "number") return Math.max(0, payment.amount - payment.amountPaid);
  return payment.amount;
}

function paymentIsUnpaid(payment: MetricPayment) {
  return payment.status !== "PAID" && paymentBalanceDue(payment) > 0;
}

export function paymentIsOverdue(payment: MetricPayment, todayKey: string) {
  if (!paymentIsUnpaid(payment)) return false;
  const dueKey = appDateKeyFromValue(payment.dueDate);
  return payment.status === "LATE" || (Boolean(dueKey) && dueKey < todayKey);
}

function paymentPartyKey(payment: MetricPayment) {
  return payment.tenantId ?? payment.leaseId ?? payment.unitId;
}

/* ── KPI formulas ────────────────────────────────────────────────────────── */

export function calculateOccupancy(units: MetricUnit[]) {
  const rentableUnits = units.length;
  const occupiedUnits = units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
  return {
    occupiedUnits,
    rentableUnits,
    rate: rentableUnits ? occupiedUnits / rentableUnits : 0
  };
}

// Collected = money actually received inside the range. PAID charges count in
// full; PARTIAL charges count their received portion. Keyed by paid date, not
// due date, so late catch-up payments land in the period they were received.
export function calculateRentCollected(payments: MetricPayment[], range: Pick<DashboardRange, "start" | "end">) {
  let total = 0;
  let count = 0;
  for (const payment of payments) {
    if (payment.status !== "PAID" && payment.status !== "PARTIAL") continue;
    const paidKey = paymentPaidDateKey(payment);
    if (!dateKeyInRange(paidKey, range.start, range.end)) continue;
    total += paymentPaidAmount(payment);
    count += 1;
  }
  return { total, count };
}

// Outstanding = every unpaid balance that is due on or before the end of the
// selected range (older unpaid charges still need collecting, so they are
// included rather than silently dropped at the range boundary).
export function calculateOutstandingRent(payments: MetricPayment[], range: Pick<DashboardRange, "end">) {
  const open = payments.filter(
    (payment) => paymentIsUnpaid(payment) && appDateKeyFromValue(payment.dueDate) <= range.end
  );
  return {
    total: open.reduce((sum, payment) => sum + paymentBalanceDue(payment), 0),
    count: open.length,
    partiesAffected: new Set(open.map(paymentPartyKey)).size
  };
}

export function calculateOverdueRent(payments: MetricPayment[], todayKey: string) {
  const overdue = payments.filter((payment) => paymentIsOverdue(payment, todayKey));
  return {
    total: overdue.reduce((sum, payment) => sum + paymentBalanceDue(payment), 0),
    count: overdue.length,
    partiesAffected: new Set(overdue.map(paymentPartyKey)).size
  };
}

// Expected rent for the range = total charges that came due inside it. Used
// for the collection-rate supporting detail and the portfolio pulse.
export function calculateExpectedRent(payments: MetricPayment[], range: Pick<DashboardRange, "start" | "end">) {
  return payments
    .filter((payment) => dateKeyInRange(appDateKeyFromValue(payment.dueDate), range.start, range.end))
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function calculateExpensesInRange(expenses: MetricExpense[], range: Pick<DashboardRange, "start" | "end">) {
  return expenses
    .filter((expense) => dateKeyInRange(appDateKeyFromValue(expense.incurredAt), range.start, range.end))
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function calculateNetCashFlow(payments: MetricPayment[], expenses: MetricExpense[], range: Pick<DashboardRange, "start" | "end">) {
  const collected = calculateRentCollected(payments, range).total;
  const spent = calculateExpensesInRange(expenses, range);
  return { collected, expenses: spent, net: collected - spent };
}

/* ── Cash flow series ────────────────────────────────────────────────────── */

export type CashFlowPoint = {
  label: string;
  startKey: string;
  collected: number;
  expenses: number;
  net: number;
};

function shortDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

function shortMonthLabel(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

// Buckets actual paid amounts and expenses across the range: daily up to ~5
// weeks, weekly up to ~5 months, monthly beyond that. Buckets are keyed by
// their start date; a value belongs to the latest bucket whose start <= key.
export function buildCashFlowSeries(
  payments: MetricPayment[],
  expenses: MetricExpense[],
  range: Pick<DashboardRange, "start" | "end">
): CashFlowPoint[] {
  const spanDays = differenceInAppCalendarDays(range.end, range.start) + 1;
  if (spanDays <= 0) return [];

  const bucketStarts: string[] = [];
  if (spanDays <= 35) {
    for (let cursor = range.start; cursor && cursor <= range.end; cursor = addDaysToDateKey(cursor, 1)) {
      bucketStarts.push(cursor);
    }
  } else if (spanDays <= 150) {
    for (let cursor = range.start; cursor && cursor <= range.end; cursor = addDaysToDateKey(cursor, 7)) {
      bucketStarts.push(cursor);
    }
  } else {
    let cursor = `${range.start.slice(0, 7)}-01`;
    while (cursor && cursor.slice(0, 7) <= range.end.slice(0, 7)) {
      bucketStarts.push(cursor < range.start ? range.start : cursor);
      cursor = addMonthsToDateKey(`${cursor.slice(0, 7)}-01`, 1);
    }
  }

  const monthly = spanDays > 150;
  const buckets = bucketStarts.map((startKey) => ({
    label: monthly ? shortMonthLabel(startKey) : shortDateLabel(startKey),
    startKey,
    collected: 0,
    expenses: 0,
    net: 0
  }));

  const bucketFor = (dateKey: string) => {
    if (!dateKeyInRange(dateKey, range.start, range.end)) return null;
    for (let index = buckets.length - 1; index >= 0; index -= 1) {
      if (buckets[index].startKey <= dateKey) return buckets[index];
    }
    return null;
  };

  for (const payment of payments) {
    if (payment.status !== "PAID" && payment.status !== "PARTIAL") continue;
    const bucket = bucketFor(paymentPaidDateKey(payment));
    if (bucket) bucket.collected += paymentPaidAmount(payment);
  }
  for (const expense of expenses) {
    const bucket = bucketFor(appDateKeyFromValue(expense.incurredAt));
    if (bucket) bucket.expenses += expense.amount;
  }
  for (const bucket of buckets) {
    bucket.net = bucket.collected - bucket.expenses;
  }
  return buckets;
}

/* ── Rent status breakdown ───────────────────────────────────────────────── */

export type RentStatusSegment = {
  key: "paid" | "partial" | "outstanding" | "overdue";
  label: string;
  amount: number;
  count: number;
};

// Groups the period's rent picture by what state the money is in: received
// (paid in range), partially received (open remainder), still pending (due,
// not yet late), and overdue. Only non-empty segments are returned.
export function getRentStatusBreakdown(
  payments: MetricPayment[],
  range: Pick<DashboardRange, "start" | "end">,
  todayKey: string
): { segments: RentStatusSegment[]; totalTracked: number } {
  const paid = calculateRentCollected(payments, range);

  let partialAmount = 0;
  let partialCount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;

  for (const payment of payments) {
    if (!paymentIsUnpaid(payment)) continue;
    const dueKey = appDateKeyFromValue(payment.dueDate);
    if (!dueKey || dueKey > range.end) continue;
    const balance = paymentBalanceDue(payment);
    if (payment.status === "PARTIAL") {
      partialAmount += balance;
      partialCount += 1;
    } else if (paymentIsOverdue(payment, todayKey)) {
      overdueAmount += balance;
      overdueCount += 1;
    } else {
      pendingAmount += balance;
      pendingCount += 1;
    }
  }

  const segments: RentStatusSegment[] = [];
  if (paid.count) segments.push({ key: "paid", label: "Paid", amount: paid.total, count: paid.count });
  if (partialCount) segments.push({ key: "partial", label: "Partially paid", amount: partialAmount, count: partialCount });
  if (pendingCount) segments.push({ key: "outstanding", label: "Outstanding", amount: pendingAmount, count: pendingCount });
  if (overdueCount) segments.push({ key: "overdue", label: "Overdue", amount: overdueAmount, count: overdueCount });

  return { segments, totalTracked: segments.reduce((sum, segment) => sum + segment.amount, 0) };
}

/* ── Leases ──────────────────────────────────────────────────────────────── */

function leaseIsActive(status: string) {
  return status === "ACTIVE" || status === "active";
}

export type LeaseExpirationRow = {
  leaseId: string;
  leaseLabel: string;
  tenantName: string;
  propertyName: string;
  unitNumber?: string;
  endDate: string;
  daysRemaining: number;
  monthlyRent: number;
  status: string;
};

export function getLeaseExpirations(
  leases: MetricLease[],
  context: {
    todayKey: string;
    windowDays: number;
    tenants: MetricTenant[];
    units: MetricUnit[];
    properties: MetricProperty[];
  }
): LeaseExpirationRow[] {
  return leases
    .filter((lease) => leaseIsActive(lease.status) && lease.endDate)
    .map((lease) => {
      const endKey = appDateKeyFromValue(lease.endDate);
      const daysRemaining = differenceInAppCalendarDays(endKey, context.todayKey);
      const unit = lease.unitId ? context.units.find((item) => item.id === lease.unitId) : undefined;
      const property = context.properties.find((item) => item.id === (lease.propertyId ?? unit?.propertyId));
      const tenant = lease.tenantIds.map((id) => context.tenants.find((item) => item.id === id)).find(Boolean);
      return {
        leaseId: lease.id,
        leaseLabel: lease.nexusLeaseId ?? lease.id,
        tenantName: tenant ? `${tenant.firstName} ${tenant.lastName}` : "Tenant",
        propertyName: property?.name ?? "Property",
        unitNumber: unit?.unitNumber,
        endDate: endKey,
        daysRemaining,
        monthlyRent: lease.monthlyRent,
        status: lease.status
      };
    })
    .filter((row) => row.endDate && row.daysRemaining >= 0 && row.daysRemaining <= context.windowDays)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/* ── Maintenance ─────────────────────────────────────────────────────────── */

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function maintenanceIsOpen(item: Pick<MetricMaintenance, "status">) {
  return item.status === "OPEN" || item.status === "IN_PROGRESS";
}

export type MaintenanceQueueRow = {
  id: string;
  title: string;
  propertyName: string;
  unitNumber?: string;
  priority: string;
  status: string;
  requestedAt: string;
  assignedTo?: string;
};

// Urgent/high first, then the oldest open request (the one waiting longest).
export function getMaintenanceQueue(
  maintenance: MetricMaintenance[],
  context: { units: MetricUnit[]; properties: MetricProperty[] }
): MaintenanceQueueRow[] {
  return maintenance
    .filter(maintenanceIsOpen)
    .sort((a, b) => {
      const rankDiff = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
      if (rankDiff !== 0) return rankDiff;
      return a.requestedAt.localeCompare(b.requestedAt);
    })
    .map((item) => {
      const unit = item.unitId ? context.units.find((candidate) => candidate.id === item.unitId) : undefined;
      const property = context.properties.find((candidate) => candidate.id === item.propertyId);
      return {
        id: item.id,
        title: item.title,
        propertyName: property?.name ?? "Property",
        unitNumber: unit?.unitNumber,
        priority: item.priority,
        status: item.status,
        requestedAt: appDateKeyFromValue(item.requestedAt) || item.requestedAt,
        assignedTo: item.assignedTo
      };
    });
}

/* ── Urgent tasks ────────────────────────────────────────────────────────── */

export type UrgentTask = {
  key: string;
  label: string;
  detail: string;
  count: number;
  href: string;
  tone: "danger" | "warning" | "default";
};

export function getUrgentTasks(input: {
  overdue: { total: number; count: number; partiesAffected: number };
  urgentMaintenanceCount: number;
  openMaintenanceCount: number;
  leasesExpiring30: number;
  vacantUnitsWithoutActiveLease: number;
  stripeReady: boolean;
  pendingApplicationCount?: number;
  formatCurrency: (value: number) => string;
}): UrgentTask[] {
  const tasks: UrgentTask[] = [];
  if (input.overdue.count) {
    tasks.push({
      key: "overdue-rent",
      label: "Overdue rent to collect",
      detail: `${input.formatCurrency(input.overdue.total)} across ${input.overdue.partiesAffected} tenant${input.overdue.partiesAffected === 1 ? "" : "s"}`,
      count: input.overdue.count,
      href: "/transactions?status=overdue",
      tone: "danger"
    });
  }
  if (input.urgentMaintenanceCount) {
    tasks.push({
      key: "urgent-maintenance",
      label: "Urgent maintenance",
      detail: "High-priority work orders awaiting action",
      count: input.urgentMaintenanceCount,
      href: "/maintenance?status=active&priority=URGENT",
      tone: "danger"
    });
  } else if (input.openMaintenanceCount) {
    tasks.push({
      key: "open-maintenance",
      label: "Open maintenance",
      detail: "Active work orders to triage or resolve",
      count: input.openMaintenanceCount,
      href: "/maintenance?status=active",
      tone: "warning"
    });
  }
  if (input.leasesExpiring30) {
    tasks.push({
      key: "expiring-leases",
      label: "Leases expiring within 30 days",
      detail: "Renewal decisions due soon",
      count: input.leasesExpiring30,
      href: "/leases",
      tone: "warning"
    });
  }
  if (!input.stripeReady) {
    tasks.push({
      key: "stripe-setup",
      label: "Payment setup required",
      detail: "Connect Stripe to collect rent online",
      count: 1,
      href: "/settings",
      tone: "warning"
    });
  }
  if (input.pendingApplicationCount) {
    tasks.push({
      key: "pending-applications",
      label: "Applications to review",
      detail: "Submitted rental applications awaiting a decision",
      count: input.pendingApplicationCount,
      href: "/applications",
      tone: "warning"
    });
  }
  if (input.vacantUnitsWithoutActiveLease) {
    tasks.push({
      key: "vacant-units",
      label: "Units without an active lease",
      detail: "Vacant units ready to fill",
      count: input.vacantUnitsWithoutActiveLease,
      href: "/units",
      tone: "default"
    });
  }
  return tasks;
}

/* ── Portfolio pulse ─────────────────────────────────────────────────────── */

export type PulseStatus = "healthy" | "watch" | "attention";

export type PulseRow = {
  key: string;
  label: string;
  status: PulseStatus;
  detail: string;
  href: string;
};

export function getPortfolioPulse(input: {
  occupancyRate: number;
  hasUnits: boolean;
  collectionRate: number | null;
  openMaintenanceCount: number;
  urgentMaintenanceCount: number;
  leasesExpiring30: number;
  leasesExpiring60: number;
  stripeReady: boolean;
}): PulseRow[] {
  const occupancyStatus: PulseStatus = !input.hasUnits
    ? "watch"
    : input.occupancyRate >= 0.95
      ? "healthy"
      : input.occupancyRate >= 0.85
        ? "watch"
        : "attention";
  const collectionStatus: PulseStatus =
    input.collectionRate === null
      ? "healthy"
      : input.collectionRate >= 0.95
        ? "healthy"
        : input.collectionRate >= 0.85
          ? "watch"
          : "attention";
  const maintenanceStatus: PulseStatus = input.urgentMaintenanceCount
    ? "attention"
    : input.openMaintenanceCount
      ? "watch"
      : "healthy";
  const renewalStatus: PulseStatus = input.leasesExpiring30 ? "attention" : input.leasesExpiring60 ? "watch" : "healthy";

  return [
    {
      key: "occupancy",
      label: "Occupancy",
      status: occupancyStatus,
      detail: input.hasUnits ? `${Math.round(input.occupancyRate * 100)}% of units occupied` : "No units yet",
      href: "/units"
    },
    {
      key: "collections",
      label: "Rent collection",
      status: collectionStatus,
      detail:
        input.collectionRate === null
          ? "No rent due in this period"
          : `${Math.round(input.collectionRate * 100)}% of expected rent collected`,
      href: "/transactions"
    },
    {
      key: "maintenance",
      label: "Maintenance",
      status: maintenanceStatus,
      detail: input.urgentMaintenanceCount
        ? `${input.urgentMaintenanceCount} urgent work order${input.urgentMaintenanceCount === 1 ? "" : "s"}`
        : input.openMaintenanceCount
          ? `${input.openMaintenanceCount} open work order${input.openMaintenanceCount === 1 ? "" : "s"}`
          : "No open work orders",
      href: "/maintenance"
    },
    {
      key: "renewals",
      label: "Renewals",
      status: renewalStatus,
      detail: input.leasesExpiring30
        ? `${input.leasesExpiring30} lease${input.leasesExpiring30 === 1 ? "" : "s"} ending within 30 days`
        : input.leasesExpiring60
          ? `${input.leasesExpiring60} lease${input.leasesExpiring60 === 1 ? "" : "s"} ending within 60 days`
          : "No near-term expirations",
      href: "/leases"
    },
    {
      key: "payments-setup",
      label: "Payment setup",
      status: input.stripeReady ? "healthy" : "attention",
      detail: input.stripeReady ? "Stripe connected and verified" : "Stripe payout setup incomplete",
      href: "/settings"
    }
  ];
}

/* ── Property performance ────────────────────────────────────────────────── */

export type PropertyPerformanceRow = {
  propertyId: string;
  name: string;
  unitCount: number;
  occupiedUnits: number;
  occupancyRate: number;
  collected: number;
  outstanding: number;
  overdue: number;
  openMaintenance: number;
  expiringLeases: number;
  needsAttention: boolean;
};

export function getPropertyPerformance(input: {
  properties: MetricProperty[];
  units: MetricUnit[];
  payments: MetricPayment[];
  leases: MetricLease[];
  maintenance: MetricMaintenance[];
  range: Pick<DashboardRange, "start" | "end">;
  todayKey: string;
}): PropertyPerformanceRow[] {
  const activeProperties = input.properties.filter((property) => property.status !== "ARCHIVED");

  return activeProperties
    .map((property) => {
      const units = input.units.filter((unit) => unit.propertyId === property.id);
      const unitIds = new Set(units.map((unit) => unit.id));
      const payments = input.payments.filter((payment) => unitIds.has(payment.unitId));
      const leases = input.leases.filter((lease) =>
        lease.propertyId === property.id || (lease.unitId ? unitIds.has(lease.unitId) : false)
      );
      const occupancy = calculateOccupancy(units);
      const collected = calculateRentCollected(payments, input.range).total;
      const outstanding = calculateOutstandingRent(payments, input.range).total;
      const overdue = calculateOverdueRent(payments, input.todayKey).total;
      const openMaintenance = input.maintenance.filter(
        (item) => item.propertyId === property.id && maintenanceIsOpen(item)
      ).length;
      const expiringLeases = leases.filter((lease) => {
        if (!leaseIsActive(lease.status) || !lease.endDate) return false;
        const days = differenceInAppCalendarDays(appDateKeyFromValue(lease.endDate), input.todayKey);
        return days >= 0 && days <= 60;
      }).length;

      return {
        propertyId: property.id,
        name: property.name,
        unitCount: units.length,
        occupiedUnits: occupancy.occupiedUnits,
        occupancyRate: occupancy.rate,
        collected,
        outstanding,
        overdue,
        openMaintenance,
        expiringLeases,
        needsAttention: overdue > 0 || openMaintenance > 0 || (units.length > 0 && occupancy.rate < 0.85)
      };
    })
    .sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      if (b.outstanding !== a.outstanding) return b.outstanding - a.outstanding;
      if (b.openMaintenance !== a.openMaintenance) return b.openMaintenance - a.openMaintenance;
      return a.name.localeCompare(b.name);
    });
}

/* ── Insight ─────────────────────────────────────────────────────────────── */

export type DashboardInsight = {
  title: string;
  body: string;
  href: string;
  linkLabel: string;
  tone: "danger" | "warning" | "success";
};

// Deterministic recommendation, highest-impact rule first. No generated text:
// every branch is a fixed template over real numbers.
export function getDashboardInsight(input: {
  stripeReady: boolean;
  hasProperties: boolean;
  propertyPerformance: PropertyPerformanceRow[];
  overdue: { total: number; count: number; partiesAffected: number };
  leaseExpirations: LeaseExpirationRow[];
  collectionRate: number | null;
  prevCollectionRate: number | null;
  vacantUnitsWithoutActiveLease: number;
  formatCurrency: (value: number) => string;
}): DashboardInsight {
  if (input.hasProperties && !input.stripeReady) {
    return {
      title: "Finish payment setup",
      body: "Stripe payouts are not fully configured, so tenants cannot pay rent online yet. Completing setup removes the biggest friction from collections.",
      href: "/settings",
      linkLabel: "Open payment settings",
      tone: "warning"
    };
  }

  const worstOverdueProperty = input.propertyPerformance.find((row) => row.overdue > 0);
  if (worstOverdueProperty && input.overdue.total > 0) {
    return {
      title: "Follow up on overdue rent",
      body: `${worstOverdueProperty.name} has the highest overdue balance at ${input.formatCurrency(worstOverdueProperty.overdue)}. ${input.formatCurrency(input.overdue.total)} is overdue portfolio-wide across ${input.overdue.partiesAffected} tenant${input.overdue.partiesAffected === 1 ? "" : "s"}.`,
      href: "/transactions?status=overdue",
      linkLabel: "Open overdue collections",
      tone: "danger"
    };
  }

  const soonestExpiration = input.leaseExpirations.find((row) => row.daysRemaining <= 30);
  if (soonestExpiration) {
    return {
      title: "Renewal decision due",
      body: `The lease for ${soonestExpiration.tenantName} at ${soonestExpiration.propertyName}${soonestExpiration.unitNumber ? ` Unit ${soonestExpiration.unitNumber}` : ""} ends in ${soonestExpiration.daysRemaining} day${soonestExpiration.daysRemaining === 1 ? "" : "s"}. Starting the renewal conversation early protects occupancy.`,
      href: `/leases/${soonestExpiration.leaseId}`,
      linkLabel: "Review lease",
      tone: "warning"
    };
  }

  if (input.vacantUnitsWithoutActiveLease > 0) {
    return {
      title: "Vacant units ready to lease",
      body: `${input.vacantUnitsWithoutActiveLease} unit${input.vacantUnitsWithoutActiveLease === 1 ? " is" : "s are"} vacant without an active lease. Each filled unit adds directly to monthly collected rent.`,
      href: "/units",
      linkLabel: "View units",
      tone: "warning"
    };
  }

  if (
    input.collectionRate !== null &&
    input.prevCollectionRate !== null &&
    input.prevCollectionRate > 0 &&
    input.collectionRate < input.prevCollectionRate - 0.05
  ) {
    return {
      title: "Collection rate is slipping",
      body: `Rent collection is at ${Math.round(input.collectionRate * 100)}% of expected this period, down from ${Math.round(input.prevCollectionRate * 100)}% in the prior period.`,
      href: "/transactions",
      linkLabel: "Open collections",
      tone: "warning"
    };
  }

  return {
    title: "Portfolio looks healthy",
    body: "No urgent issues detected. Collections, occupancy, and maintenance are all within normal ranges.",
    href: "/reports",
    linkLabel: "Open reports",
    tone: "success"
  };
}

/* ── Trend helpers ───────────────────────────────────────────────────────── */

// Percent change vs the prior comparable period; null when the prior period
// has no baseline (hide the trend instead of inventing one).
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / previous;
}

// Daily cumulative collected-rent sparkline across the range (capped to the
// last `points` days for long ranges).
export function buildCollectedSparkline(
  payments: MetricPayment[],
  range: Pick<DashboardRange, "start" | "end">,
  points = 30
): number[] {
  const spanDays = differenceInAppCalendarDays(range.end, range.start) + 1;
  if (spanDays <= 0) return [];
  const start = spanDays > points ? addDaysToDateKey(range.end, -(points - 1)) : range.start;

  const totalsByDay = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "PAID" && payment.status !== "PARTIAL") continue;
    const paidKey = paymentPaidDateKey(payment);
    if (!dateKeyInRange(paidKey, range.start, range.end)) continue;
    totalsByDay.set(paidKey, (totalsByDay.get(paidKey) ?? 0) + paymentPaidAmount(payment));
  }

  const series: number[] = [];
  let running = 0;
  for (let cursor = start; cursor && cursor <= range.end; cursor = addDaysToDateKey(cursor, 1)) {
    running += totalsByDay.get(cursor) ?? 0;
    series.push(running);
  }
  return series;
}
