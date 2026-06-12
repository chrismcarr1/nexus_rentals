import "server-only";

import { normalizeEmail } from "@/lib/admin";
import {
  appDateIsAfter,
  appDateIsBefore,
  appDateKeyFromValue,
  appTimeHasReached,
  dateOnlyToUtcNoonIso,
  differenceInAppCalendarDays,
  getAppDateKey,
  getAppDateTimeParts,
  monthKeyFromValue,
  normalizeRentDueTime
} from "@/lib/app-time";
import { getLeaseBilling } from "@/lib/payment-charge";
import { createId, nowIso, updateStore, type AppStore, type Lease, type Payment } from "@/lib/store";

export type LateFeePolicy = {
  feeType: "fixed" | "percent";
  amount: number;
  graceDays: number;
};

export function parseLateFeePolicy(policy: string | undefined | null): LateFeePolicy | null {
  if (!policy) return null;
  try {
    const parsed = JSON.parse(policy);
    if (!parsed || typeof parsed !== "object") return null;
    const feeType = parsed.feeType === "percent" ? "percent" : "fixed";
    const amount = Number(parsed.amount);
    const graceDays = Number(parsed.graceDays ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { feeType, amount, graceDays: Math.max(0, Math.round(graceDays)) };
  } catch {
    return null;
  }
}

export function formatLateFeePolicy(policy: LateFeePolicy | null): string {
  if (!policy) return "";
  return JSON.stringify(policy);
}

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

export async function ensureInitialLeaseCharges(organizationId?: string) {
  await updateStore((store) => {
    let changed = false;
    const payments = [...store.payments];
    const now = nowIso();

    for (const lease of store.leases) {
      if (!leaseCanGeneratePayments(lease.status)) continue;

      const property = getLeaseProperty(store, lease);
      const unit = getLeaseUnit(store, lease);
      if (!property || !unit) continue;
      if (organizationId && property.organizationId !== organizationId) continue;

      const tenantId = lease.tenantIds?.[0];

      if (lease.securityDeposit && lease.securityDeposit > 0) {
        const hasDeposit = payments.some(
          (p) =>
            p.leaseId === lease.id &&
            (p.categoryTag?.toLowerCase() === "deposit" || /deposit/i.test(p.description))
        );

        if (!hasDeposit) {
          const depositDueDate = lease.startDate
            ? dateOnlyToUtcNoonIso(appDateKeyFromValue(lease.startDate))
            : now;
          payments.push({
            id: createId("payment"),
            unitId: unit.id,
            leaseId: lease.id,
            tenantId,
            description: "Security deposit",
            amount: lease.securityDeposit,
            dueDate: depositDueDate,
            status: "PENDING",
            lateFeeAmount: 0,
            balanceDue: lease.securityDeposit,
            categoryTag: "Deposit",
            createdAt: now,
            updatedAt: now
          });
          changed = true;
        }
      }
    }

    return changed ? { ...store, payments } : store;
  });
}

export async function applyLeaseLateFees(organizationId?: string) {
  await updateStore((store) => {
    const todayKey = getAppDateKey();
    let changed = false;
    const payments = [...store.payments];
    const now = nowIso();

    for (const lease of store.leases) {
      if (!leaseCanGeneratePayments(lease.status)) continue;

      const policy = parseLateFeePolicy(lease.lateFeePolicy);
      if (!policy) continue;

      const property = getLeaseProperty(store, lease);
      const unit = getLeaseUnit(store, lease);
      if (!property || !unit) continue;
      if (organizationId && property.organizationId !== organizationId) continue;

      const leaseRentPayments = payments.filter(
        (p) => p.leaseId === lease.id && p.categoryTag === "Rent" && p.status !== "PAID"
      );

      for (const rentPayment of leaseRentPayments) {
        const dueDateKey = appDateKeyFromValue(rentPayment.dueDate);
        if (!dueDateKey) continue;
        const daysLate = differenceInAppCalendarDays(todayKey, dueDateKey);
        if (daysLate <= policy.graceDays) continue;

        const monthKey = rentPayment.generatedRentMonth || monthKeyFromValue(rentPayment.dueDate);
        const hasLateFee = payments.some(
          (p) =>
            p.leaseId === lease.id &&
            p.categoryTag === "Late Fee" &&
            (p.generatedRentMonth === monthKey ||
              (monthKeyFromValue(p.dueDate) === monthKey && /late fee/i.test(p.description)))
        );
        if (hasLateFee) continue;

        const lateFeeAmount =
          policy.feeType === "percent"
            ? Math.round(((rentPayment.amount * policy.amount) / 100) * 100) / 100
            : policy.amount;

        payments.push({
          id: createId("payment"),
          unitId: rentPayment.unitId,
          leaseId: lease.id,
          tenantId: rentPayment.tenantId,
          description: `Late fee — ${rentPayment.description}`,
          amount: lateFeeAmount,
          dueDate: rentPayment.dueDate,
          status: "PENDING",
          lateFeeAmount: 0,
          balanceDue: lateFeeAmount,
          categoryTag: "Late Fee",
          generatedRentMonth: monthKey,
          createdAt: now,
          updatedAt: now
        });

        const idx = payments.findIndex((p) => p.id === rentPayment.id);
        if (idx >= 0 && payments[idx].lateFeeAmount !== lateFeeAmount) {
          payments[idx] = { ...payments[idx], lateFeeAmount, updatedAt: now };
        }

        changed = true;
      }
    }

    return changed ? { ...store, payments } : store;
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
      // Charge the tenant-facing rent (base rent minus $1 when the manager
      // absorbs the payment charge); the base rent is preserved on the row.
      const billing = getLeaseBilling(lease);
      const payment: Payment = {
        id: createId("payment"),
        unitId: unit.id,
        leaseId: lease.id,
        tenantId,
        description,
        amount: billing.tenantFacingRent,
        dueDate: dateOnlyToUtcNoonIso(dueDateKey),
        status: "PENDING",
        lateFeeAmount: 0,
        balanceDue: billing.tenantFacingRent,
        baseRentAmount: billing.baseMonthlyRent,
        tenantFacingRentCents: billing.tenantFacingRentCents,
        managerAbsorbedPaymentChargeCents: billing.managerAbsorbedPaymentChargeCents,
        paymentChargeResponsibility: billing.paymentChargeResponsibility,
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
          body: `${description} for $${billing.tenantFacingRent.toFixed(2)} is ready to pay online.`,
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

  await ensureInitialLeaseCharges(organizationId);
  await applyLeaseLateFees(organizationId);
}
