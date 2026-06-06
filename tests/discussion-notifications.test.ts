import { describe, expect, it } from "vitest";

import { markConversationNotificationsRead } from "@/lib/discussion-notifications";
import type { Notification } from "@/lib/store";

const threadHref = "/messages?conversation=lease-1%3Atenant-1";

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: "note-1",
    organizationId: "org-1",
    userId: "manager-1",
    type: "SYSTEM",
    title: "New discussion message",
    body: "A tenant sent a message.",
    href: threadHref,
    isRead: false,
    createdAt: "2026-06-06T12:00:00.000Z",
    ...overrides
  };
}

describe("markConversationNotificationsRead", () => {
  it("marks every unread notification for the opened thread", () => {
    const result = markConversationNotificationsRead(
      [
        notification({ id: "note-1" }),
        notification({ id: "note-2", createdAt: "2026-06-06T12:01:00.000Z" })
      ],
      "manager-1",
      threadHref
    );

    expect(result.changed).toBe(true);
    expect(result.notifications.every((item) => item.isRead)).toBe(true);
  });

  it("leaves other users and conversations unread", () => {
    const otherThread = notification({ id: "note-2", href: "/messages?conversation=lease-2%3Atenant-2" });
    const otherUser = notification({ id: "note-3", userId: "manager-2" });
    const result = markConversationNotificationsRead(
      [notification({ id: "note-1" }), otherThread, otherUser],
      "manager-1",
      threadHref
    );

    expect(result.notifications[0].isRead).toBe(true);
    expect(result.notifications[1]).toEqual(otherThread);
    expect(result.notifications[2]).toEqual(otherUser);
  });
});
