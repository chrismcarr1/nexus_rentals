import "server-only";

import { normalizeEmail } from "@/lib/admin";
import {
  appDateIsAfter,
  appDateIsBefore,
  appTimeHasReached,
  dateOnlyToUtcNoonIso,
  getAppDateTimeParts,
  monthKeyFromValue,
  normalizeRentDueTime
} from "@/lib/app-time";
import { createId, nowIso, updateStore, type AppStore, type Lease, type Payment } from "@/lib/store";

function leaseCanGeneratePayments(status: string) {
  return status === "ACTIVE" || status === "UPCOMING" || status === "active" || status === "invited";
}

function getLeaseUnit(store: AppStore, lease: Lease) {
  return lease.unitId ? store.units.find((unit) => unit.id === lease.unitId) ?? null : null;
}

function getLeaseProperty(store: AppStore, lease: Lease) {
  if (lease.propertyId) return store.properties.find((property) => property.id === lease.propertyId) ?? null;
  const unit = getLeaseUnit(store, lease);
  return unit ? store.properties.find((property) => property.id === unit.propertyId) ?? null : null;
}

function getLeaseTenantUser(store: AppStore, lease: Lease) {
  if (lease.tenantUserId) return store.users.find((user) => user.id === lease.tenantUserId) ?? null;
  const tenant = lease.tenantIds?.[0] ? store.tenants.find((item) => item.id === lease.tenantIds[0]) ?? null : null;
  const tenantEmail = normalizeEmail(lease.tenantEmail ?? tenant?.email ?? "");
  if (!tenantEmail) return null;
  return store.users.find((user) => user.role === "TENANT" && normalizeEmail(user.email) === tenantEmail) ?? null;
}

function hasRentChargeForMonth(payments: Payment[], lease: Lease, monthKey: string) {
  return payments.some((payment) => {
    if (payment.leaseId !== lease.id) return false;
    if (payment.generatedRentMonth === monthKey) return true;
    if ((payment.categoryTag ?? "").toLowerCase() !== "rent") return false;
    return monthKeyFromValue(payment.dueDate) === monthKey && /rent/i.test(payment.description);
  });
}

export async function ensureScheduledLeasePayments(organizationId?: string) {
  await updateStore((store) => {
    const appNow = getAppDateTimeParts();
    const todayKey = appNow.dateKey;
    const monthKey = appNow.monthKey;
    const now = nowIso();
    let changed = false;
    const payments = [...store.payments];
    const notifications = [...store.notifications];

    const leases = store.leases.map((lease) => {
      const property = getLeaseProperty(store, lease);
      const unit = getLeaseUnit(store, lease);
      const dueDay = Math.min(Math.max(lease.dueDay ?? 1, 1), 28);
      const dueDateKey = `${monthKey}-${String(dueDay).padStart(2, "0")}`;
      const rentDueTime = normalizeRentDueTime(lease.rentDueTime);

      if (organizationId && property?.organizationId !== organizationId) return lease;
      if (!property || !unit || !leaseCanGeneratePayments(lease.status)) return lease;
      if (!lease.monthlyRent || lease.monthlyRent <= 0) return lease;
      if (todayKey < dueDateKey) return lease;
      if (todayKey === dueDateKey && !appTimeHasReached(rentDueTime, appNow)) return lease;
      if (lease.startDate && appDateIsBefore(dueDateKey, lease.startDate)) return lease;
      if (lease.endDate && appDateIsAfter(dueDateKey, lease.endDate)) return lease;
      if (lease.lastRentChargeMonth === monthKey || hasRentChargeForMonth(payments, lease, monthKey)) return lease;

      const tenantId = lease.tenantIds?.[0];
      const tenant = tenantId ? store.tenants.find((item) => item.id === tenantId) ?? null : null;
      const tenantUser = getLeaseTenantUser(store, lease);
      const description = `Monthly rent ${monthKey}`;
      const payment: Payment = {
        id: createId("payment"),
        unitId: unit.id,
        leaseId: lease.id,
        tenantId,
        description,
        amount: lease.monthlyRent,
        dueDate: dateOnlyToUtcNoonIso(dueDateKey),
        status: "PENDING",
        lateFeeAmount: 0,
        balanceDue: lease.monthlyRent,
        categoryTag: "Rent",
        generatedRentMonth: monthKey,
        createdAt: now,
        updatedAt: now
      };

      payments.push(payment);
      changed = true;

      if (tenantUser) {
        notifications.push({
          id: createId("note"),
          organizationId: property.organizationId,
          userId: tenantUser.id,
          type: "RENT_DUE",
          title: "Rent payment requested",
          body: `${description} for $${lease.monthlyRent.toFixed(2)} is ready to pay online.`,
          href: "/transactions",
          isRead: false,
          createdAt: now
        });
      }

      console.log("[lease-payments] Scheduled monthly rent request", {
        leaseId: lease.id,
        tenantId: tenant?.id,
        unitId: unit.id,
        monthKey,
        dueDate: dueDateKey,
        rentDueTime
      });

      return { ...lease, rentDueTime, lastRentChargeMonth: monthKey, updatedAt: now };
    });

    return changed ? { ...store, leases, payments, notifications } : store;
  });
}
