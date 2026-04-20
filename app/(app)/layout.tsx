import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getPortalContext } from "@/services/portal";

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const portal = await getPortalContext(user);

  return (
    <AppShell
      user={user}
      notifications={portal.notifications.slice(0, 5)}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
