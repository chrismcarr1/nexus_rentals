import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/lib/actions";
import { requireUser } from "@/lib/auth";
import { getPortalContext } from "@/services/portal";

const maintenancePriorityRank: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3
};

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const portal = await getPortalContext(user);
  const maintenanceAlerts =
    user.role === "TENANT"
      ? []
      : [...portal.maintenanceOpen]
          .sort((a, b) => {
            const priority = (maintenancePriorityRank[a.priority] ?? 99) - (maintenancePriorityRank[b.priority] ?? 99);
            if (priority !== 0) return priority;
            return b.requestedAt.localeCompare(a.requestedAt);
          })
          .map((request) => {
            const property = portal.scope.properties.find((item) => item.id === request.propertyId);
            const unit = request.unitId ? portal.scope.units.find((item) => item.id === request.unitId) : null;
            const location = [property?.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : null].filter(Boolean).join(" - ");

            return {
              id: `maintenance-${request.id}`,
              title: request.title,
              body: location ? `${location}: ${request.status.toLowerCase()} ${request.priority.toLowerCase()} request.` : `${request.status.toLowerCase()} ${request.priority.toLowerCase()} request.`,
              href: "/maintenance",
              label: "Work order"
            };
          });
  const notificationAlerts = portal.notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    label: "Alert"
  }));
  const alerts = [...maintenanceAlerts, ...notificationAlerts].slice(0, 6);

  return (
    <AppShell
      user={user}
      notifications={alerts}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
