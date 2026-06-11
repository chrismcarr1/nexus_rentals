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
  const unreadNotifications = portal.notifications
    .filter((notification) => !notification.isRead)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seenMessageThreads = new Set<string>();
  const notificationAlerts = unreadNotifications
    .filter((notification) => {
      if (!notification.href?.startsWith("/messages?conversation=")) return true;
      if (seenMessageThreads.has(notification.href)) return false;
      seenMessageThreads.add(notification.href);
      return true;
    })
    .map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      // Navigate straight to the thread; opening it marks the conversation read
      // via a same-origin POST (see MessageScrollArea) instead of a GET endpoint.
      href: notification.href,
      label: notification.href?.startsWith("/messages?conversation=") ? "Message" : "Alert",
      isUnread: true
    }));
  const messageAlerts = notificationAlerts.filter((alert) => alert.label === "Message");
  const otherNotificationAlerts = notificationAlerts.filter((alert) => alert.label !== "Message");
  const alerts = [...messageAlerts, ...otherNotificationAlerts, ...maintenanceAlerts].slice(0, 6);

  return (
    <AppShell
      // Pass only the fields AppShell renders. The full record contains
      // sensitive data (passwordHash, birthDate, legal metadata) that must
      // never be serialized into the client component payload.
      user={{
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: { name: user.organization.name }
      }}
      notifications={alerts}
      logoutAction={logoutAction}
    >
      {children}
    </AppShell>
  );
}
