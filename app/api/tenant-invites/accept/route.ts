import { z } from "zod";

import { normalizeEmail } from "@/lib/admin";
import { ensureLeaseConnectionIntegrity, getInviteByRawToken, getInviteStatus, toSafeLeaseRow } from "@/lib/lease-connections";
import { getCurrentUser } from "@/lib/auth";
import { createId, nowIso, updateStore } from "@/lib/store";

const acceptInviteSchema = z.object({
  token: z.string().min(20)
});

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Log in or create an account before accepting this invite." }, { status: 401 });
  }

  if (user.role !== "TENANT") {
    return Response.json({ error: "Only tenant accounts can accept tenant invites." }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const result = acceptInviteSchema.safeParse(payload);
  if (!result.success) {
    return Response.json({ error: "Missing invite token." }, { status: 400 });
  }

  const { invite, lease } = await getInviteByRawToken(result.data.token);
  if (!invite || !lease) {
    return Response.json({ error: "Invite not found." }, { status: 404 });
  }

  const inviteStatus = getInviteStatus(invite);
  if (inviteStatus !== "pending") {
    return Response.json({ error: `Invite is ${inviteStatus}.` }, { status: 400 });
  }

  if (normalizeEmail(user.email) !== normalizeEmail(invite.tenantEmail)) {
    return Response.json({ error: `This invite is for ${invite.tenantEmail}. Sign in with that email to accept it.` }, { status: 403 });
  }

  try {
    await updateStore((store) => {
      const targetLease = store.leases.find((item) => item.id === invite.leaseId);
      if (!targetLease) throw new Error("Lease not found.");
      const property = targetLease.propertyId ? store.properties.find((item) => item.id === targetLease.propertyId) : null;
      const unit = targetLease.unitId ? store.units.find((item) => item.id === targetLease.unitId) : null;
      const unitProperty = unit ? store.properties.find((item) => item.id === unit.propertyId) : null;
      const organizationId = property?.organizationId ?? unitProperty?.organizationId ?? null;
      if (!organizationId) throw new Error("Property organization not found.");

      const now = nowIso();
      const existingTenant = store.tenants.find(
        (tenant) => tenant.organizationId === organizationId && tenant.email && normalizeEmail(tenant.email) === normalizeEmail(user.email)
      );
      const tenantId = existingTenant?.id ?? createId("tenant");
      const tenantIds = Array.from(new Set([...(targetLease.tenantIds ?? []), tenantId]));

      return {
        ...store,
        users: store.users.map((item) => (item.id === user.id ? { ...item, organizationId, role: "TENANT", updatedAt: now } : item)),
        tenants: existingTenant
          ? store.tenants.map((tenant) =>
              tenant.id === existingTenant.id
                ? { ...tenant, firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone, updatedAt: now }
                : tenant
            )
          : [
              ...store.tenants,
              {
                id: tenantId,
                organizationId,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                createdAt: now,
                updatedAt: now
              }
            ],
        leases: store.leases.map((item) =>
          item.id === targetLease.id
            ? {
                ...item,
                propertyId: item.propertyId ?? unit?.propertyId,
                managerUserId: item.managerUserId ?? property?.managerId ?? unitProperty?.managerId,
                tenantUserId: user.id,
                tenantEmail: normalizeEmail(user.email),
                tenantIds,
                status: "active",
                updatedAt: now
              }
            : item
        ),
        tenantInvites: store.tenantInvites.map((item) =>
          item.id === invite.id ? { ...item, status: "accepted", acceptedAt: now, updatedAt: now } : item
        )
      };
    });

    await ensureLeaseConnectionIntegrity();
    const { store, lease: acceptedLease } = await getInviteByRawToken(result.data.token);
    return Response.json({ lease: acceptedLease ? toSafeLeaseRow(store, acceptedLease) : null });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not accept invite." }, { status: 400 });
  }
}
