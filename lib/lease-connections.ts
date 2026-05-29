import "server-only";

import { createHash, randomBytes } from "crypto";

import { normalizeEmail } from "@/lib/admin";
import { formatAddress, formatUnitAddress } from "@/lib/address";
import { createId, nowIso, readStore, updateStore, type AppStore, type Lease, type TenantInvite, type User } from "@/lib/store";

export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function generateInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isActiveLeaseStatus(status?: string) {
  return status === "ACTIVE" || status === "UPCOMING" || status === "active" || status === "invited";
}

export function publicLeaseStatus(status: string) {
  if (status === "ACTIVE" || status === "UPCOMING") return "active";
  if (status === "EXPIRED" || status === "TERMINATED") return "ended";
  return status;
}

export function getInviteStatus(invite?: TenantInvite | null) {
  if (!invite) return "not sent";
  if (invite.status === "pending" && new Date(invite.expiresAt).getTime() <= Date.now()) return "expired";
  return invite.status;
}

export function userOwnsLease(store: AppStore, user: User, lease: Lease) {
  const property = getLeaseProperty(store, lease);
  return Boolean(property && property.managerId === user.id);
}

export function getLeaseProperty(store: AppStore, lease: Lease) {
  if (lease.propertyId) return store.properties.find((property) => property.id === lease.propertyId) ?? null;
  if (!lease.unitId) return null;
  const unit = store.units.find((item) => item.id === lease.unitId);
  return unit ? store.properties.find((property) => property.id === unit.propertyId) ?? null : null;
}

export function getLeaseUnit(store: AppStore, lease: Lease) {
  return lease.unitId ? store.units.find((unit) => unit.id === lease.unitId) ?? null : null;
}

function getLeaseOrganizationId(store: AppStore, lease: Lease) {
  const property = getLeaseProperty(store, lease);
  return property?.organizationId ?? null;
}

function findTenantByEmail(store: AppStore, organizationId: string | null, email?: string | null) {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized || !organizationId) return null;
  return store.tenants.find((tenant) => tenant.organizationId === organizationId && normalizeEmail(tenant.email ?? "") === normalized) ?? null;
}

function findTenantUserByEmail(store: AppStore, organizationId: string | null, email?: string | null) {
  const normalized = normalizeEmail(email ?? "");
  if (!normalized || !organizationId) return null;
  return store.users.find((user) => user.organizationId === organizationId && normalizeEmail(user.email) === normalized) ?? null;
}

function getCanonicalLeaseForUnit(store: AppStore, unitId?: string) {
  if (!unitId) return null;
  const candidates = store.leases
    .filter((lease) => lease.unitId === unitId && isActiveLeaseStatus(lease.status))
    .sort((a, b) => {
      const aConnected = a.tenantUserId || a.tenantIds?.length ? 1 : 0;
      const bConnected = b.tenantUserId || b.tenantIds?.length ? 1 : 0;
      if (aConnected !== bConnected) return bConnected - aConnected;
      return (b.startDate ?? b.createdAt ?? "").localeCompare(a.startDate ?? a.createdAt ?? "");
    });
  return candidates[0] ?? null;
}

