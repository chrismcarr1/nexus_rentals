import "server-only";

import { addDays, differenceInCalendarDays, endOfMonth, isAfter, isBefore, startOfMonth } from "date-fns";
import { cache } from "react";

import { getOrganizationSnapshot, type Notification, type UserRole } from "@/lib/store";

type AppUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  organizationId: string;
};

export const getPortalContext = cache(async (user: AppUser) => {
  const snapshot = await getOrganizationSnapshot(user.organizationId);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const managerAssignments = new Map(snapshot.properties.map((property) => [property.id, property.managerId ?? null]));
  const tenantProfile =
    user.role === "TENANT"
      ? snapshot.tenants.find((tenant) => tenant.email?.toLowerCase() === user.email.toLowerCase()) ?? null
      : null;

  const tenantLeaseIds =
    tenantProfile
      ? snapshot.leases.filter((lease) => lease.tenantIds.includes(tenantProfile.id)).map((lease) => lease.id)
      : [];
  const tenantUnitIds = snapshot.leases.filter((lease) => tenantLeaseIds.includes(lease.id)).map((lease) => lease.unitId);

  const propertyIds =
    user.role === "ADMIN"
      ? snapshot.properties.map((property) => property.id)
      : user.role === "MANAGER"
        ? snapshot.properties.filter((property) => property.managerId === user.id).map((property) => property.id)
        : Array.from(new Set(snapshot.units.filter((unit) => tenantUnitIds.includes(unit.id)).map((unit) => unit.propertyId)));

  const unitIds = snapshot.units.filter((unit) => propertyIds.includes(unit.propertyId)).map((unit) => unit.id);
  const leaseIds =
    user.role === "TENANT"
      ? tenantLeaseIds
      : snapshot.leases.filter((lease) => unitIds.includes(lease.unitId)).map((lease) => lease.id);
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
    payments: snapshot.payments.filter((payment) => unitIds.includes(payment.unitId)),
    expenses: snapshot.expenses.filter((expense) => propertyIds.includes(expense.propertyId)),
    maintenance: snapshot.maintenanceRequests.filter((item) => propertyIds.includes(item.propertyId)),
    inspections: snapshot.inspections.filter((inspection) => unitIds.includes(inspection.unitId)),
    assessments: snapshot.damageAssessments.filter((assessment) => {
      const inspection = snapshot.inspections.find((item) => item.id === assessment.inspectionId);
      return inspection ? unitIds.includes(inspection.unitId) : false;
    }),
    files: snapshot.uploadedFiles.filter((file) => {
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
      ? snapshot.users
      : user.role === "MANAGER"
        ? snapshot.users.filter((candidate) => candidate.role === "MANAGER" || candidate.role === "TENANT")
        : snapshot.users.filter((candidate) => candidate.id === user.id);

  const managers = snapshot.users.filter((candidate) => candidate.role === "MANAGER");
  const notifications = snapshot.notifications.filter((notification) => !notification.userId || notification.userId === user.id);
  const currentLease =
    tenantProfile
      ? scoped.leases
          .filter((lease) => lease.tenantIds.includes(tenantProfile.id))
          .sort((a, b) => a.endDate.localeCompare(b.endDate))
          .find((lease) => lease.status === "ACTIVE" || lease.status === "UPCOMING") ?? null
      : null;
  const currentUnit = currentLease ? scoped.units.find((unit) => unit.id === currentLease.unitId) ?? null : null;
  const currentProperty = currentUnit ? scoped.properties.find((property) => property.id === currentUnit.propertyId) ?? null : null;

  const collected = scoped.payments
    .filter((payment) => payment.paidDate && isAfter(new Date(payment.paidDate), monthStart) && isBefore(new Date(payment.paidDate), monthEnd))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = scoped.payments
    .filter((payment) => payment.status !== "PAID")
    .reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const overduePayments = scoped.payments.filter(
    (payment) => payment.status === "LATE" || (payment.status !== "PAID" && isBefore(new Date(payment.dueDate), now))
  );
  const overdue = overduePayments.reduce((sum, payment) => sum + (payment.balanceDue || payment.amount), 0);
  const totalUnits = scoped.units.length;
  const occupiedUnits = scoped.units.filter((unit) => unit.occupancyStatus === "OCCUPIED").length;
  const maintenanceOpen = scoped.maintenance.filter((item) => item.status === "OPEN" || item.status === "IN_PROGRESS");
  const expiringLeases = scoped.leases
    .filter((lease) => lease.status === "ACTIVE")
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((lease) => ({
      ...lease,
      daysRemaining: differenceInCalendarDays(new Date(lease.endDate), now)
    }));
  const recurringRent = scoped.leases
    .filter((lease) => lease.status === "ACTIVE" || lease.status === "UPCOMING")
    .reduce((sum, lease) => sum + lease.monthlyRent, 0);
  const monthExpenses = scoped.expenses
    .filter((expense) => isAfter(new Date(expense.incurredAt), monthStart) && isBefore(new Date(expense.incurredAt), monthEnd))
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
        note: `Renewal decision due in ${Math.max(lease.daysRemaining, 0)} days`
      })),
      ...maintenanceOpen.slice(0, 3).map((item) => ({
        id: item.id,
        label: "Work order",
        date: addDays(new Date(item.requestedAt), 2).toISOString(),
        note: item.title
      }))
    ].sort((a, b) => a.date.localeCompare(b.date))
  };
});

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
