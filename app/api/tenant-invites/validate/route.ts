import { getInviteByRawToken, getInviteStatus, toSafeLeaseRow } from "@/lib/lease-connections";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return Response.json({ error: "Missing invite token." }, { status: 400 });
  }

  const { store, invite, lease } = await getInviteByRawToken(token);
  if (!invite || !lease) {
    return Response.json({ error: "Invite not found." }, { status: 404 });
  }

  const inviteStatus = getInviteStatus(invite);
  if (inviteStatus !== "pending") {
    return Response.json({ error: `Invite is ${inviteStatus}.`, status: inviteStatus }, { status: 400 });
  }

  return Response.json({
    invite: {
      id: invite.id,
      tenantEmail: invite.tenantEmail,
      status: inviteStatus,
      expiresAt: invite.expiresAt,
      lease: toSafeLeaseRow(store, lease)
    }
  });
}
