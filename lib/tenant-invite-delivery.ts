import "server-only";

import { formatUnitAddress } from "./address";
import { sendTenantInviteEmail } from "./email";
import {
  createTenantInviteDraft,
  getLeaseProperty,
  getLeaseUnit,
  saveSentTenantInvite
} from "./lease-connections";
import { buildAppUrl } from "./request-origin";
import { readStore, type User } from "./store";
import { formatDate } from "./utils";

export class TenantInviteDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantInviteDeliveryError";
  }
}

export async function sendLeaseTenantInvite(
  leaseId: string,
  manager: User,
  category: "tenant_invite" | "move_in_invite" = "tenant_invite"
) {
  const { rawToken, invite, lease } = await createTenantInviteDraft(leaseId, manager);
  const store = await readStore();
  const property = getLeaseProperty(store, lease);
  const unit = getLeaseUnit(store, lease);
  const propertyLabel = property
    ? [property.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : null, formatUnitAddress(property, unit)].filter(Boolean).join(", ")
    : "your lease";
  const inviteUrl = buildAppUrl(`/invite/${encodeURIComponent(rawToken)}`);

  try {
    const emailResult = await sendTenantInviteEmail({
      to: invite.tenantEmail,
      managerName: `${manager.firstName} ${manager.lastName}`.trim() || manager.email,
      managerEmail: manager.email,
      propertyLabel: propertyLabel || "your lease",
      inviteUrl,
      expiresAt: formatDate(invite.expiresAt),
      category,
      organizationId: manager.organizationId,
      userId: manager.id
    });

    if (!emailResult.sent) {
      throw new TenantInviteDeliveryError(emailResult.error || "Cloudflare did not accept the tenant invite email.");
    }
  } catch (error) {
    if (error instanceof TenantInviteDeliveryError) throw error;
    throw new TenantInviteDeliveryError(error instanceof Error ? error.message : "Could not deliver the tenant invite email.");
  }

  const deliveredInvite = await saveSentTenantInvite(invite, manager);

  return {
    invite: deliveredInvite,
    tenantEmail: deliveredInvite.tenantEmail
  };
}