export async function ensureLeaseConnectionIntegrity(organizationId?: string) {
  await updateStore((store) => {
    const now = nowIso();
    let changed = false;
    const seenLeaseIds = new Set<string>();
    const seenNexusIds = new Set<string>();
    const leaseIdMap = new Map<string, string>();

    const leases = store.leases.map((lease, index) => {
      const originalId = lease.id;
      let id = lease.id;
      if (!id || seenLeaseIds.has(id)) {
        id = createId("lease");
        changed = true;
      }
      seenLeaseIds.add(id);
      if (originalId && originalId !== id && !leaseIdMap.has(originalId)) {
        leaseIdMap.set(originalId, id);
      }

      const unit = lease.unitId ? store.units.find((item) => item.id === lease.unitId) ?? null : null;
      const property =
        lease.propertyId
          ? store.properties.find((item) => item.id === lease.propertyId) ?? null
          : unit
            ? store.properties.find((item) => item.id === unit.propertyId) ?? null
            : null;

      if (organizationId && property?.organizationId !== organizationId) {
        return lease;
      }

      const tenantFromIds = (lease.tenantIds ?? [])
        .map((tenantId) => store.tenants.find((tenant) => tenant.id === tenantId))
        .find(Boolean) ?? null;
      const tenantUser = lease.tenantUserId ? store.users.find((user) => user.id === lease.tenantUserId) ?? null : null;
      const tenantEmail = normalizeEmail(lease.tenantEmail ?? tenantUser?.email ?? tenantFromIds?.email ?? "");
      const organization = property?.organizationId ?? tenantFromIds?.organizationId ?? tenantUser?.organizationId ?? null;
      const matchedTenant = findTenantByEmail(store, organization, tenantEmail);
      const matchedTenantUser = findTenantUserByEmail(store, organization, tenantEmail);
      const tenantIds = Array.from(new Set([...(lease.tenantIds ?? []), matchedTenant?.id].filter(Boolean) as string[]));

      let nexusLeaseId = lease.nexusLeaseId;
      if (!nexusLeaseId || seenNexusIds.has(nexusLeaseId)) {
        nexusLeaseId = `NXR-${String(index + 1).padStart(5, "0")}`;
        while (seenNexusIds.has(nexusLeaseId)) {
          nexusLeaseId = `NXR-${String(seenNexusIds.size + 1).padStart(5, "0")}`;
        }
        changed = true;
      }
      seenNexusIds.add(nexusLeaseId);

      const resolvedPropertyId = lease.propertyId ?? unit?.propertyId;
      const resolvedManagerUserId = lease.managerUserId ?? property?.managerId;
      const resolvedTenantUserId = lease.tenantUserId ?? matchedTenantUser?.id;
      const resolvedTenantEmail = lease.tenantEmail ?? (tenantEmail || undefined);
      const leaseChanged =
        id !== lease.id ||
        nexusLeaseId !== lease.nexusLeaseId ||
        (lease.propertyId ?? undefined) !== resolvedPropertyId ||
        (lease.managerUserId ?? undefined) !== resolvedManagerUserId ||
        (lease.tenantUserId ?? undefined) !== resolvedTenantUserId ||
        (lease.tenantEmail ?? undefined) !== resolvedTenantEmail ||
        tenantIds.length !== (lease.tenantIds ?? []).length;

      const next = {
        ...lease,
        id,
        nexusLeaseId,
        propertyId: resolvedPropertyId,
        managerUserId: resolvedManagerUserId,
        tenantUserId: resolvedTenantUserId,
        tenantEmail: resolvedTenantEmail,
        tenantIds,
        updatedAt: leaseChanged ? now : lease.updatedAt
      };

      if (leaseChanged) changed = true;
      return next;
    });

    const normalizedStore = { ...store, leases };

    const properties = store.properties.map((property) => {
      if (property.managerId) return property;
      const lease = leases.find((item) => item.propertyId === property.id && item.managerUserId);
      if (!lease?.managerUserId) return property;
      changed = true;
      return { ...property, managerId: lease.managerUserId, updatedAt: now };
    });

    const payments = store.payments.map((payment) => {
      const mappedLeaseId = payment.leaseId ? leaseIdMap.get(payment.leaseId) ?? payment.leaseId : undefined;
      const lease = mappedLeaseId ? leases.find((item) => item.id === mappedLeaseId) ?? null : getCanonicalLeaseForUnit(normalizedStore, payment.unitId);
      if (!lease) return payment;
      if (payment.leaseId === lease.id) return payment;
      changed = true;
      return { ...payment, leaseId: lease.id, updatedAt: now };
    });

    const inspections = store.inspections.map((inspection) => {
      const mappedLeaseId = inspection.leaseId ? leaseIdMap.get(inspection.leaseId) ?? inspection.leaseId : undefined;
      const lease = mappedLeaseId ? leases.find((item) => item.id === mappedLeaseId) ?? null : getCanonicalLeaseForUnit(normalizedStore, inspection.unitId);
      if (!lease) return inspection;
      if (inspection.leaseId === lease.id) return inspection;
      changed = true;
      return { ...inspection, leaseId: lease.id, updatedAt: now };
    });

    const tenantInvites = store.tenantInvites.map((invite) => {
      const leaseId = leaseIdMap.get(invite.leaseId) ?? invite.leaseId;
      const lease = leases.find((item) => item.id === leaseId);
      const managerUserId = invite.managerUserId ?? lease?.managerUserId;
      if (leaseId === invite.leaseId && managerUserId === invite.managerUserId) return invite;
      changed = true;
      return { ...invite, leaseId, managerUserId: managerUserId ?? invite.managerUserId, updatedAt: now };
    });

    const discussionThreads = store.discussionThreads.map((thread) => {
      const leaseId = leaseIdMap.get(thread.leaseId) ?? thread.leaseId;
      const lease = leases.find((item) => item.id === leaseId);
      if (!lease) return thread;
      const next = {
        ...thread,
        leaseId,
        managerUserId: thread.managerUserId ?? lease.managerUserId,
        tenantUserId: thread.tenantUserId ?? lease.tenantUserId,
        propertyId: thread.propertyId ?? lease.propertyId,
        unitId: thread.unitId ?? lease.unitId
      };
      if (
        next.leaseId === thread.leaseId &&
        next.managerUserId === thread.managerUserId &&
        next.tenantUserId === thread.tenantUserId &&
        next.propertyId === thread.propertyId &&
        next.unitId === thread.unitId
      ) {
        return thread;
      }
      changed = true;
      return { ...next, updatedAt: now };
    });

    return changed ? { ...store, properties, leases, payments, inspections, tenantInvites, discussionThreads } : store;
  });
}

