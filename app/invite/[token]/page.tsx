import Link from "next/link";

import { InviteAcceptance } from "@/components/invite-acceptance";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getInviteByRawToken, getInviteStatus, toSafeLeaseRow } from "@/lib/lease-connections";

function InviteError({ title, message }: { title: string; message: string }) {
  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <Card className="mx-auto max-w-xl p-6 lg:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">Tenant invite</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
        <Link href="/login" className="mt-6 inline-block">
          <Button>Go to login</Button>
        </Link>
      </Card>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ store, invite, lease }, user] = await Promise.all([getInviteByRawToken(token), getCurrentUser()]);

  if (!invite || !lease) {
    return <InviteError title="Invite not found" message="This tenant invite link is invalid or has already been replaced." />;
  }

  const inviteStatus = getInviteStatus(invite);
  if (inviteStatus !== "pending") {
    return <InviteError title={`Invite is ${inviteStatus}`} message="Ask your property manager to send a new invite if you still need access." />;
  }

  return (
    <main className="grid-bg flex min-h-screen items-center justify-center p-6">
      <InviteAcceptance
        token={token}
        userEmail={user?.email ?? null}
        invite={{
          tenantEmail: invite.tenantEmail,
          expiresAt: invite.expiresAt,
          lease: toSafeLeaseRow(store, lease)
        }}
      />
    </main>
  );
}
