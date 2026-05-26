import { z } from "zod";

import { userOwnsLease } from "@/lib/lease-connections";
import { getCurrentUser } from "@/lib/auth";
import { nowIso, updateStore, UserRole } from "@/lib/store";

const revokeInviteSchema = z.object({
  leaseId: z.string().min(1)
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Log in before revoking tenant invites." }, { status: 401 });
  if (user.role !== UserRole.MANAGER) return Response.json({ error: "Only managers can revoke tenant invites." }, { status: 403 });

  const payload = await request.json().catch(() => null);
  const result = revokeInviteSchema.safeParse(payload);

  if (!result.success) {
    return Response.json({ error: "Missing lease ID." }, { status: 400 });
  }

  try {
    await updateStore((store) => {
      const lease = store.leases.find((item) => item.id === result.data.leaseId);
      if (!lease || !userOwnsLease(store, user, lease)) throw new Error("Lease not found.");
      const now = nowIso();

      return {
        ...store,
        tenantInvites: store.tenantInvites.map((invite) =>
          invite.leaseId === lease.id && invite.status === "pending" ? { ...invite, status: "revoked", updatedAt: now } : invite
        ),
        leases: store.leases.map((item) => (item.id === lease.id && item.status === "invited" ? { ...item, status: "draft", updatedAt: now } : item))
      };
    });

    return Response.json({ message: "Invite revoked." });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not revoke invite." }, { status: 400 });
  }
}