export function getLatestInviteForLease(store: AppStore, leaseId: string) {
  return [...store.tenantInvites]
    .filter((invite) => invite.leaseId === leaseId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function toSafeLeaseRow(store: AppStore, lease: Lease) {
  const property = getLeaseProperty(store, lease);
  const unit = getLeaseUnit(store, lease);
  const invite = getLatestInviteForLease(store, lease.id);
  const manager = lease.managerUserId ? store.users.find((user) => user.id === lease.managerUserId) ?? null : null;

  return {
    id: lease.id,
    nexusLeaseId: lease.nexusLeaseId ?? lease.id,
    tenantEmail: lease.tenantEmail ?? "",
    tenantConnected: Boolean(lease.tenantUserId),
    property: property
      ? {
          id: property.id,
          name: property.name,
          addressLine1: property.addressLine1,
          addressLine2: property.addressLine2,
          city: property.city,
          state: property.state,
          postalCode: property.postalCode,
          country: property.country,
          formattedAddress: formatAddress(property)
        }
      : null,
    unit: unit ? { id: unit.id, unitNumber: unit.unitNumber } : null,
    formattedAddress: property ? formatUnitAddress(property, unit) : "Address unavailable",
    manager: manager
      ? {
          id: manager.id,
          name: `${manager.firstName} ${manager.lastName}`.trim(),
          email: manager.email,
          phone: manager.phone ?? null
        }
      : null,
    status: publicLeaseStatus(lease.status),
    inviteStatus: getInviteStatus(invite),
    startDate: lease.startDate ?? null,
    endDate: lease.endDate ?? null,
    monthlyRent: lease.monthlyRent ?? null,
    securityDeposit: lease.securityDeposit ?? null,
    createdAt: lease.createdAt,
    updatedAt: lease.updatedAt
  };
}

export async function getManagerLeaseRows(user: User) {
  await ensureLeaseConnectionIntegrity(user.organizationId);
  const store = await readStore();
  const leases = store.leases.filter((lease) => userOwnsLease(store, user, lease));
  return leases.map((lease) => toSafeLeaseRow(store, lease)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTenantLeaseRows(user: User) {
  await ensureLeaseConnectionIntegrity(user.organizationId);
  const store = await readStore();
  const leases = store.leases.filter((lease) => lease.tenantUserId === user.id);
  return leases.map((lease) => toSafeLeaseRow(store, lease)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createConnectedLease({
  manager,
  propertyId,
  unitId,
  tenantEmail,
  startDate,
  endDate,
  monthlyRent,
  securityDeposit
}: {
  manager: User;
  propertyId: string;
  unitId?: string;
  tenantEmail: string;
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  securityDeposit?: number;
}) {
  let lease: Lease | null = null;
  await updateStore((store) => {
    const property = store.properties.find((item) => item.id === propertyId && item.managerId === manager.id);
    if (!property) throw new Error("Property not found.");
    if (unitId && !store.units.some((unit) => unit.id === unitId && unit.propertyId === propertyId)) {
      throw new Error("Unit not found for this property.");
    }

    const now = nowIso();
    lease = {
      id: createId("lease"),
      nexusLeaseId: `NXR-${String(store.leases.length + 1).padStart(5, "0")}`,
      managerUserId: manager.id,
      tenantEmail: normalizeEmail(tenantEmail),
      propertyId,
      unitId,
      tenantIds: [],
      startDate,
      endDate,
      monthlyRent: monthlyRent ?? 0,
      dueDay: 1,
      securityDeposit: securityDeposit ?? 0,
      recurringCharges: "",
      status: "draft",
      createdAt: now,
      updatedAt: now
    };

    return {
      ...store,
      leases: [...store.leases, lease]
    };
  });

  return lease!;
}

export async function createTenantInvite(leaseId: string, manager: User) {
  const rawToken = generateInviteToken();
  const tokenHash = hashInviteToken(rawToken);
  let invite: TenantInvite | null = null;
  let lease: Lease | null = null;

  await updateStore((store) => {
    const targetLease = store.leases.find((item) => item.id === leaseId);
    if (!targetLease) throw new Error("Lease not found.");
    if (!userOwnsLease(store, manager, targetLease)) throw new Error("Lease not found.");
    if (!targetLease.tenantEmail) throw new Error("Lease is missing a tenant email.");

    const now = nowIso();
    invite = {
      id: createId("invite"),
      leaseId,
      managerUserId: manager.id,
      tenantEmail: normalizeEmail(targetLease.tenantEmail),
      tokenHash,
      status: "pending",
      expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
      createdAt: now,
      updatedAt: now
    };

    lease = { ...targetLease, status: "invited", updatedAt: now };

    return {
      ...store,
      leases: store.leases.map((item) => (item.id === leaseId ? lease! : item)),
      tenantInvites: [
        ...store.tenantInvites.map((item) =>
          item.leaseId === leaseId && item.status === "pending" ? { ...item, status: "revoked" as const, updatedAt: now } : item
        ),
        invite
      ]
    };
  });

  return { rawToken, invite: invite!, lease: lease! };
}

export async function getInviteByRawToken(rawToken: string) {
  const tokenHash = hashInviteToken(rawToken);
  const store = await readStore();
  const invite = store.tenantInvites.find((item) => item.tokenHash === tokenHash) ?? null;
  if (!invite) return { store, invite: null, lease: null };
  const lease = store.leases.find((item) => item.id === invite.leaseId) ?? null;
  return { store, invite, lease };
}
