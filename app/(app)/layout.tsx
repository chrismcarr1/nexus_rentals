import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 5
  });

  return (
    <AppShell
      user={user}
      notifications={notifications}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
