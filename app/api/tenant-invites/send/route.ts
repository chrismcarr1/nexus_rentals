import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { TenantInviteDeliveryError, sendLeaseTenantInvite } from "@/lib/tenant-invite-delivery";
import { UserRole } from "@/lib/store";

const sendInviteSchema = z.object({
  leaseId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Log in before sending tenant invites." }, { status: 401 });
    if (user.role !== UserRole.MANAGER) return Response.json({ error: "Only managers can send tenant invites." }, { status: 403 });

    const payload = await request.json().catch(() => null);
    const result = sendInviteSchema.safeParse(payload);

    if (!result.success) {
      return Response.json({ error: "Missing lease ID." }, { status: 400 });
    }

    const { invite, tenantEmail } = await sendLeaseTenantInvite(result.data.leaseId, user);

    return Response.json({
      invite: {
        id: invite.id,
        leaseId: invite.leaseId,
        tenantEmail: invite.tenantEmail,
        status: invite.status,
        expiresAt: invite.expiresAt
      },
      tenantEmail,
      emailSent: true
    });
  } catch (error) {
    console.error("[tenant-invites] Could not deliver tenant invite", error);
    const status = error instanceof TenantInviteDeliveryError ? 502 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Could not deliver the tenant invite." }, { status });
  }
}
