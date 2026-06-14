import "server-only";

import { cache } from "react";

import { getEffectiveUserRole } from "@/lib/admin";
import { addDaysToDateKey, appDateIsBefore, differenceInAppCalendarDays, getAppDateKey, monthKeyFromValue } from "@/lib/app-time";
import { timeAsyncTracked } from "@/lib/perf";
import { getOrganizationSnapshot, type Notification, type UserRole } from "@/lib/store";

function leaseIsVisibleCurrent(status: string) {
  return status === "ACTIVE" || status === "UPCOMING" || status === "active" || status === "invited";
}

function leaseIsActive(status: string) {
  return status === "ACTIVE" || status === "active";
}

type AppUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string;
};

// Scheduled lease-integrity and rent-generation catch-up jobs no longer run in
// the render path: they were doing two updateStore transactions per cold
// request and busting the readStore cache mid-render. They now run via the
// /api/cron/scheduled-maintenance cron (see lib/scheduled-maintenance.ts), and
// mutating actions (move-ins, lease edits, invite accept) still invoke the
// schedulers directly, so portal data stays current without blocking rendering.

export const getPortalContext = cache((user: AppUser) =>
  // Instrumented inside the React cache() so the timing reflects the real
  // one-time portal build per request; the layout and page share this result.
  timeAsyncTracked("[perf:dashboard] getPortalContext", "portalContextMs", () => buildPortalContext(user))
);

