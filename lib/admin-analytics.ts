import "server-only";

import packageJson from "@/package.json";

import { getEffectiveUserRole, normalizeEmail } from "@/lib/admin";
import { formatAddress } from "@/lib/address";
import { appDateIsBefore, getAppDateKey } from "@/lib/app-time";
import { describeDatabaseTarget } from "@/lib/database";
import { getEmailDiagnostics } from "@/lib/email";
import { getAppUrlDiagnostics } from "@/lib/request-origin";
import { getRuntimeEnvironment, getStripeKeyMode } from "@/lib/stripe-env";
import { getStripeAccountId, getStripeConnectState } from "@/lib/stripe-connect";
import { readStore, type AppStore, type User } from "@/lib/store";

export const ADMIN_TIME_RANGES = ["today", "7d", "30d", "90d", "ytd", "all"] as const;
export type AdminTimeRange = (typeof ADMIN_TIME_RANGES)[number];

export type AdminIntegrityIssue = {
  id: string;
  severity: "critical" | "warning" | "info";
  entityType: string;
  entityId: string;
  title: string;
  detail: string;
  href?: string;
};

function asDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfRange(range: AdminTimeRange, now = new Date()) {
  if (range === "all") return null;
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000);
}

function isInRange(value: string | undefined | null, start: Date | null, now = new Date()) {
  const date = asDate(value);
  if (!date) return false;
  return date <= now && (!start || date >= start);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function percentage(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function rangeLabel(range: AdminTimeRange) {
  if (range === "today") return "Today";
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  if (range === "90d") return "Last 90 days";
  if (range === "ytd") return "Year to date";
  return "All time";
}

function getPropertyForUnit(store: AppStore, unitId?: string | null) {
  const unit = unitId ? store.units.find((item) => item.id === unitId) : null;
  return unit ? store.properties.find((item) => item.id === unit.propertyId) ?? null : null;
}

function getPropertyForLease(store: AppStore, lease: AppStore["leases"][number]) {
  return lease.propertyId
    ? store.properties.find((item) => item.id === lease.propertyId) ?? null
    : getPropertyForUnit(store, lease.unitId);
}

function monthKey(value?: string | null) {
  const date = asDate(value);
  return date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "";
}

function dayKey(value?: string | null) {
  const date = asDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function addDays(date: Date, amount: number) {
  return new Date(date.getTime() + amount * 86_400_000);
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function getGrowthBuckets(range: AdminTimeRange, store: AppStore, now = new Date()) {
  const start = startOfRange(range, now);
  const useMonths = range === "90d" || range === "ytd" || range === "all";
  const dates = [
    ...store.users.map((item) => item.createdAt),
    ...store.properties.map((item) => item.createdAt),
    ...store.units.map((item) => item.createdAt),
    ...store.leases.map((item) => item.createdAt),
    ...store.applicationSubmissions.map((item) => item.submittedAt),
    ...store.payments.map((item) => item.createdAt)
  ]
    .map(asDate)
    .filter((value): value is Date => Boolean(value));
  const earliest = dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? now;
  const bucketStart =
    range === "all"
      ? new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1))
      : start ?? now;

  if (useMonths) {
    const result: Array<{ key: string; label: string }> = [];
    let cursor = new Date(Date.UTC(bucketStart.getUTCFullYear(), bucketStart.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    while (cursor <= end && result.length < 36) {
      result.push({
        key: monthKey(cursor.toISOString()),
        label: new Intl.DateTimeFormat("en-US", { month: "short", year: range === "all" ? "2-digit" : undefined, timeZone: "UTC" }).format(cursor)
      });
      cursor = addMonths(cursor, 1);
    }
    return { buckets: result, keyFor: monthKey };
  }

  const result: Array<{ key: string; label: string }> = [];
  let cursor = new Date(bucketStart.getFullYear(), bucketStart.getMonth(), bucketStart.getDate());
  while (cursor <= now && result.length < 31) {
    result.push({
      key: dayKey(cursor.toISOString()),
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(cursor)
    });
    cursor = addDays(cursor, 1);
  }
  return { buckets: result, keyFor: dayKey };
}

function buildGrowthSeries(store: AppStore, range: AdminTimeRange) {
  type GrowthMetricKey =
    | "managers"
    | "tenants"
    | "properties"
    | "units"
    | "leases"
    | "applications"
    | "paymentRequests"
    | "completedPayments";
  const { buckets, keyFor } = getGrowthBuckets(range, store);
  const rows = new Map(
    buckets.map((bucket) => [
      bucket.key,
      {
        label: bucket.label,
        managers: 0,
        tenants: 0,
        properties: 0,
        units: 0,
        leases: 0,
        applications: 0,
        paymentRequests: 0,
        completedPayments: 0
      }
    ])
  );

  const increment = (date: string | undefined, key: GrowthMetricKey) => {
    const row = rows.get(keyFor(date));
    if (row) {
      row[key] += 1;
    }
  };

  for (const user of store.users) {
    const role = getEffectiveUserRole(user.role, user.email);
    if (role === "MANAGER") increment(user.createdAt, "managers");
    if (role === "TENANT") increment(user.createdAt, "tenants");
  }
  for (const item of store.properties) increment(item.createdAt, "properties");
  for (const item of store.units) increment(item.createdAt, "units");
  for (const item of store.leases) increment(item.createdAt, "leases");
  for (const item of store.applicationSubmissions) increment(item.submittedAt, "applications");
  for (const item of store.payments) {
    increment(item.createdAt, "paymentRequests");
    if (item.status === "PAID") increment(item.paidDate ?? item.updatedAt, "completedPayments");
  }

  return Array.from(rows.values());
}

function buildIntegrityIssues(store: AppStore): AdminIntegrityIssue[] {
  const issues: AdminIntegrityIssue[] = [];
  const today = getAppDateKey();
  const push = (issue: AdminIntegrityIssue) => issues.push(issue);

  for (const unit of store.units) {
    if (!store.properties.some((property) => property.id === unit.propertyId)) {
      push({
        id: `unit-property-${unit.id}`,
        severity: "critical",
        entityType: "Unit",
        entityId: unit.id,
        title: "Unit has no property",
        detail: `Unit ${unit.unitNumber} references missing property ${unit.propertyId}.`
      });
    }
  }

  for (const lease of store.leases) {
    if (!lease.tenantIds?.length && !lease.tenantUserId && !lease.tenantEmail) {
      push({
        id: `lease-tenant-${lease.id}`,
        severity: "critical",
        entityType: "Lease",
        entityId: lease.id,
        title: "Lease has no tenant",
        detail: `${lease.nexusLeaseId ?? lease.id} is not connected to a tenant.`,
        href: `/admin/managers/${lease.managerUserId ?? ""}`
      });
    }
    if (!lease.unitId || !store.units.some((unit) => unit.id === lease.unitId)) {
      push({
        id: `lease-unit-${lease.id}`,
        severity: "critical",
        entityType: "Lease",
        entityId: lease.id,
        title: "Lease has no valid unit",
        detail: `${lease.nexusLeaseId ?? lease.id} is missing a valid unit relationship.`
      });
    }
  }

  for (const payment of store.payments) {
    const unit = store.units.find((item) => item.id === payment.unitId);
    const property = unit ? store.properties.find((item) => item.id === unit.propertyId) : null;
    if (!payment.tenantId || !store.tenants.some((tenant) => tenant.id === payment.tenantId)) {
      push({
        id: `payment-tenant-${payment.id}`,
        severity: "warning",
        entityType: "Payment",
        entityId: payment.id,
        title: "Payment has no tenant",
        detail: `${payment.description} is not linked to a valid tenant.`,
        href: "/admin/payments"
      });
    }
    if (!payment.leaseId || !store.leases.some((lease) => lease.id === payment.leaseId)) {
      push({
        id: `payment-lease-${payment.id}`,
        severity: "warning",
        entityType: "Payment",
        entityId: payment.id,
        title: "Payment has no lease",
        detail: `${payment.description} is not linked to a valid lease.`,
        href: "/admin/payments"
      });
    }
    if (!unit || !property) {
      push({
        id: `payment-location-${payment.id}`,
        severity: "critical",
        entityType: "Payment",
        entityId: payment.id,
        title: "Payment location is broken",
        detail: `${payment.description} is missing a valid unit or property.`,
        href: "/admin/payments"
      });
    }
    if (payment.status === "PAID" && !payment.paidDate) {
      push({
        id: `payment-paid-date-${payment.id}`,
        severity: "warning",
        entityType: "Payment",
        entityId: payment.id,
        title: "Paid payment missing paid date",
        detail: `${payment.description} is marked paid without paidDate.`,
        href: "/admin/payments"
      });
    }
    if (payment.status === "PAID" && !payment.amountPaid) {
      push({
        id: `payment-paid-amount-${payment.id}`,
        severity: "warning",
        entityType: "Payment",
        entityId: payment.id,
        title: "Paid payment missing amount paid",
        detail: `${payment.description} is marked paid without amountPaid.`,
        href: "/admin/payments"
      });
    }
    if (!payment.dueDate && payment.status !== "PAID") {
      push({
        id: `payment-due-${payment.id}`,
        severity: "critical",
        entityType: "Payment",
        entityId: payment.id,
        title: "Open charge missing due date",
        detail: `${payment.description} cannot be aged correctly.`,
        href: "/admin/payments"
      });
    }
    if (!Number.isFinite(payment.amount) || payment.amount <= 0 || payment.balanceDue < 0) {
      push({
        id: `payment-amount-${payment.id}`,
        severity: "critical",
        entityType: "Payment",
        entityId: payment.id,
        title: "Invalid payment amount",
        detail: `${payment.description} has a negative, zero, or invalid amount.`,
        href: "/admin/payments"
      });
    }
    if (
      payment.stripeAmountPaidCents &&
      Math.abs(payment.stripeAmountPaidCents - Math.round((payment.amountPaid ?? payment.amount) * 100)) > 1
    ) {
      push({
        id: `payment-stripe-mismatch-${payment.id}`,
        severity: "critical",
        entityType: "Payment",
        entityId: payment.id,
        title: "Stripe amount mismatch",
        detail: `${payment.description} differs from the stored Stripe amount.`,
        href: "/admin/payments"
      });
    }
  }

  for (const tenant of store.tenants) {
    const portalUser = tenant.email
      ? store.users.some(
          (user) =>
            user.organizationId === tenant.organizationId &&
            getEffectiveUserRole(user.role, user.email) === "TENANT" &&
            normalizeEmail(user.email) === normalizeEmail(tenant.email!)
        )
      : false;
    const invite = tenant.email
      ? store.tenantInvites.some((item) => normalizeEmail(item.tenantEmail) === normalizeEmail(tenant.email!))
      : false;
    if (!portalUser && !invite) {
      push({
        id: `tenant-invite-${tenant.id}`,
        severity: "info",
        entityType: "Tenant",
        entityId: tenant.id,
        title: "Tenant has no portal invite",
        detail: `${tenant.firstName} ${tenant.lastName} has no matching portal account or invite.`,
        href: "/admin/tenants"
      });
    }
  }

  for (const manager of store.users.filter((user) => getEffectiveUserRole(user.role, user.email) === "MANAGER")) {
    if (!getStripeAccountId(manager)) {
      push({
        id: `manager-stripe-${manager.id}`,
        severity: "info",
        entityType: "Manager",
        entityId: manager.id,
        title: "Manager has not started Stripe setup",
        detail: `${manager.firstName} ${manager.lastName} has no connected account.`,
        href: `/admin/managers/${manager.id}`
      });
    }
  }

  for (const property of store.properties) {
    if (!store.units.some((unit) => unit.propertyId === property.id)) {
      push({
        id: `property-units-${property.id}`,
        severity: "warning",
        entityType: "Property",
        entityId: property.id,
        title: "Property has no units",
        detail: `${property.name} has no unit inventory.`,
        href: "/admin/properties"
      });
    }
  }

  const userEmails = new Map<string, string[]>();
  for (const user of store.users) {
    const key = normalizeEmail(user.email);
    userEmails.set(key, [...(userEmails.get(key) ?? []), user.id]);
  }
  for (const [email, ids] of userEmails) {
    if (ids.length > 1) {
      push({
        id: `duplicate-user-${email}`,
        severity: "critical",
        entityType: "User",
        entityId: ids.join(", "),
        title: "Duplicate user email",
        detail: `${email} belongs to ${ids.length} user records.`,
        href: "/admin/users"
      });
    }
  }

  const tenantEmails = new Map<string, string[]>();
  for (const tenant of store.tenants) {
    if (!tenant.email) continue;
    const key = `${tenant.organizationId}:${normalizeEmail(tenant.email)}`;
    tenantEmails.set(key, [...(tenantEmails.get(key) ?? []), tenant.id]);
  }
  for (const [key, ids] of tenantEmails) {
    if (ids.length > 1) {
      push({
        id: `duplicate-tenant-${key}`,
        severity: "warning",
        entityType: "Tenant",
        entityId: ids.join(", "),
        title: "Duplicate tenant email",
        detail: `${key.split(":").slice(1).join(":")} belongs to ${ids.length} tenant records.`,
        href: "/admin/tenants"
      });
    }
  }

  for (const submission of store.applicationSubmissions.filter((item) => item.status === "APPROVED")) {
    push({
      id: `application-conversion-${submission.id}`,
      severity: "info",
      entityType: "Application",
      entityId: submission.id,
      title: "Approved application not converted",
      detail: "The application is approved but has not been converted to a lease.",
      href: "/admin/applications"
    });
  }

  for (const payment of store.payments.filter(
    (item) => item.status !== "PAID" && item.dueDate && appDateIsBefore(item.dueDate, today)
  )) {
    if (payment.status !== "LATE") {
      push({
        id: `payment-aging-${payment.id}`,
        severity: "info",
        entityType: "Payment",
        entityId: payment.id,
        title: "Overdue payment not marked late",
        detail: `${payment.description} is past due but status is ${payment.status}.`,
        href: "/admin/payments"
      });
    }
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
}

function userDisplayName(user?: Pick<User, "firstName" | "lastName" | "email"> | null) {
  if (!user) return "Unassigned";
  return `${user.firstName} ${user.lastName}`.trim() || user.email;
}

export async function getAdminAnalytics(range: AdminTimeRange = "30d") {
  const store = await readStore();
  const now = new Date();
  const start = startOfRange(range, now);
  const effectiveUsers = store.users.map((user) => ({
    ...user,
    role: getEffectiveUserRole(user.role, user.email)
  }));
  const managers = effectiveUsers.filter((user) => user.role === "MANAGER");
  const tenantUsers = effectiveUsers.filter((user) => user.role === "TENANT");
  const admins = effectiveUsers.filter((user) => user.role === "ADMIN");
  const organizationById = new Map(store.organizations.map((item) => [item.id, item]));
  const managerById = new Map(managers.map((item) => [item.id, item]));
  const propertyById = new Map(store.properties.map((item) => [item.id, item]));
  const unitById = new Map(store.units.map((item) => [item.id, item]));
  const tenantById = new Map(store.tenants.map((item) => [item.id, item]));
  const leaseById = new Map(store.leases.map((item) => [item.id, item]));
  const periodPayments = store.payments.filter((item) => isInRange(item.createdAt, start, now));
  const paidPayments = store.payments.filter((item) => item.status === "PAID");
  const periodPaidPayments = paidPayments.filter((item) => isInRange(item.paidDate ?? item.updatedAt, start, now));
  const openPayments = store.payments.filter((item) => item.status !== "PAID");
  const overduePayments = openPayments.filter(
    (item) => item.status === "LATE" || (item.dueDate && appDateIsBefore(item.dueDate, getAppDateKey(now)))
  );
  const stripePayments = paidPayments.filter(
    (item) => item.stripeCheckoutSessionId || item.stripePaymentIntentId || item.stripeAmountPaidCents
  );
  const periodStripePayments = stripePayments.filter((item) => isInRange(item.stripePaidAt ?? item.paidDate, start, now));
  const platformEvents = [...(store.platformEvents ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const periodEvents = platformEvents.filter((item) => isInRange(item.createdAt, start, now));
  const sentInvites = store.tenantInvites.filter((item) => item.sentAt);
  const acceptedInvites = store.tenantInvites.filter((item) => item.status === "accepted");
  const integrityIssues = buildIntegrityIssues(store);

  const userRows = effectiveUsers
    .map((user) => {
      const properties = store.properties.filter((property) => property.managerId === user.id);
      const propertyIds = new Set(properties.map((property) => property.id));
      const units = store.units.filter((unit) => propertyIds.has(unit.propertyId));
      const unitIds = new Set(units.map((unit) => unit.id));
      const leases = store.leases.filter(
        (lease) => lease.managerUserId === user.id || (lease.unitId ? unitIds.has(lease.unitId) : false)
      );
      const payments = store.payments.filter((payment) => unitIds.has(payment.unitId));
      const invite = store.tenantInvites
        .filter((item) => normalizeEmail(item.tenantEmail) === normalizeEmail(user.email))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const stripeState = user.role === "MANAGER" ? getStripeConnectState(user) : null;
      return {
        id: user.id,
        name: userDisplayName(user),
        email: user.email,
        role: user.role,
        status: user.isActive === false ? "suspended" : "active",
        organization: organizationById.get(user.organizationId)?.name ?? "Unknown",
        organizationId: user.organizationId,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
        propertyCount: properties.length,
        unitCount: units.length,
        leaseCount: leases.length,
        paymentCount: payments.length,
        stripeStatus: stripeState?.label ?? "Not applicable",
        inviteStatus: invite?.status ?? (user.role === "TENANT" ? "account created" : "not applicable")
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const managerRows = managers
    .map((manager) => {
      const properties = store.properties.filter((item) => item.managerId === manager.id);
      const propertyIds = new Set(properties.map((item) => item.id));
      const units = store.units.filter((item) => propertyIds.has(item.propertyId));
      const unitIds = new Set(units.map((item) => item.id));
      const leases = store.leases.filter(
        (item) => item.managerUserId === manager.id || (item.unitId ? unitIds.has(item.unitId) : false)
      );
      const payments = store.payments.filter((item) => unitIds.has(item.unitId));
      const paid = payments.filter((item) => item.status === "PAID");
      const tenants = new Set(leases.flatMap((item) => item.tenantIds));
      const invites = store.tenantInvites.filter((item) => item.managerUserId === manager.id);
      const stripeState = getStripeConnectState(manager);
      const setupSteps = [
        true,
        properties.length > 0,
        units.length > 0,
        leases.length > 0,
        invites.some((item) => item.sentAt),
        payments.length > 0,
        stripeState.ready,
        paid.length > 0
      ];
      const activityCount =
        properties.filter((item) => isInRange(item.createdAt, start, now)).length +
        units.filter((item) => isInRange(item.createdAt, start, now)).length +
        leases.filter((item) => isInRange(item.createdAt, start, now)).length +
        payments.filter((item) => isInRange(item.createdAt, start, now)).length +
        store.applicationSubmissions.filter(
          (item) => item.managerUserId === manager.id && isInRange(item.submittedAt, start, now)
        ).length;
      return {
        id: manager.id,
        name: userDisplayName(manager),
        email: manager.email,
        organization: organizationById.get(manager.organizationId)?.name ?? "Unknown",
        isActive: manager.isActive !== false,
        createdAt: manager.createdAt,
        lastLoginAt: manager.lastLoginAt ?? null,
        propertyCount: properties.length,
        unitCount: units.length,
        tenantCount: tenants.size,
        leaseCount: leases.length,
        paymentCount: payments.length,
        rentVolume: sum(units.map((item) => item.monthlyRent)),
        paymentVolume: sum(paid.map((item) => item.amountPaid ?? item.amount)),
        openBalance: sum(payments.filter((item) => item.status !== "PAID").map((item) => item.balanceDue || item.amount)),
        activityCount,
        stripeStatus: stripeState.label,
        stripeKey: stripeState.key,
        setupProgress: percentage(setupSteps.filter(Boolean).length, setupSteps.length),
        setupComplete: setupSteps.every(Boolean)
      };
    })
    .sort((a, b) => b.paymentVolume - a.paymentVolume || b.rentVolume - a.rentVolume);

  const tenantRows = store.tenants
    .map((tenant) => {
      const leases = store.leases.filter((item) => item.tenantIds.includes(tenant.id));
      const payments = store.payments.filter((item) => item.tenantId === tenant.id);
      const portalUser = tenant.email
        ? tenantUsers.find(
            (user) =>
              user.organizationId === tenant.organizationId &&
              normalizeEmail(user.email) === normalizeEmail(tenant.email!)
          )
        : null;
      const latestInvite = tenant.email
        ? store.tenantInvites
            .filter((item) => normalizeEmail(item.tenantEmail) === normalizeEmail(tenant.email!))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        : null;
      return {
        id: tenant.id,
        name: `${tenant.firstName} ${tenant.lastName}`.trim(),
        email: tenant.email ?? "No email",
        organization: organizationById.get(tenant.organizationId)?.name ?? "Unknown",
        portalStatus: portalUser ? (portalUser.isActive === false ? "suspended" : "active") : "no account",
        inviteStatus: latestInvite?.status ?? "not invited",
        leaseCount: leases.length,
        paymentCount: payments.length,
        openBalance: sum(payments.filter((item) => item.status !== "PAID").map((item) => item.balanceDue || item.amount)),
        createdAt: tenant.createdAt,
        lastLoginAt: portalUser?.lastLoginAt ?? null
      };
    })
    .sort((a, b) => b.openBalance - a.openBalance || a.name.localeCompare(b.name));

  const propertyRows = store.properties
    .map((property) => {
      const units = store.units.filter((item) => item.propertyId === property.id);
      const unitIds = new Set(units.map((item) => item.id));
      const leases = store.leases.filter(
        (item) => item.propertyId === property.id || (item.unitId ? unitIds.has(item.unitId) : false)
      );
      const payments = store.payments.filter((item) => unitIds.has(item.unitId));
      const overdue = payments.filter(
        (item) => item.status !== "PAID" && (item.status === "LATE" || appDateIsBefore(item.dueDate, getAppDateKey(now)))
      );
      return {
        id: property.id,
        name: property.name,
        address: formatAddress(property),
        organization: organizationById.get(property.organizationId)?.name ?? "Unknown",
        managerId: property.managerId ?? null,
        manager: property.managerId ? userDisplayName(managerById.get(property.managerId)) : "Unassigned",
        status: property.status,
        units: units.length,
        occupiedUnits: units.filter((item) => item.occupancyStatus === "OCCUPIED").length,
        activeLeases: leases.filter((item) => ["ACTIVE", "active"].includes(item.status)).length,
        rentRoll: sum(units.map((item) => item.monthlyRent)),
        openBalance: sum(payments.filter((item) => item.status !== "PAID").map((item) => item.balanceDue || item.amount)),
        overdueBalance: sum(overdue.map((item) => item.balanceDue || item.amount)),
        createdAt: property.createdAt
      };
    })
    .sort((a, b) => b.overdueBalance - a.overdueBalance || b.rentRoll - a.rentRoll);

  const paymentRows = [...store.payments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((payment) => {
      const unit = unitById.get(payment.unitId);
      const property = unit ? propertyById.get(unit.propertyId) : null;
      const tenant = payment.tenantId ? tenantById.get(payment.tenantId) : null;
      const lease = payment.leaseId ? leaseById.get(payment.leaseId) : null;
      const stripe = Boolean(payment.stripeCheckoutSessionId || payment.stripePaymentIntentId || payment.stripeAmountPaidCents);
      const amountMismatch = Boolean(
        payment.stripeAmountPaidCents &&
          Math.abs(payment.stripeAmountPaidCents - Math.round((payment.amountPaid ?? payment.amount) * 100)) > 1
      );
      const warnings = [
        payment.status === "PAID" && !payment.paidDate ? "Missing paid date" : null,
        payment.status === "PAID" && !payment.amountPaid ? "Missing amount paid" : null,
        stripe && !payment.stripeCheckoutSessionId ? "Missing Stripe session" : null,
        amountMismatch ? "Amount mismatch" : null,
        !tenant ? "Missing tenant" : null,
        !lease ? "Missing lease" : null,
        !unit || !property ? "Broken location" : null
      ].filter(Boolean) as string[];
      return {
        id: payment.id,
        managerId: property?.managerId ?? null,
        description: payment.description,
        property: property?.name ?? "Missing property",
        unit: unit?.unitNumber ?? "Missing unit",
        tenant: tenant ? `${tenant.firstName} ${tenant.lastName}`.trim() : "Missing tenant",
        lease: lease?.nexusLeaseId ?? lease?.id ?? "Missing lease",
        status: payment.status,
        amount: payment.amount,
        amountPaid: payment.amountPaid ?? 0,
        balanceDue: payment.balanceDue,
        dueDate: payment.dueDate,
        paidDate: payment.paidDate ?? null,
        source: stripe ? "Stripe" : "Manual",
        stripeSessionId: payment.stripeCheckoutSessionId ?? null,
        stripePaymentIntentId: payment.stripePaymentIntentId ?? null,
        platformFee: (payment.stripeApplicationFeeAmountCents ?? 0) / 100,
        warnings
      };
    });

  const applicationRows = store.applicationSubmissions
    .map((submission) => {
      const application = store.rentalApplications.find((item) => item.id === submission.applicationId);
      const property = propertyById.get(submission.propertyId);
      const unit = submission.unitId ? unitById.get(submission.unitId) : null;
      const applicant = store.applicationApplicants.find(
        (item) => item.submissionId === submission.id && item.type === "PRIMARY"
      );
      return {
        id: submission.id,
        managerId: submission.managerUserId,
        applicant: applicant ? `${applicant.firstName} ${applicant.lastName}`.trim() : "Applicant unavailable",
        email: applicant?.email ?? "Not available",
        application: application?.title ?? "Missing application",
        property: property?.name ?? "Missing property",
        unit: unit?.unitNumber ?? "Any unit",
        manager: userDisplayName(managerById.get(submission.managerUserId)),
        status: submission.status,
        feeStatus: submission.feeStatus,
        submittedAt: submission.submittedAt
      };
    })
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const stripeRows = managers.map((manager) => {
    const state = getStripeConnectState(manager);
    return {
      id: manager.id,
      manager: userDisplayName(manager),
      email: manager.email,
      accountId: getStripeAccountId(manager) ?? null,
      state: state.key,
      status: state.label,
      chargesEnabled: Boolean(manager.stripeChargesEnabled),
      payoutsEnabled: Boolean(manager.stripePayoutsEnabled),
      detailsSubmitted: Boolean(manager.stripeDetailsSubmitted),
      disabledReason: manager.stripeDisabledReason ?? null,
      currentlyDue: manager.stripeCurrentlyDue ?? [],
      updatedAt: manager.stripeUpdatedAt ?? null,
      metadataUserId: manager.stripeMetadataUserId ?? null,
      metadataOrganizationId: manager.stripeMetadataOrganizationId ?? null,
      metadataMismatchReason: manager.stripeMetadataMismatchReason ?? null,
      metadataMismatch: Boolean(
        manager.stripeMetadataMismatchReason ||
          (manager.stripeMetadataUserId && manager.stripeMetadataUserId !== manager.id) ||
          (manager.stripeMetadataOrganizationId && manager.stripeMetadataOrganizationId !== manager.organizationId)
      )
    };
  });

  const recentActivity = [
    ...platformEvents.slice(0, 20).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.category.replaceAll("_", " "),
      detail: item.message ?? item.status,
      status: item.status,
      date: item.createdAt
    })),
    ...store.payments.slice(-10).map((item) => ({
      id: `payment-${item.id}`,
      type: "PAYMENT",
      title: item.description,
      detail: `${item.status} payment record`,
      status: item.status.toLowerCase(),
      date: item.updatedAt
    })),
    ...store.maintenanceRequests.slice(-10).map((item) => ({
      id: `maintenance-${item.id}`,
      type: "MAINTENANCE",
      title: item.title,
      detail: `${item.priority} priority ${item.status.toLowerCase()} request`,
      status: item.status.toLowerCase(),
      date: item.updatedAt
    }))
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  const emailEvents = platformEvents.filter((item) => item.type.startsWith("EMAIL_"));
  const stripeEvents = platformEvents.filter((item) => item.type.startsWith("STRIPE_"));
  const periodEmailEvents = periodEvents.filter((item) => item.type.startsWith("EMAIL_"));
  const periodStripeEvents = periodEvents.filter((item) => item.type.startsWith("STRIPE_"));
  const latestEmailFailure = emailEvents.find((item) => item.type === "EMAIL_FAILED");
  const latestWebhook = stripeEvents.find((item) => item.type === "STRIPE_WEBHOOK_RECEIVED");
  const emailDiagnostics = getEmailDiagnostics();
  const appUrlDiagnostics = getAppUrlDiagnostics();
  const managersWithProperty = new Set(store.properties.map((item) => item.managerId).filter(Boolean));
  const managersWithLease = new Set(store.leases.map((item) => item.managerUserId).filter(Boolean));
  const managerIdsWithPayment = new Set(
    store.payments
      .map((payment) => {
        const property = getPropertyForUnit(store, payment.unitId);
        return property?.managerId;
      })
      .filter(Boolean)
  );
  const tenantsWithPortal = new Set(
    store.tenants
      .filter((tenant) =>
        tenant.email
          ? tenantUsers.some(
              (user) =>
                user.organizationId === tenant.organizationId &&
                normalizeEmail(user.email) === normalizeEmail(tenant.email!)
            )
          : false
      )
      .map((item) => item.id)
  );
  const tenantUsersWithLease = new Set(store.leases.map((item) => item.tenantUserId).filter(Boolean));
  const activeLeases = store.leases.filter((item) => ["ACTIVE", "active"].includes(item.status));
  const currentPeriodUsers = effectiveUsers.filter((item) => isInRange(item.createdAt, start, now));
  const currentPeriodProperties = store.properties.filter((item) => isInRange(item.createdAt, start, now));
  const currentPeriodSubmissions = store.applicationSubmissions.filter((item) => isInRange(item.submittedAt, start, now));
  const currentPeriodMoveIns = store.leases.filter((item) => item.moveInDate && isInRange(item.createdAt, start, now));
  const paidVolume = sum(periodPaidPayments.map((item) => item.amountPaid ?? item.amount));
  const stripeVolume = sum(
    periodStripePayments.map((item) => (item.stripeAmountPaidCents ? item.stripeAmountPaidCents / 100 : item.amountPaid ?? item.amount))
  );
  const platformRevenue = sum(periodStripePayments.map((item) => (item.stripeApplicationFeeAmountCents ?? 0) / 100));

  return {
    generatedAt: now.toISOString(),
    range,
    rangeLabel: rangeLabel(range),
    overview: {
      managers: managers.length,
      tenants: tenantUsers.length,
      admins: admins.length,
      properties: store.properties.length,
      units: store.units.length,
      leases: store.leases.length,
      activeLeases: activeLeases.length,
      applications: store.rentalApplications.length,
      applicationSubmissions: store.applicationSubmissions.length,
      paymentsCreated: store.payments.length,
      paymentsCollected: paidPayments.length,
      rentVolumeTracked: sum(store.payments.map((item) => item.amount)),
      paymentVolume: paidVolume,
      stripePaymentVolume: stripeVolume,
      platformRevenue,
      activeManagers: managers.filter((item) => item.isActive !== false).length,
      activeTenants: tenantUsers.filter((item) => item.isActive !== false).length,
      newUsers: currentPeriodUsers.length,
      newUsersThisWeek: effectiveUsers.filter((item) => isInRange(item.createdAt, startOfRange("7d", now), now)).length,
      newUsersThisMonth: effectiveUsers.filter(
        (item) => isInRange(item.createdAt, new Date(now.getFullYear(), now.getMonth(), 1), now)
      ).length,
      newProperties: currentPeriodProperties.length,
      openBalance: sum(openPayments.map((item) => item.balanceDue || item.amount)),
      overdueBalance: sum(overduePayments.map((item) => item.balanceDue || item.amount)),
      failedEmails: periodEmailEvents.filter((item) => item.type === "EMAIL_FAILED").length,
      failedPayments: null as number | null,
      stripeNeedsOnboarding: stripeRows.filter((item) => item.state !== "ready").length,
      moveInsCreated: currentPeriodMoveIns.length,
      applicationsSubmitted: currentPeriodSubmissions.length
    },
    growth: {
      series: buildGrowthSeries(store, range),
      inviteAcceptanceRate: percentage(acceptedInvites.length, sentInvites.length),
      passwordResetRequests: store.passwordResetTokens.filter((item) => isInRange(item.createdAt, start, now)).length,
      tenantActivationRate: percentage(tenantUsersWithLease.size, tenantUsers.length),
      managerActivationRate: percentage(managersWithProperty.size, managers.length),
      managersWithLeaseRate: percentage(managersWithLease.size, managers.length),
      managersWithPaymentRate: percentage(managerIdsWithPayment.size, managers.length)
    },
    users: userRows,
    managers: managerRows,
    tenants: tenantRows,
    properties: propertyRows,
    payments: {
      rows: paymentRows,
      metrics: {
        requests: periodPayments.length,
        paid: periodPaidPayments.length,
        unpaid: openPayments.length,
        overdueBalance: sum(overduePayments.map((item) => item.balanceDue || item.amount)),
        collectedVolume: paidVolume,
        manualPayments: periodPaidPayments.filter(
          (item) => !item.stripeCheckoutSessionId && !item.stripePaymentIntentId && !item.stripeAmountPaidCents
        ).length,
        stripePayments: periodStripePayments.length,
        failedPayments: null as number | null,
        refundedPayments: null as number | null,
        missingStripeSession: paymentRows.filter(
          (item) => item.source === "Stripe" && !item.stripeSessionId
        ).length,
        paidMissingDate: paymentRows.filter((item) => item.status === "PAID" && !item.paidDate).length,
        amountMismatches: paymentRows.filter((item) => item.warnings.includes("Amount mismatch")).length
      }
    },
    applications: {
      rows: applicationRows,
      links: store.rentalApplications.length,
      submitted: store.applicationSubmissions.filter((item) => isInRange(item.submittedAt, start, now)).length,
      approved: store.applicationSubmissions.filter((item) => item.status === "APPROVED").length,
      converted: store.applicationSubmissions.filter((item) => item.status === "CONVERTED_TO_LEASE").length
    },
    leases: store.leases
      .map((lease) => {
        const property = getPropertyForLease(store, lease);
        const unit = lease.unitId ? unitById.get(lease.unitId) : null;
        const tenants = lease.tenantIds.map((id) => tenantById.get(id)).filter(Boolean);
        return {
          id: lease.id,
          nexusLeaseId: lease.nexusLeaseId ?? lease.id,
          managerId: lease.managerUserId ?? property?.managerId ?? null,
          property: property?.name ?? "Missing property",
          unit: unit?.unitNumber ?? "Missing unit",
          tenants: tenants.map((tenant) => `${tenant!.firstName} ${tenant!.lastName}`.trim()).join(", ") || lease.tenantEmail || "Missing tenant",
          status: lease.status,
          monthlyRent: lease.monthlyRent,
          startDate: lease.startDate ?? null,
          endDate: lease.endDate ?? null,
          moveInDate: lease.moveInDate ?? null,
          createdAt: lease.createdAt
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    stripe: {
      rows: stripeRows,
      connected: stripeRows.filter((item) => item.accountId).length,
      fullyOnboarded: stripeRows.filter((item) => item.state === "ready").length,
      pendingReview: stripeRows.filter((item) => item.state === "pending_review").length,
      missingPayouts: stripeRows.filter((item) => item.accountId && !item.payoutsEnabled).length,
      disabled: stripeRows.filter((item) => item.disabledReason).length,
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      apiConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      lastWebhookAt: latestWebhook?.createdAt ?? null,
      unmatchedEvents: periodStripeEvents.filter(
        (item) => item.type === "STRIPE_WEBHOOK_RECEIVED" && item.status === "ignored"
      ).length,
      failedWebhookEvents: periodStripeEvents.filter((item) => item.type === "STRIPE_WEBHOOK_FAILED").length,
      recentEvents: stripeEvents.slice(0, 25)
    },
    email: {
      diagnostics: emailDiagnostics,
      events: emailEvents.slice(0, 25),
      totalSent: periodEmailEvents.filter((item) => item.type === "EMAIL_SENT").length,
      passwordResetEmails: periodEmailEvents.filter(
        (item) => item.type === "EMAIL_SENT" && item.category === "password_reset"
      ).length,
      tenantInviteEmails: periodEmailEvents.filter(
        (item) => item.type === "EMAIL_SENT" && item.category === "tenant_invite"
      ).length,
      moveInInviteEmails: periodEmailEvents.filter(
        (item) => item.type === "EMAIL_SENT" && item.category === "move_in_invite"
      ).length,
      failed: periodEmailEvents.filter((item) => item.type === "EMAIL_FAILED").length,
      blocked: periodEmailEvents.filter((item) => item.type === "EMAIL_BLOCKED").length,
      lastError: latestEmailFailure?.message ?? null,
      inviteDelivered: sentInvites.filter((item) => isInRange(item.sentAt, start, now)).length,
      inviteFailed: periodEmailEvents.filter(
        (item) => item.type === "EMAIL_FAILED" && ["tenant_invite", "move_in_invite"].includes(item.category)
      ).length,
      passwordResetRequests: store.passwordResetTokens.filter((item) => isInRange(item.createdAt, start, now)).length
    },
    operations: {
      issues: integrityIssues,
      critical: integrityIssues.filter((item) => item.severity === "critical").length,
      warnings: integrityIssues.filter((item) => item.severity === "warning").length,
      info: integrityIssues.filter((item) => item.severity === "info").length
    },
    product: {
      features: [
        { key: "properties", label: "Properties created", count: store.properties.length },
        { key: "units", label: "Units created", count: store.units.length },
        { key: "leases", label: "Leases created", count: store.leases.length },
        { key: "applicationLinks", label: "Applications created", count: store.rentalApplications.length },
        { key: "applications", label: "Applications submitted", count: store.applicationSubmissions.length },
        { key: "moveIns", label: "Move-ins completed", count: store.leases.filter((item) => item.moveInDate).length },
        { key: "payments", label: "Payments requested", count: store.payments.length },
        { key: "paid", label: "Payments paid", count: paidPayments.length },
        { key: "invites", label: "Tenants invited", count: sentInvites.length },
        { key: "resets", label: "Password resets requested", count: store.passwordResetTokens.length },
        { key: "stripeStarted", label: "Stripe setup started", count: platformEvents.filter((item) => item.type === "STRIPE_SETUP_STARTED").length },
        { key: "stripeCompleted", label: "Stripe setup completed", count: stripeRows.filter((item) => item.state === "ready").length },
        { key: "documents", label: "Documents uploaded", count: store.uploadedFiles.length },
        { key: "maintenance", label: "Maintenance requests", count: store.maintenanceRequests.length }
      ].sort((a, b) => b.count - a.count),
      managerFunnel: [
        { label: "Manager accounts", count: managers.length },
        { label: "Added property", count: managersWithProperty.size },
        { label: "Created lease", count: managersWithLease.size },
        { label: "Sent payment request", count: managerIdsWithPayment.size },
        { label: "Connected Stripe", count: stripeRows.filter((item) => item.state === "ready").length }
      ],
      tenantFunnel: [
        { label: "Tenant records", count: store.tenants.length },
        { label: "Portal account", count: tenantsWithPortal.size },
        { label: "Accepted invite", count: acceptedInvites.length },
        { label: "Active lease", count: activeLeases.filter((item) => item.tenantIds.length).length },
        { label: "Paid at least once", count: new Set(paidPayments.map((item) => item.tenantId).filter(Boolean)).size }
      ]
    },
    recentActivity,
    system: {
      environment: process.env.NODE_ENV ?? "development",
      // Derived facts only — key mode from the prefix and the database
      // hostname. Secret values are never included in this snapshot.
      runtimeEnvironment: getRuntimeEnvironment(),
      stripeMode: getStripeKeyMode(),
      databaseTarget: describeDatabaseTarget().label,
      version: packageJson.version,
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      authSecretConfigured: Boolean(process.env.AUTH_SECRET),
      stripeApiConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      blobConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      appUrl: appUrlDiagnostics,
      emailConfigured: emailDiagnostics.configured,
      databaseConnected: true,
      lastDataUpdate:
        [
          ...store.users.map((item) => item.updatedAt),
          ...store.properties.map((item) => item.updatedAt),
          ...store.payments.map((item) => item.updatedAt),
          ...platformEvents.map((item) => item.createdAt)
        ].sort((a, b) => b.localeCompare(a))[0] ?? null
    }
  };
}

export type AdminAnalytics = Awaited<ReturnType<typeof getAdminAnalytics>>;

export function parseAdminTimeRange(value?: string | null): AdminTimeRange {
  return ADMIN_TIME_RANGES.includes(value as AdminTimeRange) ? (value as AdminTimeRange) : "30d";
}
