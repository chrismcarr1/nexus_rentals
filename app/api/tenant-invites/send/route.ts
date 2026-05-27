import { headers } from "next/headers";
import { z } from "zod";

import { createTenantInvite, getLeaseProperty, getLeaseUnit } from "@/lib/lease-connections";
import { formatUnitAddress } from "@/lib/address";
import { getCurrentUser } from "@/lib/auth";
import { sendTenantInviteEmail } from "@/lib/email";
import { readStore, UserRole } from "@/lib/store";
import { formatDate } from "@/lib/utils";

const sendInviteSchema = z.object({
  leaseId: z.string().min(1)
});

async function getAppOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const headerOrigin = host ? `${proto}://${host}` : null;
  const configuredOrigin = process.env.APP_URL?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && configuredOrigin) return configuredOrigin;
  return headerOrigin ?? configuredOrigin ?? "http://localhost:3000";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in before sending tenant invites." }, { status: 401 });
  if (user.role !== UserRole.MANAGER) return Response.json({ error: "Only managers can send tenant invites." }, { status: 403 });

  const payload = await request.json().catch(() => null);
  const result = sendInviteSchema.safeParse(payload);

  if (!result.success) {
    return Response.json({ error: "Missing lease ID." }, { status: 400 });
  }

  try {
    const { rawToken, invite, lease } = await createTenantInvite(result.data.leaseId, user);
    const store = await readStore();
    const property = getLeaseProperty(store, lease);
    const unit = getLeaseUnit(store, lease);
    const propertyLabel = property
      ? [property.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : null, formatUnitAddress(property, unit)].filter(Boolean).join(", ")
      : "your lease";
    const origin = await getAppOrigin();
    const inviteUrl = `${origin}/invite/${encodeURIComponent(rawToken)}`;
    let emailSent = false;
    let emailError: string | undefined;

    if (process.env.RESEND_API_KEY && process.env.RESET_EMAIL_FROM) {
      try {
        const emailResult = await sendTenantInviteEmail({
          to: invite.tenantEmail,
          managerName: `${user.firstName} ${user.lastName}`.trim() || user.email,
          managerEmail: user.email,
          propertyLabel: propertyLabel || "your lease",
          inviteUrl,
          expiresAt: formatDate(invite.expiresAt)
        });

        emailSent = emailResult.sent;
        emailError = emailResult.error;
      } catch (error) {
        emailError = error instanceof Error ? error.message : "Tenant invite email failed.";
      }
    } else {
      emailError = "Tenant invite email is not configured.";
    }

    return Response.json({
      invite: {
        id: invite.id,
        leaseId: invite.leaseId,
        tenantEmail: invite.tenantEmail,
        status: invite.status,
        expiresAt: invite.expiresAt
      },
      inviteUrl,
      emailSent,
      emailError
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not send invite." }, { status: 400 });
  }
}