async function buildPortalContext(user: AppUser) {
  const snapshot = await timeAsyncTracked("[perf:dashboard] orgSnapshot", "orgSnapshotMs", () =>
    getOrganizationSnapshot(user.organizationId)
  );
  const effectiveUsers = snapshot.users.map((candidate) => ({
    ...candidate,
    role: getEffectiveUserRole(candidate.role, candidate.email)
  }));
  const todayKey = getAppDateKey();
  const currentMonthKey = todayKey.slice(0, 7);

  const managerAssignments = new Map(snapshot.properties.map((property) => [property.id, property.managerId ?? null]));
  const tenantProfile =
    user.role === "TENANT"
      ? snapshot.tenants.find((tenant) => tenant.email?.toLowerCase() === user.email.toLowerCase()) ?? null
      : null;

  const tenantLeaseIds =
    user.role === "TENANT"
      ? snapshot.leases
          .filter((lease) => lease.tenantUserId === user.id || (tenantProfile ? lease.tenantIds.includes(tenantProfile.id) : false))
          .map((lease) => lease.id)
      : [];
  const tenantLeases = snapshot.leases.filter((lease) => tenantLeaseIds.includes(lease.id));
  const tenantUnitIds = tenantLeases.map((lease) => lease.unitId).filter(Boolean) as string[];
  const tenantDirectPaymentUnitIds =
    user.role === "TENANT" && tenantProfile
      ? snapshot.payments.filter((payment) => payment.tenantId === tenantProfile.id).map((payment) => payment.unitId).filter(Boolean)
      : [];
  const tenantPropertyIds = tenantLeases
    .map((lease) => {
      if (lease.propertyId) return lease.propertyId;
      const unit = lease.unitId ? snapshot.units.find((candidate) => candidate.id === lease.unitId) : null;
      return unit?.propertyId;
    })
    .filter(Boolean) as string[];
  const tenantDirectPaymentPropertyIds = tenantDirectPaymentUnitIds
    .map((unitId) => snapshot.units.find((candidate) => candidate.id === unitId)?.propertyId)
    .filter(Boolean) as string[];

  const propertyIds =
    user.role === "ADMIN"
      ? snapshot.properties.map((property) => property.id)
      : user.role === "MANAGER"
        ? snapshot.properties.filter((property) => property.managerId === user.id).map((property) => property.id)
        : Array.from(new Set([...tenantPropertyIds, ...tenantDirectPaymentPropertyIds]));

  const unitIds =
    user.role === "TENANT"
      ? Array.from(new Set([...tenantUnitIds, ...tenantDirectPaymentUnitIds]))
      : snapshot.units.filter((unit) => propertyIds.includes(unit.propertyId)).map((unit) => unit.id);
  const leaseIds =
    user.role === "TENANT"
      ? tenantLeaseIds
      : snapshot.leases.filter((lease) => (lease.unitId && unitIds.includes(lease.unitId)) || (lease.propertyId && propertyIds.includes(lease.propertyId))).map((lease) => lease.id);
  const tenantIds =
    user.role === "TENANT"
      ? tenantProfile
        ? [tenantProfile.id]
        : []
      : snapshot.tenants.map((tenant) => tenant.id);

  const scoped = {
    properties: snapshot.properties.filter((property) => propertyIds.includes(property.id)),
    units: snapshot.units.filter((unit) => unitIds.includes(unit.id)),
    leases: snapshot.leases.filter((lease) => leaseIds.includes(lease.id)),
    tenants: snapshot.tenants.filter((tenant) => tenantIds.includes(tenant.id)),
    payments: snapshot.payments.filter((payment) => {
      if (user.role !== "TENANT") return unitIds.includes(payment.unitId);
      if (tenantProfile && payment.tenantId === tenantProfile.id) return true;
      if (!unitIds.includes(payment.unitId)) return false;
      if (payment.tenantId) return false;
      if (payment.leaseId && tenantLeaseIds.includes(payment.leaseId)) return true;
      return false;
    }),
    expenses: snapshot.expenses.filter((expense) => propertyIds.includes(expense.propertyId)),
    maintenance: snapshot.maintenanceRequests.filter((item) => {
      if (!propertyIds.includes(item.propertyId)) return false;
      if (user.role !== "TENANT") return true;
      return item.unitId ? unitIds.includes(item.unitId) : true;
    }),
    inspections: snapshot.inspections.filter((inspection) => unitIds.includes(inspection.unitId)),
    assessments: snapshot.damageAssessments.filter((assessment) => {
      const inspection = snapshot.inspections.find((item) => item.id === assessment.inspectionId);
      return inspection ? unitIds.includes(inspection.unitId) : false;
    }),
    files: snapshot.uploadedFiles.filter((file) => {
      if (user.role === "TENANT" && file.visibility === "MANAGER_ONLY") return false;
      if (user.role === "TENANT" && file.kind === "LEASE_DOCUMENT" && !file.leaseId) {
        return tenantLeases.some((lease) => lease.documentPath === file.path);
      }
      if (file.leaseId && leaseIds.includes(file.leaseId)) {
        if (user.role !== "TENANT") return true;
        if (file.tenantId && tenantProfile && file.tenantId !== tenantProfile.id) return false;
        return file.visibility === "TENANT";
      }
      if (file.propertyId) return propertyIds.includes(file.propertyId);
      if (file.unitId) return unitIds.includes(file.unitId);
      if (file.inspectionId) {
        const inspection = snapshot.inspections.find((item) => item.id === file.inspectionId);
        return inspection ? unitIds.includes(inspection.unitId) : false;
      }
      if (file.assessmentId) {
        const assessment = snapshot.damageAssessments.find((item) => item.id === file.assessmentId);
        const inspection = snapshot.inspections.find((item) => item.id === assessment?.inspectionId);
        return inspection ? unitIds.includes(inspection.unitId) : false;
      }
      return false;
    })
  };

  const users =
    user.role === "ADMIN"
      ? effectiveUsers
      : user.role === "MANAGER"
        ? effectiveUsers.filter((candidate) => candidate.role === "MANAGER" || candidate.role === "TENANT")
        : effectiveUsers.filter((candidate) => candidate.id === user.id);

  const managers = effectiveUsers.filter((candidate) => candidate.role === "MANAGER");
  const notifications = snapshot.notifications.filter((notification) => !notification.userId || notification.userId === user.id);
  const currentLease =
    user.role === "TENANT"
      ? scoped.leases
          .filter((lease) => lease.tenantUserId === user.id || (tenantProfile ? lease.tenantIds.includes(tenantProfile.id) : false))
          .sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? ""))
          .find((lease) => leaseIsVisibleCurrent(lease.status)) ?? null
      : null;
  const currentUnit = currentLease ? scoped.units.find((unit) => unit.id === currentLease.unitId) ?? null : null;
  const currentProperty = currentLease
    ? scoped.properties.find((property) => property.id === (currentLease.propertyId ?? currentUnit?.propertyId)) ?? null
    : null;

  const collected = scoped.payments
    .filter((payment) => payment.paidDate && monthKeyFromValue(payment.paidDate) === currentMonthKey)
    .reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = scoped.payments
    .filter((payment) => payment.status !== "PAID")
    .reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const overduePayments = scoped.payments.filter(
    (payment) => payment.status === "LATE" || (payment.status !== "PAID" && appDateIsBefore(payment.dueDate, todayKey))
  );
  const overdue = overduePayments.reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const totalUnits = scoped.units.length;
  const occupiedUnits = scoped.units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
  const maintenanceOpen = scoped.maintenance.filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS");
  const expiringLeases = scoped.leases
    .filter((lease) => leaseIsActive(lease.status) && lease.endDate)
    .sort((a, b) => (a.endDate ?? "").localeCompare(b.endDate ?? ""))
    .map((lease) => ({
      ...lease,
      daysRemaining: differenceInAppCalendarDays(lease.endDate!, todayKey)
    }));
  const recurringRent = scoped.leases
    .filter((lease) => leaseIsVisibleCurrent(lease.status))
    .reduce((sum, lease) => sum + lease.monthlyRent, 0);
  const monthExpenses = scoped.expenses
    .filter((expense) => monthKeyFromValue(expense.incurredAt) === currentMonthKey)
    .reduce((sum, expense) => sum + expense.amount, 0);

  const delinquencyRate = scoped.payments.length ? overduePayments.length / scoped.payments.length : 0;
  const occupancyRate = totalUnits ? occupiedUnits / totalUnits : 0;

  const recentActivity = [
    ...scoped.payments.map((payment) => ({
      id: payment.id,
      title: payment.description,
      detail: `${payment.status} payment`,
      date: payment.paidDate ?? payment.dueDate,
      kind: "payment"
    })),
    ...scoped.maintenance.map((item) => ({
      id: item.id,
      title: item.title,
      detail: `${item.priority} priority ${item.status.toLowerCase()} request`,
      date: item.updatedAt,
      kind: "maintenance"
    })),
    ...notifications.map((notification) => ({
      id: notification.id,
      title: notification.title,
      detail: notification.body,
      date: notification.createdAt,
      kind: "notification"
    }))
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  const messageCenter = notifications.slice(0, 6);
  const documents =
    user.role === "TENANT"
      ? scoped.files.filter((file) => file.kind === "LEASE_DOCUMENT" || file.kind === "MOVE_IN_IMAGE").slice(0, 6)
      : scoped.files.filter((file) => file.kind === "LEASE_DOCUMENT" || file.kind === "PROPERTY_IMAGE" || file.kind === "MOVE_IN_IMAGE").slice(0, 8);

  const collectionsForecast = [
    { label: "Now", total: outstanding },
    { label: "7 days", total: Math.max(0, outstanding - overdue * 0.25) },
    { label: "30 days", total: Math.max(0, outstanding - overdue * 0.7) + recurringRent * 0.15 }
  ];

  return {
    user,
    organization: snapshot.organization,
    managers,
    users,
    notifications,
    currentTenant: tenantProfile,
    currentLease,
    currentUnit,
    currentProperty,
    managerAssignments,
    scope: scoped,
    metrics: {
      totalProperties: scoped.properties.length,
      totalUnits,
      occupiedUnits,
      occupancyRate,
      delinquencyRate,
      recurringRent,
      collected,
      outstanding,
      overdue,
      monthExpenses,
      maintenanceOpen: maintenanceOpen.length
    },
    expiringLeases,
    overduePayments,
    maintenanceOpen,
    recentActivity,
    messageCenter,
    documents,
    collectionsForecast,
    nextPayment:
      user.role === "TENANT"
        ? scoped.payments
            .filter((payment) => payment.status !== "PAID")
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
        : null,
    announcements:
      notifications.filter((notification) => !notification.userId || notification.userId === user.id).slice(0, 4),
    calendar: [
      ...expiringLeases.slice(0, 3).map((lease) => ({
        id: lease.id,
        label: "Lease expiry",
        date: lease.endDate,
        note: `Renewal decision due in ${Math.max(lease.daysRemaining, 0)} days`,
        kind: "lease" as const,
        status: undefined as string | undefined,
        amount: 0,
        paymentId: undefined as string | undefined
      })),
      ...maintenanceOpen.slice(0, 3).map((item) => ({
        id: item.id,
        label: "Work order",
        date: addDaysToDateKey(item.requestedAt, 2),
        note: item.title,
        kind: "maintenance" as const,
        status: undefined as string | undefined,
        amount: 0,
        paymentId: undefined as string | undefined
      })),
      ...scoped.payments
        .filter((p) => {
          const key = appDateIsBefore(p.dueDate, todayKey);
          // Include pending/late within last 30 days and all future ones
          if (p.status === "PAID") return false;
          if (key && differenceInAppCalendarDays(todayKey, p.dueDate) > 30) return false;
          return true;
        })
        .slice(0, 20)
        .map((p) => {
          const unit = scoped.units.find((u) => u.id === p.unitId);
          const property = scoped.properties.find((pr) => pr.id === unit?.propertyId);
          const tag = (p.categoryTag ?? "").toLowerCase();
          const kind = tag === "deposit" ? "deposit" : tag === "late fee" ? "late-fee" : "rent";
          const propertyLabel = property?.name ?? unit?.unitNumber ?? "Unit";
          const label =
            kind === "deposit"
              ? `${propertyLabel} Deposit`
              : kind === "late-fee"
                ? `${propertyLabel} Late Fee`
                : `${propertyLabel} Rent`;
          return {
            id: p.id,
            label,
            date: p.dueDate,
            note: `${p.status} — $${(p.balanceDue || p.amount).toFixed(2)}`,
            kind: kind as "rent" | "deposit" | "late-fee",
            status: p.status,
            amount: p.balanceDue || p.amount,
            paymentId: p.id
          };
        })
    ]
      .filter((e) => Boolean(e.date))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
  };
}

export function badgeToneFromPayment(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "PAID") return "success";
  if (status === "LATE") return "danger";
  if (status === "PARTIAL") return "warning";
  return "default";
}

export function badgeToneFromMaintenance(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "IN_PROGRESS") return "warning";
  return "default";
}

export function badgeToneFromPriority(priority: string): "default" | "success" | "warning" | "danger" {
  if (priority === "URGENT") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "success";
  return "default";
}

export function getNotificationLabel(item: Notification) {
  return item.userId ? "Direct" : "Announcement";
}
