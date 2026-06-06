import type { Notification } from "@/lib/store";

export function markConversationNotificationsRead(
  notifications: Notification[],
  userId: string,
  href: string
) {
  let changed = false;
  const next = notifications.map((notification) => {
    if (notification.userId !== userId || notification.href !== href || notification.isRead) return notification;
    changed = true;
    return { ...notification, isRead: true };
  });

  return { notifications: next, changed };
}
