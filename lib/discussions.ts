import "server-only";

import { markConversationNotificationsRead } from "@/lib/discussion-notifications";
import { createId, nowIso, readStore, updateStore, UserRole, type AppStore, type DiscussionMessage, type DiscussionThread, type Lease, type Tenant, type User } from "@/lib/store";

export type DiscussionConversation = {
  key: string;
  leaseId: string;
  tenantId: string;
  threadId?: string;
  subject: string;
  description: string;
  propertyName: string;
  unitNumber?: string;
  managerName: string;
  tenantName: string;
  tenantEmail?: string;
  lastMessageAt?: string;
  lastMessageBody?: string;
  messageCount: number;
  hasUnread: boolean;
};

export type DiscussionMessageView = DiscussionMessage & {
  senderName: string;
  senderRole: UserRole;
  isCurrentUser: boolean;
};

export type DiscussionPageData = {
  conversations: DiscussionConversation[];
  selectedConversation: DiscussionConversation | null;
  messages: DiscussionMessageView[];
};

function normalizeEmail(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

function fullName(user?: Pick<User, "firstName" | "lastName" | "email"> | null) {
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();
  return name || user?.email || "Unknown user";
}

function tenantName(tenant?: Tenant | null) {
  const name = `${tenant?.firstName ?? ""} ${tenant?.lastName ?? ""}`.trim();
  return name || tenant?.email || "Resident";
}

function getLeaseProperty(store: AppStore, lease: Lease) {
  if (lease.propertyId) return store.properties.find((property) => property.id === lease.propertyId) ?? null;
  const unit = lease.unitId ? store.units.find((item) => item.id === lease.unitId) : null;
  return unit ? store.properties.find((property) => property.id === unit.propertyId) ?? null : null;
}

function getLeaseUnit(store: AppStore, lease: Lease) {
  return lease.unitId ? store.units.find((unit) => unit.id === lease.unitId) ?? null : null;
}

function getLeaseManager(store: AppStore, lease: Lease) {
  const property = getLeaseProperty(store, lease);
  const managerId = lease.managerUserId ?? property?.managerId;
  return managerId ? store.users.find((user) => user.id === managerId) ?? null : null;
}

function getTenantUser(store: AppStore, lease: Lease, tenant: Tenant) {
  if (lease.tenantUserId) {
    const connectedUser = store.users.find((user) => user.id === lease.tenantUserId);
    if (connectedUser) return connectedUser;
  }

  const tenantEmail = normalizeEmail(tenant.email ?? lease.tenantEmail);
  return tenantEmail ? store.users.find((user) => normalizeEmail(user.email) === tenantEmail) ?? null : null;
}

function getLeaseTenants(store: AppStore, lease: Lease) {
  const tenants = lease.tenantIds
    .map((tenantId) => store.tenants.find((tenant) => tenant.id === tenantId) ?? null)
    .filter((tenant): tenant is Tenant => Boolean(tenant));

  if (!tenants.length && lease.tenantEmail) {
    const matched = store.tenants.find((tenant) => normalizeEmail(tenant.email) === normalizeEmail(lease.tenantEmail));
    if (matched) tenants.push(matched);
  }

  return tenants;
}

function getConversationKey(leaseId: string, tenantId: string) {
  return `${leaseId}:${tenantId}`;
}

function getThreadForCandidate(store: AppStore, leaseId: string, tenantId: string, managerUserId: string) {
  return (
    store.discussionThreads.find(
      (thread) => thread.leaseId === leaseId && thread.tenantId === tenantId && thread.managerUserId === managerUserId
    ) ?? null
  );
}

function isTenantParticipant(store: AppStore, user: User, lease: Lease, tenant: Tenant) {
  if (lease.tenantUserId === user.id) return true;
  return normalizeEmail(user.email) === normalizeEmail(tenant.email ?? lease.tenantEmail);
}

function userCanUseCandidate(store: AppStore, user: User, lease: Lease, tenant: Tenant) {
  const manager = getLeaseManager(store, lease);
  if (!manager) return false;
  if (user.role === UserRole.MANAGER) return manager.id === user.id;
  if (user.role === UserRole.TENANT) return isTenantParticipant(store, user, lease, tenant);
  return false;
}

function getDiscussionCandidates(store: AppStore, user: User) {
  return store.leases.flatMap((lease) => {
    const property = getLeaseProperty(store, lease);
    const unit = getLeaseUnit(store, lease);
    const manager = getLeaseManager(store, lease);
    if (!property || !manager) return [];

    return getLeaseTenants(store, lease)
      .filter((tenant) => userCanUseCandidate(store, user, lease, tenant))
      .map((tenant) => {
        const tenantUser = getTenantUser(store, lease, tenant);
        const thread = getThreadForCandidate(store, lease.id, tenant.id, manager.id);
        const threadMessages = thread ? store.discussionMessages.filter((message) => message.threadId === thread.id) : [];
        const lastMessage = [...threadMessages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        const subject = `${tenantName(tenant)} at ${property.name}${unit?.unitNumber ? ` Unit ${unit.unitNumber}` : ""}`;
        const key = getConversationKey(lease.id, tenant.id);
        const href = `/messages?conversation=${encodeURIComponent(key)}`;
        const hasUnread = store.notifications.some(
          (notification) => notification.userId === user.id && notification.href === href && notification.isRead !== true
        );

        return {
          key,
          leaseId: lease.id,
          tenantId: tenant.id,
          threadId: thread?.id,
          subject,
          description: [property.name, unit?.unitNumber ? `Unit ${unit.unitNumber}` : null].filter(Boolean).join(" / "),
          propertyName: property.name,
          unitNumber: unit?.unitNumber,
          managerName: fullName(manager),
          tenantName: tenantName(tenant),
          tenantEmail: tenant.email ?? lease.tenantEmail,
          lastMessageAt: lastMessage?.createdAt ?? thread?.updatedAt,
          lastMessageBody: lastMessage?.body,
          messageCount: threadMessages.length,
          hasUnread,
          managerUserId: manager.id,
          tenantUserId: tenantUser?.id,
          propertyId: property.id,
          unitId: unit?.id
        };
      });
  });
}

function toPublicConversation(candidate: ReturnType<typeof getDiscussionCandidates>[number]): DiscussionConversation {
  return {
    key: candidate.key,
    leaseId: candidate.leaseId,
    tenantId: candidate.tenantId,
    threadId: candidate.threadId,
    subject: candidate.subject,
    description: candidate.description,
    propertyName: candidate.propertyName,
    unitNumber: candidate.unitNumber,
    managerName: candidate.managerName,
    tenantName: candidate.tenantName,
    tenantEmail: candidate.tenantEmail,
    lastMessageAt: candidate.lastMessageAt,
    lastMessageBody: candidate.lastMessageBody,
    messageCount: candidate.messageCount,
    hasUnread: candidate.hasUnread
  };
}

function getSender(store: AppStore, senderUserId: string) {
  return store.users.find((user) => user.id === senderUserId) ?? null;
}

function getThreadMessages(store: AppStore, threadId: string, currentUserId: string): DiscussionMessageView[] {
  return store.discussionMessages
    .filter((message) => message.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((message) => {
      const sender = getSender(store, message.senderUserId);
      return {
        ...message,
        senderName: fullName(sender),
        senderRole: sender?.role ?? UserRole.MANAGER,
        isCurrentUser: message.senderUserId === currentUserId
      };
    });
}

export async function getDiscussionPageData(user: User, selectedKey?: string): Promise<DiscussionPageData> {
  const store = await readStore();
  const candidates = getDiscussionCandidates(store, user).sort((a, b) => {
    const dateSort = String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? ""));
    return dateSort || a.subject.localeCompare(b.subject);
  });
  const selectedCandidate = candidates.find((candidate) => candidate.key === selectedKey) ?? candidates[0] ?? null;

  return {
    conversations: candidates.map(toPublicConversation),
    selectedConversation: selectedCandidate ? toPublicConversation(selectedCandidate) : null,
    messages: selectedCandidate?.threadId ? getThreadMessages(store, selectedCandidate.threadId, user.id) : []
  };
}

export async function markDiscussionConversationRead(user: User, conversationKey: string) {
  await updateStore((store) => {
    const canAccessConversation = getDiscussionCandidates(store, user).some((candidate) => candidate.key === conversationKey);
    if (!canAccessConversation) return store;

    const href = `/messages?conversation=${encodeURIComponent(conversationKey)}`;
    const result = markConversationNotificationsRead(store.notifications, user.id, href);

    return result.changed ? { ...store, notifications: result.notifications } : store;
  });
}

export async function sendDiscussionMessage({
  user,
  leaseId,
  tenantId,
  body
}: {
  user: User;
  leaseId: string;
  tenantId: string;
  body: string;
}) {
  const cleanBody = body.replace(/\s+/g, " ").trim();
  if (cleanBody.length < 1 || cleanBody.length > 2000) {
    throw new Error("Message must be between 1 and 2,000 characters.");
  }

  let threadKey = getConversationKey(leaseId, tenantId);
  let threadId = "";

  await updateStore((store) => {
    const lease = store.leases.find((item) => item.id === leaseId);
    const tenant = store.tenants.find((item) => item.id === tenantId);
    if (!lease || !tenant || !userCanUseCandidate(store, user, lease, tenant)) {
      throw new Error("You do not have access to this discussion.");
    }

    const property = getLeaseProperty(store, lease);
    const unit = getLeaseUnit(store, lease);
    const manager = getLeaseManager(store, lease);
    if (!property || !manager) {
      throw new Error("This lease is missing a manager or property.");
    }

    const tenantUser = getTenantUser(store, lease, tenant);
    const now = nowIso();
    const existingThread = getThreadForCandidate(store, lease.id, tenant.id, manager.id);
    const thread: DiscussionThread =
      existingThread ??
      {
        id: createId("thread"),
        organizationId: user.organizationId,
        managerUserId: manager.id,
        tenantId: tenant.id,
        tenantUserId: tenantUser?.id,
        leaseId: lease.id,
        propertyId: property.id,
        unitId: unit?.id,
        subject: `${tenantName(tenant)} at ${property.name}${unit?.unitNumber ? ` Unit ${unit.unitNumber}` : ""}`,
        createdAt: now,
        updatedAt: now
      };

    threadKey = getConversationKey(thread.leaseId, thread.tenantId);
    threadId = thread.id;
    const message: DiscussionMessage = {
      id: createId("msg"),
      threadId: thread.id,
      organizationId: user.organizationId,
      senderUserId: user.id,
      body: cleanBody,
      createdAt: now
    };
    const recipientUserId = user.role === UserRole.TENANT ? manager.id : tenantUser?.id;
    const notification = recipientUserId
      ? {
          id: createId("note"),
          organizationId: user.organizationId,
          userId: recipientUserId,
          type: "SYSTEM" as const,
          title: "New discussion message",
          body: `${fullName(user)} sent a message about ${thread.subject}.`,
          href: `/messages?conversation=${encodeURIComponent(threadKey)}`,
          isRead: false,
          createdAt: now
        }
      : null;

    return {
      ...store,
      discussionThreads: existingThread
        ? store.discussionThreads.map((item) => (item.id === thread.id ? { ...item, tenantUserId: item.tenantUserId ?? tenantUser?.id, updatedAt: now } : item))
        : [...store.discussionThreads, thread],
      discussionMessages: [...store.discussionMessages, message],
      notifications: notification ? [...store.notifications, notification] : store.notifications
    };
  });

  return { threadId, conversationKey: threadKey };
}
